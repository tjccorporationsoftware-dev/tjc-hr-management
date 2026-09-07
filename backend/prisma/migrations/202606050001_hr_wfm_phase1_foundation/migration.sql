-- HR WFM Phase 1: Database Foundation
-- ตาม Blueprint: เพิ่มฐานข้อมูลสำหรับ Attendance Session, Raw Event, Leave Ledger, Offsite Work,
-- Leave hourly/retroactive และ payroll-safe review/lock metadata

-- AlterEnum
ALTER TYPE "AttendanceLocationType" ADD VALUE 'CUSTOMER_SITE';
ALTER TYPE "AttendanceLocationType" ADD VALUE 'WFH';
ALTER TYPE "AttendanceLocationType" ADD VALUE 'TEMPORARY_SITE';

-- AlterEnum
ALTER TYPE "LeaveDayType" ADD VALUE 'HOURLY';

-- CreateEnum
CREATE TYPE "AttendanceSessionCode" AS ENUM ('MORNING_IN', 'AFTERNOON_IN', 'CHECK_OUT', 'OFFSITE_IN', 'OFFSITE_OUT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AttendanceSessionType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "AttendanceReviewStatus" AS ENUM ('CALCULATED', 'NEED_REVIEW', 'REVIEWED', 'READY_FOR_PAYROLL', 'SENT_TO_PAYROLL', 'LOCKED');

-- CreateEnum
CREATE TYPE "OffsiteRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveBalanceLedgerAction" AS ENUM ('GRANT', 'SUBMIT_PENDING', 'APPROVE_USE', 'REJECT_RELEASE', 'CANCEL_RELEASE', 'MANUAL_ADJUST', 'CARRY_FORWARD', 'EXPIRE', 'RETROACTIVE_APPROVE');

-- AlterTable
ALTER TABLE "attendance_policies"
ADD COLUMN "employeeTypeId" TEXT,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lateRoundingMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxLatePenaltyPerDay" DECIMAL(14,2),
ADD COLUMN "maxMissingPenaltyPerDay" DECIMAL(14,2),
ADD COLUMN "missingPenaltyMode" TEXT NOT NULL DEFAULT 'PER_SESSION',
ADD COLUMN "offsiteEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireOffsiteApproval" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "attendance_session_rules" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "sessionCode" "AttendanceSessionCode" NOT NULL,
    "label" TEXT NOT NULL,
    "punchType" "AttendanceSessionType" NOT NULL,
    "openTime" TEXT NOT NULL,
    "expectedTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "lateAfterTime" TEXT,
    "lateUntilTime" TEXT,
    "earlyBeforeTime" TEXT,
    "lateOutAfterTime" TEXT,
    "requirePunch" BOOLEAN NOT NULL DEFAULT true,
    "allowEarlyPunch" BOOLEAN NOT NULL DEFAULT false,
    "earlyPunchGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "latePenaltyPerMinute" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "missingPenaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "earlyLeavePenaltyPerMinute" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectLateOutMinutes" BOOLEAN NOT NULL DEFAULT false,
    "autoCreateOt" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_session_rules_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "attendance_logs"
ADD COLUMN "isOffsite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "offsiteRequestId" TEXT,
ADD COLUMN "locationVerified" BOOLEAN,
ADD COLUMN "distanceFromApprovedLocationMeters" DECIMAL(10,2),
ADD COLUMN "gpsVerificationStatus" TEXT,
ADD COLUMN "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "attendance_raw_events" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "rawRecordId" TEXT NOT NULL,
    "employeeCode" TEXT,
    "rawEmployeeRef" TEXT,
    "logTime" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "normalizedLogId" TEXT,
    "normalizedAt" TIMESTAMP(3),
    "normalizeStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_raw_events_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "attendance_daily_summaries"
ADD COLUMN "earlyCheckoutMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lateCheckoutMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "extraPresenceMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "missingMorningPenaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "missingAfternoonPenaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "missingCheckoutPenaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "earlyCheckoutPenaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "paidLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "unpaidLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "offsiteMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "approvedOtMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "payableOtMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "offsiteStatus" TEXT,
ADD COLUMN "reviewStatus" "AttendanceReviewStatus" NOT NULL DEFAULT 'CALCULATED',
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "readyForPayrollAt" TIMESTAMP(3),
ADD COLUMN "readyForPayrollById" TEXT,
ADD COLUMN "lockedById" TEXT,
ADD COLUMN "payrollPeriodId" TEXT,
ADD COLUMN "payrollRunId" TEXT,
ADD COLUMN "sentToPayrollAt" TIMESTAMP(3),
ADD COLUMN "sentToPayrollById" TEXT;

-- AlterTable
ALTER TABLE "leave_types"
ADD COLUMN "deductQuota" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "affectAttendance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "affectPayroll" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "minLeaveUnitMinutes" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN "maxLeaveDaysPerRequest" DECIMAL(8,2),
ADD COLUMN "allowBackdated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxBackdatedDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "backdatedRequiresAttachment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "backdatedRequiresHrApproval" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "negativeBalanceMode" TEXT,
ADD COLUMN "includeHoliday" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "includeWeekend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attachmentRequiredAfterDays" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "leave_policies"
ADD COLUMN "quotaPeriod" TEXT NOT NULL DEFAULT 'YEARLY',
ADD COLUMN "monthlyAccrualDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "probationEligibleAfterDays" INTEGER,
ADD COLUMN "carryForwardExpireMonth" INTEGER,
ADD COLUMN "carryForwardExpireDay" INTEGER,
ADD COLUMN "maxBackdatedDaysOverride" INTEGER,
ADD COLUMN "requireAttachmentAfterDays" DECIMAL(8,2),
ADD COLUMN "effectiveFrom" DATE,
ADD COLUMN "effectiveTo" DATE;

-- CreateTable
CREATE TABLE "leave_balance_ledgers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "leaveBalanceId" TEXT,
    "action" "LeaveBalanceLedgerAction" NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "quotaYear" INTEGER NOT NULL,
    "changeDays" DECIMAL(8,2) NOT NULL,
    "balanceBefore" DECIMAL(8,2) NOT NULL,
    "balanceAfter" DECIMAL(8,2) NOT NULL,
    "pendingBefore" DECIMAL(8,2) NOT NULL,
    "pendingAfter" DECIMAL(8,2) NOT NULL,
    "usedBefore" DECIMAL(8,2) NOT NULL,
    "usedAfter" DECIMAL(8,2) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balance_ledgers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "leave_requests"
ADD COLUMN "startTime" TEXT,
ADD COLUMN "endTime" TEXT,
ADD COLUMN "totalMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isRetroactive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "retroactiveReason" TEXT,
ADD COLUMN "retroactiveRequestedAt" TIMESTAMP(3),
ADD COLUMN "payrollPeriodStatusAtRequest" TEXT,
ADD COLUMN "requiresPayrollCorrection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "correctionPayrollPeriodId" TEXT,
ADD COLUMN "policySnapshot" JSONB,
ADD COLUMN "balanceSnapshotBefore" JSONB,
ADD COLUMN "balanceSnapshotAfter" JSONB;

-- CreateTable
CREATE TABLE "offsite_work_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "locationType" "AttendanceLocationType" NOT NULL DEFAULT 'SITE',
    "locationName" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "radiusMeters" INTEGER NOT NULL DEFAULT 300,
    "reason" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "status" "OffsiteRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "cancelledById" TEXT,
    "policySnapshot" JSONB,
    "approvalSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offsite_work_requests_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "employee_compensations"
ADD COLUMN "endDate" DATE,
ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "changeReason" TEXT,
ADD COLUMN "previousCompensationId" TEXT,
ADD COLUMN "policySnapshot" JSONB;

-- CreateIndex: attendance_policies
CREATE INDEX "attendance_policies_employeeTypeId_idx" ON "attendance_policies"("employeeTypeId");
CREATE INDEX "attendance_policies_priority_idx" ON "attendance_policies"("priority");

-- CreateIndex: attendance_session_rules
CREATE INDEX "attendance_session_rules_policyId_idx" ON "attendance_session_rules"("policyId");
CREATE INDEX "attendance_session_rules_sessionCode_idx" ON "attendance_session_rules"("sessionCode");
CREATE INDEX "attendance_session_rules_punchType_idx" ON "attendance_session_rules"("punchType");
CREATE INDEX "attendance_session_rules_status_idx" ON "attendance_session_rules"("status");
CREATE INDEX "attendance_session_rules_deletedAt_idx" ON "attendance_session_rules"("deletedAt");

-- CreateIndex: attendance_logs
CREATE INDEX "attendance_logs_isOffsite_idx" ON "attendance_logs"("isOffsite");
CREATE INDEX "attendance_logs_offsiteRequestId_idx" ON "attendance_logs"("offsiteRequestId");
CREATE INDEX "attendance_logs_gpsVerificationStatus_idx" ON "attendance_logs"("gpsVerificationStatus");

-- CreateIndex: attendance_raw_events
CREATE UNIQUE INDEX "attendance_raw_events_deviceId_rawRecordId_key" ON "attendance_raw_events"("deviceId", "rawRecordId");
CREATE INDEX "attendance_raw_events_deviceId_idx" ON "attendance_raw_events"("deviceId");
CREATE INDEX "attendance_raw_events_rawRecordId_idx" ON "attendance_raw_events"("rawRecordId");
CREATE INDEX "attendance_raw_events_employeeCode_idx" ON "attendance_raw_events"("employeeCode");
CREATE INDEX "attendance_raw_events_logTime_idx" ON "attendance_raw_events"("logTime");
CREATE INDEX "attendance_raw_events_normalizeStatus_idx" ON "attendance_raw_events"("normalizeStatus");
CREATE INDEX "attendance_raw_events_normalizedLogId_idx" ON "attendance_raw_events"("normalizedLogId");

-- CreateIndex: attendance_daily_summaries
CREATE INDEX "attendance_daily_summaries_reviewStatus_idx" ON "attendance_daily_summaries"("reviewStatus");
CREATE INDEX "attendance_daily_summaries_offsiteStatus_idx" ON "attendance_daily_summaries"("offsiteStatus");
CREATE INDEX "attendance_daily_summaries_reviewedById_idx" ON "attendance_daily_summaries"("reviewedById");
CREATE INDEX "attendance_daily_summaries_readyForPayrollById_idx" ON "attendance_daily_summaries"("readyForPayrollById");
CREATE INDEX "attendance_daily_summaries_lockedById_idx" ON "attendance_daily_summaries"("lockedById");
CREATE INDEX "attendance_daily_summaries_payrollPeriodId_idx" ON "attendance_daily_summaries"("payrollPeriodId");
CREATE INDEX "attendance_daily_summaries_payrollRunId_idx" ON "attendance_daily_summaries"("payrollRunId");

-- CreateIndex: leave_policies
CREATE INDEX "leave_policies_quotaPeriod_idx" ON "leave_policies"("quotaPeriod");
CREATE INDEX "leave_policies_effectiveFrom_idx" ON "leave_policies"("effectiveFrom");
CREATE INDEX "leave_policies_effectiveTo_idx" ON "leave_policies"("effectiveTo");

-- CreateIndex: leave_balance_ledgers
CREATE INDEX "leave_balance_ledgers_companyId_idx" ON "leave_balance_ledgers"("companyId");
CREATE INDEX "leave_balance_ledgers_employeeId_idx" ON "leave_balance_ledgers"("employeeId");
CREATE INDEX "leave_balance_ledgers_leaveTypeId_idx" ON "leave_balance_ledgers"("leaveTypeId");
CREATE INDEX "leave_balance_ledgers_leaveBalanceId_idx" ON "leave_balance_ledgers"("leaveBalanceId");
CREATE INDEX "leave_balance_ledgers_quotaYear_idx" ON "leave_balance_ledgers"("quotaYear");
CREATE INDEX "leave_balance_ledgers_action_idx" ON "leave_balance_ledgers"("action");
CREATE INDEX "leave_balance_ledgers_sourceType_sourceId_idx" ON "leave_balance_ledgers"("sourceType", "sourceId");
CREATE INDEX "leave_balance_ledgers_createdById_idx" ON "leave_balance_ledgers"("createdById");

-- CreateIndex: leave_requests
CREATE INDEX "leave_requests_dayType_idx" ON "leave_requests"("dayType");
CREATE INDEX "leave_requests_isRetroactive_idx" ON "leave_requests"("isRetroactive");
CREATE INDEX "leave_requests_requiresPayrollCorrection_idx" ON "leave_requests"("requiresPayrollCorrection");
CREATE INDEX "leave_requests_correctionPayrollPeriodId_idx" ON "leave_requests"("correctionPayrollPeriodId");

-- CreateIndex: offsite_work_requests
CREATE UNIQUE INDEX "offsite_work_requests_requestNo_key" ON "offsite_work_requests"("requestNo");
CREATE INDEX "offsite_work_requests_companyId_idx" ON "offsite_work_requests"("companyId");
CREATE INDEX "offsite_work_requests_employeeId_idx" ON "offsite_work_requests"("employeeId");
CREATE INDEX "offsite_work_requests_workDate_idx" ON "offsite_work_requests"("workDate");
CREATE INDEX "offsite_work_requests_status_idx" ON "offsite_work_requests"("status");
CREATE INDEX "offsite_work_requests_locationType_idx" ON "offsite_work_requests"("locationType");
CREATE INDEX "offsite_work_requests_submittedById_idx" ON "offsite_work_requests"("submittedById");
CREATE INDEX "offsite_work_requests_approvedById_idx" ON "offsite_work_requests"("approvedById");
CREATE INDEX "offsite_work_requests_deletedAt_idx" ON "offsite_work_requests"("deletedAt");

-- CreateIndex: employee_compensations
CREATE INDEX "employee_compensations_endDate_idx" ON "employee_compensations"("endDate");
CREATE INDEX "employee_compensations_approvalStatus_idx" ON "employee_compensations"("approvalStatus");
CREATE INDEX "employee_compensations_approvedById_idx" ON "employee_compensations"("approvedById");
CREATE INDEX "employee_compensations_previousCompensationId_idx" ON "employee_compensations"("previousCompensationId");

-- AddForeignKey
ALTER TABLE "attendance_session_rules"
ADD CONSTRAINT "attendance_session_rules_policyId_fkey"
FOREIGN KEY ("policyId") REFERENCES "attendance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
