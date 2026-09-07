import "dotenv/config";
import {
  cp,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { spawn } from "child_process";

type DatabaseConfig = {
  database: string;
  username: string;
  password: string;
  host: string;
  port: string;
};

type BackupManifest = {
  version: 1;
  createdAt: string;
  mode: "full" | "db-only" | "files-only";
  backupName: string;
  backupDir: string;
  database?: {
    fileName: string;
    filePath: string;
    database: string;
    containerName: string;
    format: "pg_dump_custom";
  };
  /**
   * ชุดไฟล์ที่สำรอง — ต้องมีมากกว่าหนึ่งชุด
   *
   * ของเดิมสำรองแค่ STORAGE_DIR (ไฟล์ของระบบ เช่นโลโก้) แต่ไม่แตะ UPLOAD_DIR
   * ซึ่งเป็นที่เก็บไฟล์แนบใบลา ใบรับรองแพทย์ และเอกสารพนักงานทั้งหมด
   * แปลว่ากู้ระบบกลับมาแล้วฐานข้อมูลชี้ไปหาไฟล์ที่ไม่มีอยู่จริง
   */
  files?: Array<{
    label: string;
    sourceDir: string;
    backupDir: string;
    status: "copied" | "skipped";
    reason?: string;
  }>;
  retention: {
    keepDays: number;
    cleanupEnabled: boolean;
  };
};

function resolveProjectPath(value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(process.cwd(), value);
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getBackupMode() {
  const dbOnly = process.argv.includes("--db-only");
  const filesOnly = process.argv.includes("--files-only");

  if (dbOnly && filesOnly) {
    throw new Error("เลือกได้แค่อย่างใดอย่างหนึ่ง: --db-only หรือ --files-only");
  }

  if (dbOnly) return "db-only" as const;
  if (filesOnly) return "files-only" as const;

  return "full" as const;
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
    host: url.hostname || "127.0.0.1",
    port: url.port || "5432",
  };
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * เรียก pg_dump แล้วเทผลลงไฟล์
 *
 * มีสองทางเพราะเครื่องที่รันระบบมีสองแบบ
 *   - PostgreSQL ใน Docker (เครื่องพัฒนา) → ต้อง `docker exec` เข้าไปในคอนเทนเนอร์
 *   - PostgreSQL ติดตั้งบนเครื่อง (เซิร์ฟเวอร์จริงบน Windows) → เรียก pg_dump ตรง ๆ
 *
 * เลือกจาก POSTGRES_CONTAINER_NAME — ตั้งไว้ = ใช้ docker · ปล่อยว่าง = เรียกตรง
 * ของเดิมมีแต่ทาง docker ซึ่งบนเซิร์ฟเวอร์ Windows จะล้มทุกคืนแบบเงียบ ๆ
 * (งานตามตารางจับ error ไว้เอง ไม่มีอะไรเด้งให้เห็นที่หน้าเว็บ)
 *
 * บน Windows ตัว pg_dump มักไม่ได้อยู่ใน PATH ของโปรเซสที่ pm2 ปลุกขึ้นมา
 * จึงตั้งที่อยู่เต็มได้ผ่าน PG_DUMP_PATH
 */
function runPgDump(params: {
  containerName: string;
  database: string;
  username: string;
  password: string;
  host: string;
  port: string;
  outputFile: string;
}) {
  return new Promise<void>((resolve, reject) => {
    const useDocker = params.containerName.trim().length > 0;

    const command = useDocker
      ? "docker"
      : (process.env.PG_DUMP_PATH ?? "pg_dump");

    const dumpArgs = [
      "-U",
      params.username,
      "-d",
      params.database,
      "-Fc",
      "--no-owner",
      "--no-acl",
    ];

    const args = useDocker
      ? [
          "exec",
          "-e",
          `PGPASSWORD=${params.password}`,
          params.containerName.trim(),
          "pg_dump",
          ...dumpArgs,
        ]
      : ["-h", params.host, "-p", params.port, ...dumpArgs];

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      /* เรียกตรงต้องส่งรหัสผ่านทาง env — ห้ามใส่ใน argv เพราะโผล่ในรายการโปรเซส */
      env: useDocker
        ? process.env
        : { ...process.env, PGPASSWORD: params.password },
    });

    const output = createWriteStream(params.outputFile);
    let stderr = "";

    child.stdout.pipe(output);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      output.close();
      reject(error);
    });

    child.on("close", (code) => {
      output.close();

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          [
            `pg_dump failed with exit code ${code}`,
            stderr.trim() ? `stderr: ${stderr.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}

async function backupDatabase(params: {
  backupDir: string;
  databaseConfig: DatabaseConfig;
  containerName: string;
}) {
  const fileName = "database.dump";
  const filePath = path.join(params.backupDir, fileName);

  console.log("Backing up PostgreSQL database...");
  console.log(`Database: ${params.databaseConfig.database}`);
  console.log(
    params.containerName.trim()
      ? `Container: ${params.containerName}`
      : `Host: ${params.databaseConfig.host}:${params.databaseConfig.port} (pg_dump บนเครื่อง)`,
  );
  console.log(`Output: ${filePath}`);

  await runPgDump({
    containerName: params.containerName,
    database: params.databaseConfig.database,
    username: params.databaseConfig.username,
    password: params.databaseConfig.password,
    host: params.databaseConfig.host,
    port: params.databaseConfig.port,
    outputFile: filePath,
  });

  console.log("Database backup completed.");

  return {
    fileName,
    filePath,
  };
}

async function backupFiles(params: {
  label: string;
  sourceDir: string;
  targetDir: string;
}) {
  const exists = await pathExists(params.sourceDir);

  if (!exists) {
    return {
      status: "skipped" as const,
      reason: "source directory not found",
    };
  }

  console.log(`Backing up ${params.label} files...`);
  console.log(`Source: ${params.sourceDir}`);
  console.log(`Output: ${params.targetDir}`);

  await mkdir(path.dirname(params.targetDir), { recursive: true });
  await cp(params.sourceDir, params.targetDir, {
    recursive: true,
    force: true,
  });

  console.log(`${params.label} backup completed.`);

  return {
    status: "copied" as const,
  };
}

async function cleanupOldBackups(params: {
  rootBackupDir: string;
  keepDays: number;
}) {
  if (params.keepDays <= 0) {
    return;
  }

  const exists = await pathExists(params.rootBackupDir);

  if (!exists) {
    return;
  }

  const now = Date.now();
  const maxAgeMs = params.keepDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(params.rootBackupDir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("backup-")) {
      continue;
    }

    const fullPath = path.join(params.rootBackupDir, entry.name);
    const info = await stat(fullPath);
    const ageMs = now - info.mtime.getTime();

    if (ageMs > maxAgeMs) {
      console.log(`Removing old backup: ${fullPath}`);
      await rm(fullPath, {
        recursive: true,
        force: true,
      });
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
  }

  const mode = getBackupMode();
  const backupRootDir = resolveProjectPath(
    process.env.BACKUP_DIR ?? "../backups",
  );
  const backupName = `backup-${getTimestamp()}`;
  const backupDir = path.join(backupRootDir, backupName);
  /*
   * ชุดไฟล์ที่ต้องสำรอง
   *
   * uploads = ไฟล์แนบที่ผู้ใช้อัปโหลด (ใบรับรองแพทย์ เอกสารพนักงาน)
   * storage = ไฟล์ของระบบ (โลโก้บริษัท ฯลฯ)
   *
   * ไม่รวม storage/exports และ storage/temp เพราะเป็นไฟล์ที่สร้างใหม่ได้
   * และมีตัวล้างของตัวเองอยู่แล้ว — สำรองไปก็เปลืองที่เปล่า ๆ
   */
  const fileSets = [
    {
      label: "uploads",
      sourceDir: resolveProjectPath(process.env.UPLOAD_DIR ?? "./uploads"),
      targetDir: path.join(backupDir, "uploads"),
    },
    {
      label: "storage",
      sourceDir: resolveProjectPath(process.env.STORAGE_DIR ?? "./storage"),
      targetDir: path.join(backupDir, "storage"),
    },
  ];
  const containerName = process.env.POSTGRES_CONTAINER_NAME ?? "hr_postgres";
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
  const includeStorage =
    (process.env.BACKUP_INCLUDE_STORAGE ?? "true") === "true";

  if (Number.isNaN(keepDays) || keepDays < 0) {
    throw new Error("BACKUP_KEEP_DAYS must be a valid number");
  }

  await mkdir(backupDir, { recursive: true });

  const databaseConfig = parseDatabaseUrl(databaseUrl);

  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    mode,
    backupName,
    backupDir,
    retention: {
      keepDays,
      cleanupEnabled: keepDays > 0,
    },
  };

  if (mode !== "files-only") {
    const dbBackup = await backupDatabase({
      backupDir,
      databaseConfig,
      containerName,
    });

    manifest.database = {
      fileName: dbBackup.fileName,
      filePath: dbBackup.filePath,
      database: databaseConfig.database,
      containerName,
      format: "pg_dump_custom",
    };
  }

  if (mode !== "db-only" && includeStorage) {
    manifest.files = [];

    for (const fileSet of fileSets) {
      const filesResult = await backupFiles({
        label: fileSet.label,
        sourceDir: fileSet.sourceDir,
        targetDir: fileSet.targetDir,
      });

      manifest.files.push({
        label: fileSet.label,
        sourceDir: fileSet.sourceDir,
        backupDir: fileSet.targetDir,
        status: filesResult.status,
        reason: filesResult.reason,
      });
    }

    /*
     * เตือนเมื่อไม่ได้สำรองไฟล์แนบเลย
     *
     * โฟลเดอร์ไม่มีอยู่จริงเป็นเรื่องปกติในระบบที่เพิ่งตั้ง แต่บนระบบที่ใช้งานแล้ว
     * แปลว่าตั้ง UPLOAD_DIR ไม่ตรงกับที่แอปเขียนจริง ซึ่งจะรู้ตัวตอนต้องกู้เท่านั้น
     */
    const uploads = manifest.files.find((item) => item.label === "uploads");

    if (uploads?.status === "skipped") {
      console.warn("");
      console.warn(
        `[คำเตือน] ไม่ได้สำรองไฟล์แนบของผู้ใช้ — ไม่พบโฟลเดอร์ ${uploads.sourceDir}`,
      );
      console.warn(
        "ถ้าระบบนี้ใช้งานจริงแล้ว ให้ตรวจว่า UPLOAD_DIR ตรงกับที่แอปเขียนไฟล์",
      );
    }
  }

  const manifestPath = path.join(backupDir, "manifest.json");

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  await cleanupOldBackups({
    rootBackupDir: backupRootDir,
    keepDays,
  });

  console.log("");
  console.log("Backup completed successfully.");
  console.log(`Backup folder: ${backupDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error("");
  console.error("Backup failed:");
  console.error(error);
  process.exitCode = 1;
});