import "dotenv/config";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { spawn } from "child_process";

type DatabaseConfig = {
  database: string;
  username: string;
  password: string;
};

function resolveProjectPath(value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(process.cwd(), value);
}

function parseDatabaseUrl(databaseUrl: string): DatabaseConfig {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "").split("?")[0];

  if (!database || !url.username) {
    throw new Error("DATABASE_URL ไม่ถูกต้อง ไม่พบ database หรือ username");
  }

  return {
    database,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));

  if (matched) {
    return matched.slice(prefix.length);
  }

  const index = process.argv.findIndex((arg) => arg === `--${name}`);

  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
}

function runDockerPgRestore(params: {
  containerName: string;
  database: string;
  username: string;
  password: string;
  inputFile: string;
}) {
  return new Promise<void>((resolve, reject) => {
    const args = [
      "exec",
      "-i",
      "-e",
      `PGPASSWORD=${params.password}`,
      params.containerName,
      "pg_restore",
      "-U",
      params.username,
      "-d",
      params.database,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
    ];

    const child = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        if (stdout.trim()) {
          console.log(stdout.trim());
        }

        resolve();
        return;
      }

      reject(
        new Error(
          [
            `pg_restore failed with exit code ${code}`,
            stdout.trim() ? `stdout: ${stdout.trim()}` : "",
            stderr.trim() ? `stderr: ${stderr.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });

    const input = createReadStream(params.inputFile);

    input.on("error", (error) => {
      child.kill();
      reject(error);
    });

    input.pipe(child.stdin);
  });
}

async function main() {
  if (process.env.RESTORE_CONFIRM !== "YES") {
    throw new Error(
      [
        "Restore ถูกบล็อกเพื่อความปลอดภัย",
        "ถ้าต้องการ restore จริง ให้ตั้งค่า RESTORE_CONFIRM=YES ก่อนรันคำสั่ง",
      ].join("\n"),
    );
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
  }

  const inputFileArg = getArgValue("file");

  if (!inputFileArg) {
    throw new Error(
      "กรุณาระบุไฟล์ backup เช่น npm run restore:db -- --file=../backups/backup-xxxx/database.dump",
    );
  }

  const inputFile = resolveProjectPath(inputFileArg);
  const fileInfo = await stat(inputFile);

  if (!fileInfo.isFile()) {
    throw new Error(`ไม่พบไฟล์ backup: ${inputFile}`);
  }

  const databaseConfig = parseDatabaseUrl(databaseUrl);
  const containerName = process.env.POSTGRES_CONTAINER_NAME ?? "hr_postgres";

  console.log("Starting database restore...");
  console.log(`Database: ${databaseConfig.database}`);
  console.log(`Container: ${containerName}`);
  console.log(`Input file: ${inputFile}`);
  console.log("");
  console.log("คำเตือน: คำสั่งนี้จะเขียนทับข้อมูลในฐานข้อมูลปัจจุบัน");
  console.log("");

  await runDockerPgRestore({
    containerName,
    database: databaseConfig.database,
    username: databaseConfig.username,
    password: databaseConfig.password,
    inputFile,
  });

  console.log("");
  console.log("Database restore completed successfully.");
}

main().catch((error) => {
  console.error("");
  console.error("Restore failed:");
  console.error(error);
  process.exitCode = 1;
});