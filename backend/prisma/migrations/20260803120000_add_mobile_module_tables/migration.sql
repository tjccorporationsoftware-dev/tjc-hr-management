-- MobileModule — Additive schema changes (Phase 0 / BE-MOB-004, BE-MOB-005)
-- ------------------------------------------------------------------
-- ตาม ADR-001: ห้ามสร้างสำเนาข้อมูลธุรกิจสำหรับ Mobile
-- migration นี้จึงเพิ่มเฉพาะ
--   1) metadata ของ session ฝั่งมือถือ (ผูกกับเครื่อง) ลงตาราง UserSession เดิม
--   2) ทะเบียนเครื่อง/Push token
--   3) ซองกัน mutation ซ้ำ (idempotency)
--
-- ทุกคอลัมน์ที่เพิ่มใน UserSession เป็น nullable หรือมี default
-- เว็บเวอร์ชันก่อนหน้าที่ยัง deploy อยู่จึงเขียน/อ่านตารางนี้ได้ตามเดิม (rolling deploy ปลอดภัย)

-- 1) UserSession: mobile session metadata
ALTER TABLE "UserSession" ADD COLUMN "installationId" TEXT;
ALTER TABLE "UserSession" ADD COLUMN "platform" TEXT;
ALTER TABLE "UserSession" ADD COLUMN "appVersion" TEXT;
ALTER TABLE "UserSession" ADD COLUMN "appBuild" INTEGER;
ALTER TABLE "UserSession" ADD COLUMN "sessionType" TEXT NOT NULL DEFAULT 'WEB';
ALTER TABLE "UserSession" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE INDEX "UserSession_installationId_idx" ON "UserSession"("installationId");

-- 2) ทะเบียนเครื่อง + Push token
CREATE TABLE "mobile_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceModel" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "appBuild" INTEGER,
    "expoPushToken" TEXT,
    "pushStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "notificationPermission" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "locale" TEXT,
    "timezone" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "lastUserAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_devices_installationId_key" ON "mobile_devices"("installationId");
CREATE INDEX "mobile_devices_userId_idx" ON "mobile_devices"("userId");
CREATE INDEX "mobile_devices_expoPushToken_idx" ON "mobile_devices"("expoPushToken");
CREATE INDEX "mobile_devices_revokedAt_idx" ON "mobile_devices"("revokedAt");

ALTER TABLE "mobile_devices"
    ADD CONSTRAINT "mobile_devices_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Idempotency
CREATE TABLE "mobile_idempotency_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_idempotency_records_userId_scope_key_key"
    ON "mobile_idempotency_records"("userId", "scope", "key");
CREATE INDEX "mobile_idempotency_records_expiresAt_idx"
    ON "mobile_idempotency_records"("expiresAt");

ALTER TABLE "mobile_idempotency_records"
    ADD CONSTRAINT "mobile_idempotency_records_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
