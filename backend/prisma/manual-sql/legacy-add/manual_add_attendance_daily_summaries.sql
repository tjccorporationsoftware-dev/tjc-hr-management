-- Batch 5 FIX v3: Attendance Daily Summary / Penalty Calculation
-- Fixed after checking the current schema.prisma.
--
-- Real table names from Prisma mapping:
-- - User model table: "User"
-- - Employee model table: "employees"  because Employee has @@map("employees")
-- - LeaveRequest model table: "leave_requests"
-- - LeaveType model table: "leave_types"
-- - AttendancePolicy model table: "attendance_policies"
--
-- Run from backend folder:
-- Get-Content .\prisma\manual_add_attendance_daily_summaries.sql | docker exec -i hr_postgres psql -U hr_admin -d hr_workforce

CREATE TABLE IF NOT EXISTS "attendance_daily_summaries" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,

  "morningInAt" TIMESTAMP(3),
  "afternoonInAt" TIMESTAMP(3),
  "checkOutAt" TIMESTAMP(3),

  "morningLateMinutes" INTEGER NOT NULL DEFAULT 0,
  "afternoonLateMinutes" INTEGER NOT NULL DEFAULT 0,
  "totalLateMinutes" INTEGER NOT NULL DEFAULT 0,

  "isMorningMissing" BOOLEAN NOT NULL DEFAULT FALSE,
  "isAfternoonMissing" BOOLEAN NOT NULL DEFAULT FALSE,
  "isCheckoutMissing" BOOLEAN NOT NULL DEFAULT FALSE,
  "hasMissingLog" BOOLEAN NOT NULL DEFAULT FALSE,

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

  CONSTRAINT "attendance_daily_summaries_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "attendance_daily_summaries_leaveRequestId_fkey"
    FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "attendance_daily_summaries_leaveTypeId_fkey"
    FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "attendance_daily_summaries_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "attendance_policies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "attendance_daily_summaries_calculatedById_fkey"
    FOREIGN KEY ("calculatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_daily_summaries_employeeId_workDate_key"
  ON "attendance_daily_summaries" ("employeeId", "workDate");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_employeeId_idx"
  ON "attendance_daily_summaries" ("employeeId");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_workDate_idx"
  ON "attendance_daily_summaries" ("workDate");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_leaveRequestId_idx"
  ON "attendance_daily_summaries" ("leaveRequestId");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_leaveTypeId_idx"
  ON "attendance_daily_summaries" ("leaveTypeId");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_policyId_idx"
  ON "attendance_daily_summaries" ("policyId");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_calculationStatus_idx"
  ON "attendance_daily_summaries" ("calculationStatus");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_calculatedById_idx"
  ON "attendance_daily_summaries" ("calculatedById");

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_lockedAt_idx"
  ON "attendance_daily_summaries" ("lockedAt");
