import "dotenv/config";
import {
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import path from "path";

type CleanupMode = "exports" | "temp" | "storage";

type CleanupTarget = {
  mode: CleanupMode;
  label: string;
  dir: string;
  keepDays: number;
};

type CleanupFileResult = {
  filePath: string;
  relativePath: string;
  sizeBytes: number;
  mtime: string;
  ageDays: number;
  status: "deleted" | "dry-run" | "skipped" | "failed";
  reason?: string;
};

type CleanupManifest = {
  version: 1;
  createdAt: string;
  mode: CleanupMode;
  dryRun: boolean;
  targetDir: string;
  keepDays: number;
  deletedCount: number;
  dryRunCount: number;
  skippedCount: number;
  failedCount: number;
  totalSizeBytesMatched: number;
  totalSizeBytesDeleted: number;
  results: CleanupFileResult[];
};

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

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function resolveProjectPath(value: string) {
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }

  return path.resolve(process.cwd(), value);
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getNumberEnv(key: string, fallback: number) {
  const value = Number(process.env[key] ?? fallback);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a valid number >= 0`);
  }

  return value;
}

function getMode(): CleanupMode {
  const raw = (getArgValue("mode") ?? "exports").toLowerCase();

  if (raw === "exports" || raw === "temp" || raw === "storage") {
    return raw;
  }

  throw new Error("--mode ต้องเป็น exports, temp หรือ storage");
}

function getDryRun() {
  if (hasFlag("execute")) return false;
  if (hasFlag("dry-run")) return true;

  return (process.env.CLEANUP_DRY_RUN_DEFAULT ?? "true") === "true";
}

function getTarget(mode: CleanupMode): CleanupTarget {
  if (mode === "exports") {
    return {
      mode,
      label: "Report export files",
      dir: resolveProjectPath(
        process.env.EXPORT_STORAGE_DIR ?? "./storage/report-exports",
      ),
      keepDays: getNumberEnv("EXPORT_FILE_KEEP_DAYS", 30),
    };
  }

  if (mode === "temp") {
    return {
      mode,
      label: "Temporary files",
      dir: resolveProjectPath(process.env.TEMP_STORAGE_DIR ?? "./storage/tmp"),
      keepDays: getNumberEnv("TEMP_FILE_KEEP_DAYS", 7),
    };
  }

  return {
    mode,
    label: "General storage files",
    dir: resolveProjectPath(process.env.STORAGE_DIR ?? "./storage"),
    keepDays: getNumberEnv("GENERAL_STORAGE_KEEP_DAYS", 180),
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

function assertInsideBaseDir(baseDir: string, targetPath: string) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedTarget = path.resolve(targetPath);
  const relative = path.relative(normalizedBase, normalizedTarget);

  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Unsafe path detected: ${targetPath}`);
  }
}

function shouldSkipFile(fileName: string) {
  const lower = fileName.toLowerCase();

  return (
    lower === ".gitkeep" ||
    lower === "readme.md" ||
    lower === "manifest.json" ||
    lower.endsWith(".lock")
  );
}

async function walkFiles(baseDir: string, currentDir = baseDir): Promise<string[]> {
  const entries = await readdir(currentDir, {
    withFileTypes: true,
  });

  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    assertInsideBaseDir(baseDir, fullPath);

    if (entry.isDirectory()) {
      const nested = await walkFiles(baseDir, fullPath);
      results.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

async function cleanupEmptyDirectories(baseDir: string, currentDir = baseDir) {
  const entries = await readdir(currentDir, {
    withFileTypes: true,
  }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fullPath = path.join(currentDir, entry.name);
    assertInsideBaseDir(baseDir, fullPath);

    await cleanupEmptyDirectories(baseDir, fullPath);

    const afterEntries = await readdir(fullPath).catch(() => []);

    if (afterEntries.length === 0) {
      await rm(fullPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function runCleanup(params: {
  target: CleanupTarget;
  dryRun: boolean;
}) {
  const { target, dryRun } = params;
  const exists = await pathExists(target.dir);

  if (!exists) {
    await mkdir(target.dir, { recursive: true });
  }

  const now = Date.now();
  const keepMs = target.keepDays * 24 * 60 * 60 * 1000;
  const files = await walkFiles(target.dir);
  const results: CleanupFileResult[] = [];

  for (const filePath of files) {
    assertInsideBaseDir(target.dir, filePath);

    const info = await stat(filePath);
    const relativePath = path.relative(target.dir, filePath);
    const ageMs = now - info.mtime.getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    if (shouldSkipFile(path.basename(filePath))) {
      results.push({
        filePath,
        relativePath,
        sizeBytes: info.size,
        mtime: info.mtime.toISOString(),
        ageDays,
        status: "skipped",
        reason: "system file",
      });
      continue;
    }

    if (ageMs < keepMs) {
      results.push({
        filePath,
        relativePath,
        sizeBytes: info.size,
        mtime: info.mtime.toISOString(),
        ageDays,
        status: "skipped",
        reason: `younger than ${target.keepDays} days`,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        filePath,
        relativePath,
        sizeBytes: info.size,
        mtime: info.mtime.toISOString(),
        ageDays,
        status: "dry-run",
      });
      continue;
    }

    try {
      await rm(filePath, {
        force: true,
      });

      results.push({
        filePath,
        relativePath,
        sizeBytes: info.size,
        mtime: info.mtime.toISOString(),
        ageDays,
        status: "deleted",
      });
    } catch (error) {
      results.push({
        filePath,
        relativePath,
        sizeBytes: info.size,
        mtime: info.mtime.toISOString(),
        ageDays,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!dryRun) {
    await cleanupEmptyDirectories(target.dir);
  }

  return results;
}

async function writeManifest(params: {
  target: CleanupTarget;
  dryRun: boolean;
  results: CleanupFileResult[];
}) {
  const logDir = resolveProjectPath(process.env.CLEANUP_LOG_DIR ?? "../cleanup-logs");
  await mkdir(logDir, { recursive: true });

  const deletedResults = params.results.filter((item) => item.status === "deleted");
  const dryRunResults = params.results.filter((item) => item.status === "dry-run");
  const skippedResults = params.results.filter((item) => item.status === "skipped");
  const failedResults = params.results.filter((item) => item.status === "failed");
  const matchedResults = params.results.filter(
    (item) => item.status === "deleted" || item.status === "dry-run",
  );

  const manifest: CleanupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    mode: params.target.mode,
    dryRun: params.dryRun,
    targetDir: params.target.dir,
    keepDays: params.target.keepDays,
    deletedCount: deletedResults.length,
    dryRunCount: dryRunResults.length,
    skippedCount: skippedResults.length,
    failedCount: failedResults.length,
    totalSizeBytesMatched: matchedResults.reduce(
      (sum, item) => sum + item.sizeBytes,
      0,
    ),
    totalSizeBytesDeleted: deletedResults.reduce(
      (sum, item) => sum + item.sizeBytes,
      0,
    ),
    results: params.results,
  };

  const fileName = `cleanup-${params.target.mode}-${getTimestamp()}.json`;
  const filePath = path.join(logDir, fileName);

  await writeFile(filePath, JSON.stringify(manifest, null, 2), "utf8");

  return {
    manifest,
    filePath,
  };
}

async function main() {
  const enabled = (process.env.CLEANUP_STORAGE_ENABLED ?? "true") === "true";

  if (!enabled) {
    console.log("Cleanup is disabled by CLEANUP_STORAGE_ENABLED=false");
    return;
  }

  const mode = getMode();
  const dryRun = getDryRun();
  const target = getTarget(mode);

  console.log("");
  console.log("Storage Cleanup");
  console.log(`Mode: ${target.mode}`);
  console.log(`Target: ${target.label}`);
  console.log(`Directory: ${target.dir}`);
  console.log(`Keep days: ${target.keepDays}`);
  console.log(`Dry run: ${dryRun ? "YES" : "NO"}`);
  console.log("");

  const results = await runCleanup({
    target,
    dryRun,
  });

  const { manifest, filePath } = await writeManifest({
    target,
    dryRun,
    results,
  });

  console.log("Cleanup completed.");
  console.log(`Deleted: ${manifest.deletedCount}`);
  console.log(`Dry-run matched: ${manifest.dryRunCount}`);
  console.log(`Skipped: ${manifest.skippedCount}`);
  console.log(`Failed: ${manifest.failedCount}`);
  console.log(`Matched size: ${manifest.totalSizeBytesMatched} bytes`);
  console.log(`Deleted size: ${manifest.totalSizeBytesDeleted} bytes`);
  console.log(`Manifest: ${filePath}`);
  console.log("");

  if (dryRun) {
    console.log("ตอนนี้เป็น dry-run ยังไม่ได้ลบไฟล์จริง");
    console.log("ถ้าต้องการลบจริง ให้รันพร้อม -- --execute");
  }
}

main().catch((error) => {
  console.error("");
  console.error("Cleanup failed:");
  console.error(error);
  process.exitCode = 1;
});