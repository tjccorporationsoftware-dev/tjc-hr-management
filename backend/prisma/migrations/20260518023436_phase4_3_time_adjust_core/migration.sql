-- CreateEnum
CREATE TYPE "TimeAdjustRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimeAdjustApprovalAction" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL');

-- CreateTable
CREATE TABLE "time_adjust_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT,
    "employeeId" TEXT NOT NULL,
    "originalAttendanceLogId" TEXT,
    "appliedAttendanceLogId" TEXT,
    "adjustType" TEXT NOT NULL,
    "targetLogType" "AttendanceLogType" NOT NULL,
    "originalLogTime" TIMESTAMP(3),
    "requestedLogTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "TimeAdjustRequestStatus" NOT NULL DEFAULT 'DRAFT',
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

    CONSTRAINT "time_adjust_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_adjust_logs" (
    "id" TEXT NOT NULL,
    "timeAdjustRequestId" TEXT NOT NULL,
    "action" "TimeAdjustApprovalAction" NOT NULL,
    "oldStatus" "TimeAdjustRequestStatus",
    "newStatus" "TimeAdjustRequestStatus",
    "reason" TEXT,
    "note" TEXT,
    "actedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_adjust_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "time_adjust_requests_requestNo_key" ON "time_adjust_requests"("requestNo");

-- CreateIndex
CREATE INDEX "time_adjust_requests_employeeId_idx" ON "time_adjust_requests"("employeeId");

-- CreateIndex
CREATE INDEX "time_adjust_requests_originalAttendanceLogId_idx" ON "time_adjust_requests"("originalAttendanceLogId");

-- CreateIndex
CREATE INDEX "time_adjust_requests_appliedAttendanceLogId_idx" ON "time_adjust_requests"("appliedAttendanceLogId");

-- CreateIndex
CREATE INDEX "time_adjust_requests_adjustType_idx" ON "time_adjust_requests"("adjustType");

-- CreateIndex
CREATE INDEX "time_adjust_requests_targetLogType_idx" ON "time_adjust_requests"("targetLogType");

-- CreateIndex
CREATE INDEX "time_adjust_requests_requestedLogTime_idx" ON "time_adjust_requests"("requestedLogTime");

-- CreateIndex
CREATE INDEX "time_adjust_requests_status_idx" ON "time_adjust_requests"("status");

-- CreateIndex
CREATE INDEX "time_adjust_requests_submittedById_idx" ON "time_adjust_requests"("submittedById");

-- CreateIndex
CREATE INDEX "time_adjust_requests_approvedById_idx" ON "time_adjust_requests"("approvedById");

-- CreateIndex
CREATE INDEX "time_adjust_requests_rejectedById_idx" ON "time_adjust_requests"("rejectedById");

-- CreateIndex
CREATE INDEX "time_adjust_requests_cancelledById_idx" ON "time_adjust_requests"("cancelledById");

-- CreateIndex
CREATE INDEX "time_adjust_requests_deletedAt_idx" ON "time_adjust_requests"("deletedAt");

-- CreateIndex
CREATE INDEX "time_adjust_logs_timeAdjustRequestId_idx" ON "time_adjust_logs"("timeAdjustRequestId");

-- CreateIndex
CREATE INDEX "time_adjust_logs_action_idx" ON "time_adjust_logs"("action");

-- CreateIndex
CREATE INDEX "time_adjust_logs_actedById_idx" ON "time_adjust_logs"("actedById");

-- CreateIndex
CREATE INDEX "time_adjust_logs_createdAt_idx" ON "time_adjust_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "time_adjust_requests" ADD CONSTRAINT "time_adjust_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_requests" ADD CONSTRAINT "time_adjust_requests_originalAttendanceLogId_fkey" FOREIGN KEY ("originalAttendanceLogId") REFERENCES "attendance_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_requests" ADD CONSTRAINT "time_adjust_requests_appliedAttendanceLogId_fkey" FOREIGN KEY ("appliedAttendanceLogId") REFERENCES "attendance_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_requests" ADD CONSTRAINT "time_adjust_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_requests" ADD CONSTRAINT "time_adjust_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_requests" ADD CONSTRAINT "time_adjust_requests_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_requests" ADD CONSTRAINT "time_adjust_requests_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_logs" ADD CONSTRAINT "time_adjust_logs_timeAdjustRequestId_fkey" FOREIGN KEY ("timeAdjustRequestId") REFERENCES "time_adjust_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_logs" ADD CONSTRAINT "time_adjust_logs_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
