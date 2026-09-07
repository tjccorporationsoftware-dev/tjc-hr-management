-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OvertimeWorkType" AS ENUM ('WORKDAY', 'HOLIDAY', 'SPECIAL_HOLIDAY');

-- CreateEnum
CREATE TYPE "OvertimeApprovalAction" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL');

-- CreateTable
CREATE TABLE "overtime_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeTypeId" TEXT,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "workType" "OvertimeWorkType" NOT NULL DEFAULT 'WORKDAY',
    "rateMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.50,
    "minMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxHoursPerDay" DECIMAL(5,2),
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "overtime_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalHours" DECIMAL(8,2) NOT NULL,
    "workType" "OvertimeWorkType" NOT NULL DEFAULT 'WORKDAY',
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_approval_logs" (
    "id" TEXT NOT NULL,
    "overtimeRequestId" TEXT NOT NULL,
    "action" "OvertimeApprovalAction" NOT NULL,
    "oldStatus" "OvertimeRequestStatus",
    "newStatus" "OvertimeRequestStatus",
    "reason" TEXT,
    "note" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_policies_companyId_idx" ON "overtime_policies"("companyId");

-- CreateIndex
CREATE INDEX "overtime_policies_employeeTypeId_idx" ON "overtime_policies"("employeeTypeId");

-- CreateIndex
CREATE INDEX "overtime_policies_workType_idx" ON "overtime_policies"("workType");

-- CreateIndex
CREATE INDEX "overtime_policies_status_idx" ON "overtime_policies"("status");

-- CreateIndex
CREATE INDEX "overtime_policies_deletedAt_idx" ON "overtime_policies"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_policies_companyId_code_key" ON "overtime_policies"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_requestNo_key" ON "overtime_requests"("requestNo");

-- CreateIndex
CREATE INDEX "overtime_requests_employeeId_idx" ON "overtime_requests"("employeeId");

-- CreateIndex
CREATE INDEX "overtime_requests_workDate_idx" ON "overtime_requests"("workDate");

-- CreateIndex
CREATE INDEX "overtime_requests_startTime_idx" ON "overtime_requests"("startTime");

-- CreateIndex
CREATE INDEX "overtime_requests_endTime_idx" ON "overtime_requests"("endTime");

-- CreateIndex
CREATE INDEX "overtime_requests_workType_idx" ON "overtime_requests"("workType");

-- CreateIndex
CREATE INDEX "overtime_requests_status_idx" ON "overtime_requests"("status");

-- CreateIndex
CREATE INDEX "overtime_requests_submittedById_idx" ON "overtime_requests"("submittedById");

-- CreateIndex
CREATE INDEX "overtime_requests_cancelledById_idx" ON "overtime_requests"("cancelledById");

-- CreateIndex
CREATE INDEX "overtime_requests_deletedAt_idx" ON "overtime_requests"("deletedAt");

-- CreateIndex
CREATE INDEX "overtime_approval_logs_overtimeRequestId_idx" ON "overtime_approval_logs"("overtimeRequestId");

-- CreateIndex
CREATE INDEX "overtime_approval_logs_action_idx" ON "overtime_approval_logs"("action");

-- CreateIndex
CREATE INDEX "overtime_approval_logs_approvedById_idx" ON "overtime_approval_logs"("approvedById");

-- CreateIndex
CREATE INDEX "overtime_approval_logs_createdAt_idx" ON "overtime_approval_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "overtime_policies" ADD CONSTRAINT "overtime_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_policies" ADD CONSTRAINT "overtime_policies_employeeTypeId_fkey" FOREIGN KEY ("employeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_logs" ADD CONSTRAINT "overtime_approval_logs_overtimeRequestId_fkey" FOREIGN KEY ("overtimeRequestId") REFERENCES "overtime_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_logs" ADD CONSTRAINT "overtime_approval_logs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
