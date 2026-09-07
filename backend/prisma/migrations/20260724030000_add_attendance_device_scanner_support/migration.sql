-- รองรับเครื่องสแกนลายนิ้วมือ/ใบหน้า
--
-- migration นี้เป็น additive ล้วน (ADD COLUMN / CREATE TABLE) ไม่มี DROP
-- ข้อมูลอุปกรณ์และจุดลงเวลาเดิมไม่ถูกแตะต้อง
--
-- หมายเหตุ: อย่าใช้ `prisma migrate dev` กับโปรเจกต์นี้ (schema drift อยู่)
-- ใช้ `prisma migrate deploy` เท่านั้น

-- 1) ข้อมูลเชื่อมต่อ + สถานะซิงก์ของเครื่องสแกน
ALTER TABLE "attendance_devices" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "attendance_devices" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "attendance_devices" ADD COLUMN IF NOT EXISTS "port" INTEGER;
ALTER TABLE "attendance_devices" ADD COLUMN IF NOT EXISTS "commKey" TEXT;
ALTER TABLE "attendance_devices" ADD COLUMN IF NOT EXISTS "firmwareVersion" TEXT;
ALTER TABLE "attendance_devices" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "attendance_devices" ADD COLUMN IF NOT EXISTS "lastOnlineAt" TIMESTAMP(3);

-- 2) ผูกพนักงานกับรหัสผู้ใช้ในเครื่อง
CREATE TABLE IF NOT EXISTS "attendance_device_enrollments" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "fingerCount" INTEGER,
    "note" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_device_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attendance_device_enrollments_deviceId_idx" ON "attendance_device_enrollments"("deviceId");
CREATE INDEX IF NOT EXISTS "attendance_device_enrollments_employeeId_idx" ON "attendance_device_enrollments"("employeeId");
CREATE INDEX IF NOT EXISTS "attendance_device_enrollments_status_idx" ON "attendance_device_enrollments"("status");
CREATE INDEX IF NOT EXISTS "attendance_device_enrollments_deletedAt_idx" ON "attendance_device_enrollments"("deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_device_enrollments_deviceId_deviceUserId_key" ON "attendance_device_enrollments"("deviceId", "deviceUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_device_enrollments_deviceId_employeeId_key" ON "attendance_device_enrollments"("deviceId", "employeeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_device_enrollments_deviceId_fkey'
  ) THEN
    ALTER TABLE "attendance_device_enrollments"
      ADD CONSTRAINT "attendance_device_enrollments_deviceId_fkey"
      FOREIGN KEY ("deviceId") REFERENCES "attendance_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_device_enrollments_employeeId_fkey'
  ) THEN
    ALTER TABLE "attendance_device_enrollments"
      ADD CONSTRAINT "attendance_device_enrollments_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
