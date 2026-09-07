-- Manual migration for Post-Sprint 7 Batch 4: Attendance Policy + Punch Source
-- ใช้เมื่อยังไม่ได้ใช้ prisma migrate generate ใน environment จริง

CREATE TABLE IF NOT EXISTS "attendance_policies" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "morningCheckInDeadline" TEXT NOT NULL DEFAULT '08:00',
  "afternoonCheckInDeadline" TEXT NOT NULL DEFAULT '13:00',
  "checkoutAllowedFrom" TEXT NOT NULL DEFAULT '17:00',
  "latePenaltyRatePerMinute" NUMERIC(14,2) NOT NULL DEFAULT 5,
  "missingLogPenaltyPerDay" NUMERIC(14,2) NOT NULL DEFAULT 50,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_policies_company_code_key"
  ON "attendance_policies" ("companyId", "code");
CREATE INDEX IF NOT EXISTS "attendance_policies_company_idx" ON "attendance_policies" ("companyId");
CREATE INDEX IF NOT EXISTS "attendance_policies_branch_idx" ON "attendance_policies" ("branchId");
CREATE INDEX IF NOT EXISTS "attendance_policies_status_idx" ON "attendance_policies" ("status");
CREATE INDEX IF NOT EXISTS "attendance_policies_effective_from_idx" ON "attendance_policies" ("effectiveFrom");
CREATE INDEX IF NOT EXISTS "attendance_policies_effective_to_idx" ON "attendance_policies" ("effectiveTo");
CREATE INDEX IF NOT EXISTS "attendance_policies_deleted_at_idx" ON "attendance_policies" ("deletedAt");

ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'WEB';
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "session" TEXT;
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "rawScannerRecordId" TEXT;

CREATE INDEX IF NOT EXISTS "attendance_logs_source_idx" ON "attendance_logs" ("source");
CREATE INDEX IF NOT EXISTS "attendance_logs_session_idx" ON "attendance_logs" ("session");
CREATE INDEX IF NOT EXISTS "attendance_logs_raw_scanner_record_id_idx" ON "attendance_logs" ("rawScannerRecordId");
