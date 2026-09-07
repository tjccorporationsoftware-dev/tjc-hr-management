-- HR WFM Legacy Foundation
-- รวม SQL manual เดิมที่ schema.prisma ใช้งานจริง แต่ยังไม่เคยอยู่ใน prisma/migrations
-- ต้องอยู่ก่อน 202606050001_hr_wfm_phase1_foundation เพราะ Phase 1 ต้อง ALTER ตารางเหล่านี้

-- Attendance Policy + Punch Source
CREATE TABLE "attendance_policies" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "morningCheckInDeadline" TEXT NOT NULL DEFAULT '08:00',
  "afternoonCheckInDeadline" TEXT NOT NULL DEFAULT '13:00',
  "checkoutAllowedFrom" TEXT NOT NULL DEFAULT '17:00',
  "latePenaltyRatePerMinute" DECIMAL(14,2) NOT NULL DEFAULT 5,
  "missingLogPenaltyPerDay" DECIMAL(14,2) NOT NULL DEFAULT 50,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_policies_companyId_code_key" ON "attendance_policies"("companyId", "code");
CREATE INDEX "attendance_policies_companyId_idx" ON "attendance_policies"("companyId");
CREATE INDEX "attendance_policies_branchId_idx" ON "attendance_policies"("branchId");
CREATE INDEX "attendance_policies_status_idx" ON "attendance_policies"("status");
CREATE INDEX "attendance_policies_effectiveFrom_idx" ON "attendance_policies"("effectiveFrom");
CREATE INDEX "attendance_policies_effectiveTo_idx" ON "attendance_policies"("effectiveTo");
CREATE INDEX "attendance_policies_deletedAt_idx" ON "attendance_policies"("deletedAt");

ALTER TABLE "attendance_logs" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'WEB';
ALTER TABLE "attendance_logs" ADD COLUMN "session" TEXT;
ALTER TABLE "attendance_logs" ADD COLUMN "rawScannerRecordId" TEXT;

CREATE INDEX "attendance_logs_source_idx" ON "attendance_logs"("source");
CREATE INDEX "attendance_logs_session_idx" ON "attendance_logs"("session");
CREATE INDEX "attendance_logs_rawScannerRecordId_idx" ON "attendance_logs"("rawScannerRecordId");

-- Attendance Daily Summary
CREATE TABLE "attendance_daily_summaries" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,

  "morningInAt" TIMESTAMP(3),
  "afternoonInAt" TIMESTAMP(3),
  "checkOutAt" TIMESTAMP(3),

  "morningLateMinutes" INTEGER NOT NULL DEFAULT 0,
  "afternoonLateMinutes" INTEGER NOT NULL DEFAULT 0,
  "totalLateMinutes" INTEGER NOT NULL DEFAULT 0,

  "isMorningMissing" BOOLEAN NOT NULL DEFAULT false,
  "isAfternoonMissing" BOOLEAN NOT NULL DEFAULT false,
  "isCheckoutMissing" BOOLEAN NOT NULL DEFAULT false,
  "hasMissingLog" BOOLEAN NOT NULL DEFAULT false,

  "latePenaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "missingLogPenaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unpaidLeaveDeductionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalDeductionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

  "leaveRequestId" TEXT,
  "leaveTypeId" TEXT,
  "leaveIsPaid" BOOLEAN,
  "leaveDayType" "LeaveDayType",
  "leaveDurationDays" DECIMAL(8,2) NOT NULL DEFAULT 0,

  "policyId" TEXT,
  "policySnapshot" JSONB,

  "calculationStatus" TEXT NOT NULL DEFAULT 'CALCULATED',
  "calculationNote" TEXT,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "calculatedById" TEXT,

  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_daily_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_daily_summaries_employeeId_workDate_key" ON "attendance_daily_summaries"("employeeId", "workDate");
CREATE INDEX "attendance_daily_summaries_employeeId_idx" ON "attendance_daily_summaries"("employeeId");
CREATE INDEX "attendance_daily_summaries_workDate_idx" ON "attendance_daily_summaries"("workDate");
CREATE INDEX "attendance_daily_summaries_leaveRequestId_idx" ON "attendance_daily_summaries"("leaveRequestId");
CREATE INDEX "attendance_daily_summaries_leaveTypeId_idx" ON "attendance_daily_summaries"("leaveTypeId");
CREATE INDEX "attendance_daily_summaries_policyId_idx" ON "attendance_daily_summaries"("policyId");
CREATE INDEX "attendance_daily_summaries_calculationStatus_idx" ON "attendance_daily_summaries"("calculationStatus");
CREATE INDEX "attendance_daily_summaries_calculatedById_idx" ON "attendance_daily_summaries"("calculatedById");
CREATE INDEX "attendance_daily_summaries_lockedAt_idx" ON "attendance_daily_summaries"("lockedAt");

ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_leaveRequestId_fkey"
  FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_leaveTypeId_fkey"
  FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "attendance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_calculatedById_fkey"
  FOREIGN KEY ("calculatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Leave duration settings
ALTER TABLE "leave_types" ADD COLUMN "allowHalfDay" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "leave_types" ADD COLUMN "allowHourly" BOOLEAN NOT NULL DEFAULT false;

-- Payroll payslip publication metadata
ALTER TABLE "payroll_runs" ADD COLUMN "payslipsPublishedAt" TIMESTAMP(3);
ALTER TABLE "payroll_runs" ADD COLUMN "payslipsPublishedById" TEXT;
ALTER TABLE "payroll_runs" ADD COLUMN "payslipsUnpublishedAt" TIMESTAMP(3);
ALTER TABLE "payroll_runs" ADD COLUMN "payslipsUnpublishedById" TEXT;

CREATE INDEX "payroll_runs_payslipsPublishedAt_idx" ON "payroll_runs"("payslipsPublishedAt");
CREATE INDEX "payroll_runs_payslipsPublishedById_idx" ON "payroll_runs"("payslipsPublishedById");
CREATE INDEX "payroll_runs_payslipsUnpublishedAt_idx" ON "payroll_runs"("payslipsUnpublishedAt");

-- System Settings
CREATE TABLE "system_settings" (
  "id" TEXT NOT NULL,
  "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_settings_audit" (
  "id" TEXT NOT NULL,
  "settingId" TEXT NOT NULL,
  "previousValue" JSONB NOT NULL,
  "newValue" JSONB NOT NULL,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_settings_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_settings_audit_settingId_idx" ON "system_settings_audit"("settingId");
CREATE INDEX "system_settings_audit_changedById_idx" ON "system_settings_audit"("changedById");
CREATE INDEX "system_settings_audit_createdAt_idx" ON "system_settings_audit"("createdAt");

INSERT INTO "system_settings" ("id", "value", "createdAt", "updatedAt")
VALUES (
  'system',
  '{
    "organizationName": "HR Workforce Management System",
    "timezone": "Asia/Bangkok",
    "locale": "th-TH",
    "dateFormat": "DD/MM/YYYY พ.ศ.",
    "timeFormat": "HH:mm",
    "fiscalYearStartMonth": 1,
    "fileUploadMaxMb": 20,
    "allowedFileTypes": ["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg"],
    "sessionTimeoutMinutes": 480,
    "passwordMinLength": 8,
    "requireUppercase": false,
    "requireLowercase": false,
    "requireNumber": false,
    "requireSymbol": false,
    "requireTwoFactor": false,
    "enableEmailNotification": true,
    "enableLineNotification": false,
    "maintenanceMode": false
  }'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
