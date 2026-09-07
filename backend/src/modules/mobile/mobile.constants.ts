/**
 * MobileModule constants
 * ----------------------
 * ค่าคงที่ที่ Mobile ใช้ร่วมกัน — ทุกค่าอ่านทับได้ผ่าน env เพื่อไม่ต้อง deploy ใหม่
 * เวลาปรับนโยบายเวอร์ชันแอปหรืออายุ idempotency
 */

/** Prefix ของ Contract ฝั่ง Native App — ขึ้น v2 เมื่อมี breaking change เท่านั้น */
export const MOBILE_API_PREFIX = 'mobile/v1';

/** Scope ของ Idempotency Key แยกตามฟีเจอร์ ไม่ให้ key ชนกันข้ามงาน */
export const MOBILE_IDEMPOTENCY_SCOPES = {
  approvalMutation: 'approvals:mutation',
  attendancePunch: 'attendance:punch',
  complaintMutation: 'complaints:mutation',
  documentMutation: 'documents:mutation',
  requestAttachmentMutation: 'requests:attachments:mutation',
  requestMutation: 'requests:mutation',
} as const;

/** Header ที่ Native App ต้องส่งมาทุก request */
export const MOBILE_HEADERS = {
  appBuild: 'x-app-build',
  appVersion: 'x-app-version',
  idempotencyKey: 'idempotency-key',
  installationId: 'x-installation-id',
  osVersion: 'x-os-version',
  platform: 'x-platform',
} as const;

/** Error code ที่ Client map เป็นข้อความ/พฤติกรรมเฉพาะ */
export const MOBILE_ERROR_CODES = {
  appUpdateRequired: 'APP_UPDATE_REQUIRED',
  deviceRevoked: 'DEVICE_REVOKED',
  employeeNotLinked: 'EMPLOYEE_NOT_LINKED',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  idempotencyInProgress: 'IDEMPOTENCY_IN_PROGRESS',
  installationRequired: 'INSTALLATION_REQUIRED',
} as const;

export const MOBILE_PLATFORMS = ['android', 'ios'] as const;
export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];

/** อายุของ Idempotency Record — นานพอให้ retry/offline queue ตามทัน แต่ไม่บวมค้างไว้ */
export const MOBILE_IDEMPOTENCY_TTL_HOURS_DEFAULT = 48;

/** คิวงานบ้านของ Mobile — ตอนนี้มีงานเดียวคือล้าง Idempotency Record ที่หมดอายุ */
export const MOBILE_MAINTENANCE_QUEUE = 'mobile-maintenance';
export const MOBILE_MAINTENANCE_JOB_PURGE_IDEMPOTENCY =
  'purge-expired-idempotency-records';

/** id คงที่ของตารางเวลา — upsert ด้วย id เดิมทำให้หลาย instance ไม่สร้างซ้อนกัน */
export const MOBILE_MAINTENANCE_SCHEDULER_ID = 'mobile-idempotency-cleanup';

/** ค่า default ของนโยบายเวอร์ชันแอป ใช้เมื่อยังไม่ตั้ง env */
export const MOBILE_COMPATIBILITY_DEFAULTS = {
  latestBuild: 1,
  minimumBuild: 1,
} as const;
