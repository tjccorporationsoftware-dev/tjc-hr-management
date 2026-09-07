-- ใบทำงานวันหยุด — พนักงานเปิดใบเอง แนบรูปเริ่ม/เลิกงาน HR อนุมัติแล้วได้สิทธิ์หยุดชดเชย

-- สิทธิ์หยุดชดเชยเดิมมาจากการลงเวลาอย่างเดียว ตอนนี้มาจากใบที่ HR อนุมัติได้ด้วย
ALTER TYPE "SubstituteHolidayCreditSourceType" ADD VALUE IF NOT EXISTS 'HOLIDAY_WORK_REQUEST';

DO $$ BEGIN
  CREATE TYPE "HolidayWorkRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "HolidayWorkAttachmentKind" AS ENUM ('START', 'END', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "holiday_work_requests" (
  "id" TEXT NOT NULL,
  "requestNo" TEXT,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "totalHours" DECIMAL(8,2) NOT NULL,
  "grantedDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "holidayNameSnapshot" TEXT,
  "holidayTypeSnapshot" TEXT,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "status" "HolidayWorkRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewNote" TEXT,
  "substituteCreditId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "submittedById" TEXT,
  "approvedById" TEXT,
  "rejectedById" TEXT,
  "cancelledById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "holiday_work_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "holiday_work_requests_requestNo_key" ON "holiday_work_requests"("requestNo");
CREATE INDEX IF NOT EXISTS "holiday_work_requests_companyId_idx" ON "holiday_work_requests"("companyId");
CREATE INDEX IF NOT EXISTS "holiday_work_requests_employeeId_idx" ON "holiday_work_requests"("employeeId");
CREATE INDEX IF NOT EXISTS "holiday_work_requests_workDate_idx" ON "holiday_work_requests"("workDate");
CREATE INDEX IF NOT EXISTS "holiday_work_requests_status_idx" ON "holiday_work_requests"("status");
CREATE INDEX IF NOT EXISTS "holiday_work_requests_employeeId_status_workDate_idx" ON "holiday_work_requests"("employeeId", "status", "workDate");
CREATE INDEX IF NOT EXISTS "holiday_work_requests_substituteCreditId_idx" ON "holiday_work_requests"("substituteCreditId");
CREATE INDEX IF NOT EXISTS "holiday_work_requests_deletedAt_idx" ON "holiday_work_requests"("deletedAt");

CREATE TABLE IF NOT EXISTS "holiday_work_attachments" (
  "id" TEXT NOT NULL,
  "holidayWorkRequestId" TEXT NOT NULL,
  "kind" "HolidayWorkAttachmentKind" NOT NULL DEFAULT 'OTHER',
  "title" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER,
  "mimeType" TEXT,
  "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
  "storageKey" TEXT NOT NULL,
  "bucketName" TEXT,
  "description" TEXT,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "holiday_work_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "holiday_work_attachments_holidayWorkRequestId_idx" ON "holiday_work_attachments"("holidayWorkRequestId");
CREATE INDEX IF NOT EXISTS "holiday_work_attachments_kind_idx" ON "holiday_work_attachments"("kind");
CREATE INDEX IF NOT EXISTS "holiday_work_attachments_uploadedById_idx" ON "holiday_work_attachments"("uploadedById");
CREATE INDEX IF NOT EXISTS "holiday_work_attachments_deletedAt_idx" ON "holiday_work_attachments"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "holiday_work_attachments"
    ADD CONSTRAINT "holiday_work_attachments_holidayWorkRequestId_fkey"
    FOREIGN KEY ("holidayWorkRequestId") REFERENCES "holiday_work_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
