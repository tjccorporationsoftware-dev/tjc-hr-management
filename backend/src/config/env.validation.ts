type Env = Record<string, string | undefined>;

const requiredEnvKeys = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "FRONTEND_URL",
] as const;

const weakSecretValues = new Set([
  "change_this_access_secret",
  "change_this_refresh_secret",
  "secret",
  "password",
  "admin",
  "123456",
  "Admin@123456",
  "hr_minio_password",
]);

function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
  key: string,
) {
  const parsed = Number(value ?? fallback);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a valid positive number`);
  }

  return parsed;
}

function parseNonNegativeNumber(
  value: string | undefined,
  fallback: number,
  key: string,
) {
  const parsed = Number(value ?? fallback);

  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${key} must be a valid number >= 0`);
  }

  return parsed;
}

function isLocalhostUrl(value: string) {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("0.0.0.0")
  );
}

function isHttpsUrl(value: string) {
  return value.startsWith("https://");
}

function validateFrontendUrl(value: string, isProduction: boolean) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error("FRONTEND_URL must contain at least one origin");
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('FRONTEND_URL must not use wildcard *');
    }

    try {
      new URL(origin);
    } catch {
      throw new Error(`FRONTEND_URL contains invalid URL: ${origin}`);
    }

    if (isProduction) {
      if (!isHttpsUrl(origin)) {
        throw new Error(
          `FRONTEND_URL must use https in production: ${origin}`,
        );
      }

      if (isLocalhostUrl(origin)) {
        throw new Error(
          `FRONTEND_URL must not use localhost in production: ${origin}`,
        );
      }
    }
  }
}

function validateSecret(params: {
  key: string;
  value: string | undefined;
  isProduction: boolean;
  minLength?: number;
}) {
  const { key, value, isProduction, minLength = 32 } = params;

  if (!value) {
    throw new Error(`${key} is required`);
  }

  if (!isProduction) {
    return;
  }

  if (value.length < minLength) {
    throw new Error(`${key} must be at least ${minLength} characters in production`);
  }

  if (weakSecretValues.has(value)) {
    throw new Error(`${key} uses a weak/default value in production`);
  }
}

function validateProductionDuration(params: {
  key: string;
  value: string | undefined;
  maxMinutes: number;
}) {
  const { key, value, maxMinutes } = params;

  if (!value) return;

  const match = value.match(/^(\d+)(m|h|d)$/);

  if (!match) {
    throw new Error(`${key} must use duration format like 15m, 8h, 7d`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const minutes =
    unit === "m" ? amount : unit === "h" ? amount * 60 : amount * 24 * 60;

  if (minutes > maxMinutes) {
    throw new Error(`${key} must be <= ${maxMinutes} minutes in production`);
  }
}

export function validateEnv(config: Env) {
  const missingKeys = requiredEnvKeys.filter((key) => !config[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Missing required env: ${missingKeys.join(", ")}`);
  }

  const nodeEnv = config.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";

  const port = parsePositiveNumber(config.PORT, 4000, "PORT");
  const loginMaxFailedAttempts = parsePositiveNumber(
    config.LOGIN_MAX_FAILED_ATTEMPTS,
    5,
    "LOGIN_MAX_FAILED_ATTEMPTS",
  );
  const loginLockMinutes = parsePositiveNumber(
    config.LOGIN_LOCK_MINUTES,
    15,
    "LOGIN_LOCK_MINUTES",
  );
  const twoFactorCodeExpiresMinutes = parsePositiveNumber(
    config.TWO_FACTOR_CODE_EXPIRES_MINUTES,
    5,
    "TWO_FACTOR_CODE_EXPIRES_MINUTES",
  );
  const backupKeepDays = parseNonNegativeNumber(
    config.BACKUP_KEEP_DAYS,
    14,
    "BACKUP_KEEP_DAYS",
  );
  const exportFileKeepDays = parseNonNegativeNumber(
    config.EXPORT_FILE_KEEP_DAYS,
    30,
    "EXPORT_FILE_KEEP_DAYS",
  );
  const tempFileKeepDays = parseNonNegativeNumber(
    config.TEMP_FILE_KEEP_DAYS,
    7,
    "TEMP_FILE_KEEP_DAYS",
  );
  const generalStorageKeepDays = parseNonNegativeNumber(
    config.GENERAL_STORAGE_KEEP_DAYS,
    180,
    "GENERAL_STORAGE_KEEP_DAYS",
  );

  // AuditLog แยกอายุเป็นสองชั้น เพราะสองกลุ่มนี้มีเหตุผลในการเก็บต่างกัน
  // - VIEW/อ่านอย่างเดียว: ไว้ไล่ปัญหาระยะสั้น ไม่ใช่หลักฐาน และคิดเป็น ~95%
  //   ของแถวทั้งหมด ถ้าไม่ลบตารางจะโตจนกลบ log ที่สำคัญจริง
  // - การแก้ไข/อนุมัติ/ส่งออก และเหตุการณ์ล็อกอิน: เป็นร่องรอยที่ต้องใช้ตรวจสอบ
  //   ย้อนหลัง เก็บยาวกว่า
  const auditViewKeepDays = parseNonNegativeNumber(
    config.AUDIT_VIEW_KEEP_DAYS,
    30,
    "AUDIT_VIEW_KEEP_DAYS",
  );
  const auditMutationKeepDays = parseNonNegativeNumber(
    config.AUDIT_MUTATION_KEEP_DAYS,
    365,
    "AUDIT_MUTATION_KEEP_DAYS",
  );

  validateFrontendUrl(config.FRONTEND_URL ?? "", isProduction);

  validateSecret({
    key: "JWT_ACCESS_SECRET",
    value: config.JWT_ACCESS_SECRET,
    isProduction,
    minLength: 32,
  });

  validateSecret({
    key: "JWT_REFRESH_SECRET",
    value: config.JWT_REFRESH_SECRET,
    isProduction,
    minLength: 48,
  });

  if (isProduction) {
    validateProductionDuration({
      key: "ACCESS_TOKEN_EXPIRES_IN",
      value: config.ACCESS_TOKEN_EXPIRES_IN ?? "15m",
      maxMinutes: 30,
    });

    validateProductionDuration({
      key: "REFRESH_TOKEN_EXPIRES_IN",
      value: config.REFRESH_TOKEN_EXPIRES_IN ?? "7d",
      maxMinutes: 60 * 24 * 14,
    });

    if (!config.MONITORING_METRICS_TOKEN || config.MONITORING_METRICS_TOKEN.length < 32) {
      throw new Error(
        "MONITORING_METRICS_TOKEN must be at least 32 characters in production",
      );
    }

    /*
     * โทเคนของเครื่องสแกนลงเวลา ปล่อยว่างได้ถ้ายังไม่ใช้เครื่อง
     * (DevicePushGuard ปฏิเสธ /iclock/* ทั้งหมดอยู่แล้วเมื่อไม่ได้ตั้ง)
     * แต่ถ้าตั้งไว้ต้องยาวพอจะเดาไม่ได้ เพราะคนที่เดาถูกสร้างรายการลงเวลาปลอม
     * ให้พนักงานคนไหนก็ได้ และรายการนั้นไหลต่อไปถึงการคำนวณเงินเดือน
     *
     * เกณฑ์ 24 ตัวต้องตรงกับ scripts/check-production-readiness.ts
     * ไม่งั้นจะมีช่วงที่ตรวจก่อน deploy ผ่านแต่เซิร์ฟเวอร์บูตไม่ขึ้น
     */
    if (
      config.ATTENDANCE_DEVICE_PUSH_TOKEN &&
      config.ATTENDANCE_DEVICE_PUSH_TOKEN.length < 24
    ) {
      throw new Error(
        "ATTENDANCE_DEVICE_PUSH_TOKEN must be at least 24 characters in production",
      );
    }

    if (config.TWO_FACTOR_DEV_SHOW_CODE === "true") {
      throw new Error("TWO_FACTOR_DEV_SHOW_CODE must not be true in production");
    }

    /*
     * กันไม่ให้เปิด 2FA ก่อนที่จะมีช่องทางส่งรหัสจริง
     *
     * ตอนนี้รหัส 6 หลักถูกส่งกลับหน้าเว็บผ่าน debugTwoFactorCode เท่านั้น
     * ซึ่งปิดตายบน production ถ้าเปิดบังคับ 2FA ในสภาพนี้ ผู้ใช้ที่เข้าเงื่อนไข
     * จะล็อกอินไม่ได้ถาวรและไม่มีบัญชีสำรองให้เข้าไปแก้ — ต้องไปแก้ที่ฐานข้อมูล
     *
     * ยอมให้เซิร์ฟเวอร์ไม่บูตพร้อมข้อความชัด ๆ ดีกว่าปล่อยให้บูตผ่าน
     * แล้วไปพังตอนผู้ดูแลระบบล็อกอินวันแรก
     *
     * ลบเงื่อนไขนี้ทิ้งได้เมื่อทำ TOTP หรือ OTP ทางอีเมลเสร็จ
     */
    if (config.TWO_FACTOR_ENABLED === "true") {
      throw new Error(
        "TWO_FACTOR_ENABLED=true ยังใช้บน production ไม่ได้ เพราะระบบยังไม่มีช่องทางส่งรหัส 2FA " +
          "(ไม่มีทั้ง TOTP, อีเมล และ SMS) เปิดแล้วผู้ใช้ที่เข้าเงื่อนไขจะล็อกอินไม่ได้ถาวร — " +
          "ต้องทำ OTP delivery ให้เสร็จก่อน แล้วค่อยลบด่านนี้ออก",
      );
    }

    if (config.SEED_ADMIN_PASSWORD && weakSecretValues.has(config.SEED_ADMIN_PASSWORD)) {
      throw new Error("SEED_ADMIN_PASSWORD uses a weak/default value in production");
    }

  }

  return {
    ...config,

    NODE_ENV: nodeEnv,
    PORT: String(port),

    ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN ?? "15m",
    REFRESH_TOKEN_EXPIRES_IN: config.REFRESH_TOKEN_EXPIRES_IN ?? "7d",

    LOGIN_MAX_FAILED_ATTEMPTS: String(loginMaxFailedAttempts),
    LOGIN_LOCK_MINUTES: String(loginLockMinutes),

    TWO_FACTOR_CODE_EXPIRES_MINUTES: String(twoFactorCodeExpiresMinutes),
    TWO_FACTOR_REQUIRED_ROLE_CODES:
      config.TWO_FACTOR_REQUIRED_ROLE_CODES ??
      "SYSTEM_ADMIN,HR_ADMIN,PAYROLL_ACCOUNTING",
    TWO_FACTOR_DEV_SHOW_CODE:
      config.TWO_FACTOR_DEV_SHOW_CODE ?? (isProduction ? "false" : "true"),

    RATE_LIMIT_ENABLED: config.RATE_LIMIT_ENABLED ?? "true",
    RATE_LIMIT_REDIS_ENABLED: config.RATE_LIMIT_REDIS_ENABLED ?? "true",
    RATE_LIMIT_KEY_PREFIX: config.RATE_LIMIT_KEY_PREFIX ?? "hr:rate-limit",

    TRUST_PROXY: config.TRUST_PROXY ?? (isProduction ? "true" : "false"),
    REQUEST_BODY_LIMIT: config.REQUEST_BODY_LIMIT ?? "2mb",
    SECURITY_HEADERS_ENABLED: config.SECURITY_HEADERS_ENABLED ?? "true",

    MONITORING_REDIS_CHECK_ENABLED:
      config.MONITORING_REDIS_CHECK_ENABLED ?? "true",
    MONITORING_METRICS_TOKEN: config.MONITORING_METRICS_TOKEN ?? "",

    BACKUP_DIR: config.BACKUP_DIR ?? "../backups",
    BACKUP_KEEP_DAYS: String(backupKeepDays),
    BACKUP_INCLUDE_STORAGE: config.BACKUP_INCLUDE_STORAGE ?? "true",
    STORAGE_DIR: config.STORAGE_DIR ?? "./storage",
    POSTGRES_CONTAINER_NAME: config.POSTGRES_CONTAINER_NAME ?? "hr_postgres",

    CLEANUP_STORAGE_ENABLED: config.CLEANUP_STORAGE_ENABLED ?? "true",
    CLEANUP_DRY_RUN_DEFAULT: config.CLEANUP_DRY_RUN_DEFAULT ?? "true",
    EXPORT_FILE_KEEP_DAYS: String(exportFileKeepDays),
    TEMP_FILE_KEEP_DAYS: String(tempFileKeepDays),
    GENERAL_STORAGE_KEEP_DAYS: String(generalStorageKeepDays),
    EXPORT_STORAGE_DIR: config.EXPORT_STORAGE_DIR ?? "./storage/report-exports",
    TEMP_STORAGE_DIR: config.TEMP_STORAGE_DIR ?? "./storage/tmp",
    CLEANUP_LOG_DIR: config.CLEANUP_LOG_DIR ?? "../cleanup-logs",

    AUDIT_VIEW_ENABLED: config.AUDIT_VIEW_ENABLED ?? "true",
    AUDIT_VIEW_KEEP_DAYS: String(auditViewKeepDays),
    AUDIT_MUTATION_KEEP_DAYS: String(auditMutationKeepDays),
  };
}