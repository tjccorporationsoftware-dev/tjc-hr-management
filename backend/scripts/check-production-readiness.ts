import "dotenv/config";
import { access, stat } from "fs/promises";
import path from "path";

type CheckStatus = "PASS" | "WARN" | "FAIL";

type CheckResult = {
  status: CheckStatus;
  key: string;
  message: string;
};

const results: CheckResult[] = [];

function add(status: CheckStatus, key: string, message: string) {
  results.push({ status, key, message });
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isHttps(value: string) {
  return value.startsWith("https://");
}

function hasLocalhost(value: string) {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("0.0.0.0")
  );
}

function isWeak(value: string | undefined) {
  if (!value) return true;

  const weakValues = [
    "change_this_access_secret",
    "change_this_refresh_secret",
    "secret",
    "password",
    "admin",
    "123456",
    "Admin@123456",
    "hr_minio_password",
  ];

  return weakValues.includes(value) || value.length < 24;
}

function resolveProjectPath(value: string) {
  if (path.isAbsolute(value)) return value;
  return path.resolve(process.cwd(), value);
}

async function pathExists(value: string) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function checkDirectory(key: string, value: string | undefined) {
  const dir = resolveProjectPath(value ?? "");

  if (!value) {
    add("WARN", key, `${key} is not configured`);
    return;
  }

  const exists = await pathExists(dir);

  if (!exists) {
    add("WARN", key, `${key} directory does not exist yet: ${dir}`);
    return;
  }

  const info = await stat(dir);

  if (!info.isDirectory()) {
    add("FAIL", key, `${key} exists but is not a directory: ${dir}`);
    return;
  }

  add("PASS", key, `${key} directory exists: ${dir}`);
}

function checkRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    add("FAIL", key, `${key} is required`);
    return null;
  }

  add("PASS", key, `${key} is configured`);
  return value;
}

function checkSecret(key: string, minLength: number) {
  const value = process.env[key];

  if (!value) {
    add("FAIL", key, `${key} is required`);
    return;
  }

  if (value.length < minLength) {
    add("FAIL", key, `${key} must be at least ${minLength} characters`);
    return;
  }

  if (isWeak(value)) {
    add("FAIL", key, `${key} looks weak or default`);
    return;
  }

  add("PASS", key, `${key} looks strong enough`);
}

function checkFrontendUrl() {
  const raw = checkRequiredEnv("FRONTEND_URL");

  if (!raw) return;

  const origins = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    add("FAIL", "FRONTEND_URL", "FRONTEND_URL has no valid origin");
    return;
  }

  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      add("FAIL", "FRONTEND_URL", `Invalid origin: ${origin}`);
      continue;
    }

    if (isProduction() && !isHttps(origin)) {
      add("FAIL", "FRONTEND_URL", `Production origin must use HTTPS: ${origin}`);
      continue;
    }

    if (isProduction() && hasLocalhost(origin)) {
      add("FAIL", "FRONTEND_URL", `Production origin must not be localhost: ${origin}`);
      continue;
    }

    add("PASS", "FRONTEND_URL", `Allowed origin: ${origin}`);
  }
}

function checkTokenDurations() {
  const accessTokenExpires = process.env.ACCESS_TOKEN_EXPIRES_IN ?? "";
  const refreshTokenExpires = process.env.REFRESH_TOKEN_EXPIRES_IN ?? "";

  if (isProduction() && accessTokenExpires && !accessTokenExpires.endsWith("m")) {
    add(
      "WARN",
      "ACCESS_TOKEN_EXPIRES_IN",
      "Production access token should be short, recommended 15m-30m",
    );
  } else {
    add("PASS", "ACCESS_TOKEN_EXPIRES_IN", `ACCESS_TOKEN_EXPIRES_IN=${accessTokenExpires || "default"}`);
  }

  add("PASS", "REFRESH_TOKEN_EXPIRES_IN", `REFRESH_TOKEN_EXPIRES_IN=${refreshTokenExpires || "default"}`);
}

function checkProductionFlags() {
  if (!isProduction()) {
    add("WARN", "NODE_ENV", "NODE_ENV is not production; production-only checks are relaxed");
    return;
  }

  add("PASS", "NODE_ENV", "NODE_ENV=production");

  if (process.env.TRUST_PROXY !== "true") {
    add("FAIL", "TRUST_PROXY", "TRUST_PROXY should be true behind reverse proxy in production");
  } else {
    add("PASS", "TRUST_PROXY", "TRUST_PROXY=true");
  }

  if (process.env.TWO_FACTOR_DEV_SHOW_CODE === "true") {
    add("FAIL", "TWO_FACTOR_DEV_SHOW_CODE", "Must be false in production");
  } else {
    add("PASS", "TWO_FACTOR_DEV_SHOW_CODE", "2FA debug code is disabled");
  }

  if (!process.env.MONITORING_METRICS_TOKEN || process.env.MONITORING_METRICS_TOKEN.length < 32) {
    add("FAIL", "MONITORING_METRICS_TOKEN", "Must be at least 32 characters in production");
  } else {
    add("PASS", "MONITORING_METRICS_TOKEN", "Monitoring token is configured");
  }

  /*
   * 2FA ยังไม่มีช่องทางส่งรหัสให้ผู้ใช้ (ไม่มีทั้ง TOTP อีเมล และ SMS)
   * เปิดตอนนี้ = บัญชีที่เข้าเงื่อนไขล็อกอินไม่ได้ถาวร ต้องไปแก้ที่ฐานข้อมูล
   * ตัวเซิร์ฟเวอร์เองก็ปฏิเสธไม่ยอมบูตอยู่แล้ว (config/env.validation.ts)
   * แต่ควรจับให้ได้ตั้งแต่ตอนตรวจก่อน deploy จะได้ไม่เสียเวลารอ container ตาย
   */
  if (process.env.TWO_FACTOR_ENABLED === "true") {
    add(
      "FAIL",
      "TWO_FACTOR_ENABLED",
      "ยังเปิด 2FA ไม่ได้จนกว่าจะทำ OTP delivery — เซิร์ฟเวอร์จะไม่ยอมบูต",
    );
  } else {
    add("PASS", "TWO_FACTOR_ENABLED", "2FA ปิดไว้ตามที่ตกลง (รอเฟส TOTP)");
  }

  if (process.env.COOKIE_SECURE === "false") {
    add(
      "FAIL",
      "COOKIE_SECURE",
      "COOKIE_SECURE=false ทำให้ refresh token ถูกส่งผ่าน HTTP แบบไม่เข้ารหัส",
    );
  } else {
    add("PASS", "COOKIE_SECURE", "Refresh cookie ตั้งค่า secure ไว้");
  }

  /*
   * เครื่องสแกนลายนิ้วมือยิงเข้า /iclock/* โดยตรง
   * DevicePushGuard ปฏิเสธทุกคำขอบน production ถ้าไม่ได้ตั้ง token (fail closed)
   * ซึ่งถูกต้องแล้ว แต่ผลคือข้อมูลลงเวลาหยุดไหลเงียบ ๆ โดยไม่มีใครสังเกต
   * จนกว่าจะถึงสิ้นเดือนตอนปิดงวด — ต้องจับให้ได้ก่อน deploy
   */
  if (!process.env.ATTENDANCE_DEVICE_PUSH_TOKEN) {
    add(
      "WARN",
      "ATTENDANCE_DEVICE_PUSH_TOKEN",
      "ยังไม่ได้ตั้ง — ถ้าใช้เครื่องสแกน ข้อมูลลงเวลาจะถูกปฏิเสธทั้งหมด",
    );
  } else if (process.env.ATTENDANCE_DEVICE_PUSH_TOKEN.length < 24) {
    add(
      "FAIL",
      "ATTENDANCE_DEVICE_PUSH_TOKEN",
      "สั้นเกินไป ควรยาวอย่างน้อย 24 ตัวอักษร",
    );
  } else if (!process.env.ATTENDANCE_DEVICE_PUSH_ALLOWED_IPS?.trim()) {
    add(
      "WARN",
      "ATTENDANCE_DEVICE_PUSH_ALLOWED_IPS",
      "ตั้ง token แล้วแต่ยังไม่จำกัด IP ต้นทาง — ควรใส่ IP ของเครื่องสแกนไว้อีกชั้น",
    );
  } else {
    add("PASS", "ATTENDANCE_DEVICE_PUSH_TOKEN", "เครื่องสแกนยืนยันตัวตนด้วย token + IP allowlist");
  }
}

function checkServiceEnv() {
  checkRequiredEnv("DATABASE_URL");
  checkRequiredEnv("REDIS_HOST");
  checkRequiredEnv("REDIS_PORT");

  /*
   * ระบบเก็บไฟล์ลงดิสก์ ไม่ได้ใช้ object storage
   * จุดที่พลาดง่ายคือ UPLOAD_DIR ไม่ได้ mount เป็นที่เก็บถาวร
   * ไฟล์แนบใบลาและเอกสารพนักงานจะหายทุกครั้งที่ deploy ใหม่
   * โดยที่ฐานข้อมูลยังชี้ไปหาไฟล์เหล่านั้นอยู่
   */
  if (!process.env.UPLOAD_DIR) {
    add(
      "WARN",
      "UPLOAD_DIR",
      "UPLOAD_DIR is not configured — ต้องแน่ใจว่าค่าเริ่มต้น ./uploads ถูก mount เป็นที่เก็บถาวร",
    );
  } else {
    add("PASS", "UPLOAD_DIR", `UPLOAD_DIR=${process.env.UPLOAD_DIR}`);
  }
}

function checkSeedAdmin() {
  if (!isProduction()) {
    add("WARN", "SEED_ADMIN_PASSWORD", "Default seed admin may be acceptable only in development");
    return;
  }

  if (!process.env.SEED_ADMIN_PASSWORD) {
    add("WARN", "SEED_ADMIN_PASSWORD", "SEED_ADMIN_PASSWORD is not configured");
    return;
  }

  if (isWeak(process.env.SEED_ADMIN_PASSWORD)) {
    add("FAIL", "SEED_ADMIN_PASSWORD", "Seed admin password is weak/default");
    return;
  }

  add("PASS", "SEED_ADMIN_PASSWORD", "Seed admin password is not default");
}

async function main() {
  console.log("");
  console.log("HR Workforce Production Readiness Check");
  console.log("--------------------------------------");

  checkProductionFlags();
  checkRequiredEnv("PORT");
  checkFrontendUrl();
  checkSecret("JWT_ACCESS_SECRET", 32);
  checkSecret("JWT_REFRESH_SECRET", 48);
  checkTokenDurations();
  checkServiceEnv();
  checkSeedAdmin();

  await checkDirectory("STORAGE_DIR", process.env.STORAGE_DIR ?? "./storage");
  await checkDirectory("BACKUP_DIR", process.env.BACKUP_DIR ?? "../backups");
  await checkDirectory("CLEANUP_LOG_DIR", process.env.CLEANUP_LOG_DIR ?? "../cleanup-logs");

  const passCount = results.filter((item) => item.status === "PASS").length;
  const warnCount = results.filter((item) => item.status === "WARN").length;
  const failCount = results.filter((item) => item.status === "FAIL").length;

  for (const result of results) {
    const prefix =
      result.status === "PASS"
        ? "✅"
        : result.status === "WARN"
          ? "⚠️"
          : "❌";

    console.log(`${prefix} [${result.status}] ${result.key}: ${result.message}`);
  }

  console.log("");
  console.log(`Summary: PASS=${passCount}, WARN=${warnCount}, FAIL=${failCount}`);

  if (failCount > 0) {
    console.log("");
    console.log("Production readiness check failed.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Production readiness check passed.");
}

main().catch((error) => {
  console.error("Production readiness check crashed:");
  console.error(error);
  process.exitCode = 1;
});