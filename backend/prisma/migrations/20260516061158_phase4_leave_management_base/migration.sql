-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveDayType" AS ENUM ('FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON');

-- CreateEnum
CREATE TYPE "LeaveApprovalAction" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL');

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "employeeTypeId" TEXT,
    "annualQuotaDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "maxConsecutiveDays" INTEGER,
    "allowCarryForward" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardLimitDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitlementDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carriedForwardDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "adjustedDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "usedDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pendingDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dayType" "LeaveDayType" NOT NULL DEFAULT 'FULL_DAY',
    "totalDays" DECIMAL(8,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "contactInfo" TEXT,
    "note" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approval_logs" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "action" "LeaveApprovalAction" NOT NULL,
    "oldStatus" "LeaveRequestStatus",
    "newStatus" "LeaveRequestStatus",
    "reason" TEXT,
    "note" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_types_companyId_idx" ON "leave_types"("companyId");

-- CreateIndex
CREATE INDEX "leave_types_code_idx" ON "leave_types"("code");

-- CreateIndex
CREATE INDEX "leave_types_status_idx" ON "leave_types"("status");

-- CreateIndex
CREATE INDEX "leave_types_deletedAt_idx" ON "leave_types"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_companyId_code_key" ON "leave_types"("companyId", "code");

-- CreateIndex
CREATE INDEX "leave_policies_companyId_idx" ON "leave_policies"("companyId");

-- CreateIndex
CREATE INDEX "leave_policies_leaveTypeId_idx" ON "leave_policies"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_policies_employeeTypeId_idx" ON "leave_policies"("employeeTypeId");

-- CreateIndex
CREATE INDEX "leave_policies_status_idx" ON "leave_policies"("status");

-- CreateIndex
CREATE INDEX "leave_policies_deletedAt_idx" ON "leave_policies"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_companyId_leaveTypeId_employeeTypeId_key" ON "leave_policies"("companyId", "leaveTypeId", "employeeTypeId");

-- CreateIndex
CREATE INDEX "leave_balances_employeeId_idx" ON "leave_balances"("employeeId");

-- CreateIndex
CREATE INDEX "leave_balances_leaveTypeId_idx" ON "leave_balances"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_balances_year_idx" ON "leave_balances"("year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employeeId_leaveTypeId_year_key" ON "leave_balances"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_requestNo_key" ON "leave_requests"("requestNo");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_idx" ON "leave_requests"("employeeId");

-- CreateIndex
CREATE INDEX "leave_requests_leaveTypeId_idx" ON "leave_requests"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_requests_startDate_idx" ON "leave_requests"("startDate");

-- CreateIndex
CREATE INDEX "leave_requests_endDate_idx" ON "leave_requests"("endDate");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_submittedById_idx" ON "leave_requests"("submittedById");

-- CreateIndex
CREATE INDEX "leave_requests_cancelledById_idx" ON "leave_requests"("cancelledById");

-- CreateIndex
CREATE INDEX "leave_requests_deletedAt_idx" ON "leave_requests"("deletedAt");

-- CreateIndex
CREATE INDEX "leave_approval_logs_leaveRequestId_idx" ON "leave_approval_logs"("leaveRequestId");

-- CreateIndex
CREATE INDEX "leave_approval_logs_action_idx" ON "leave_approval_logs"("action");

-- CreateIndex
CREATE INDEX "leave_approval_logs_approvedById_idx" ON "leave_approval_logs"("approvedById");

-- CreateIndex
CREATE INDEX "leave_approval_logs_createdAt_idx" ON "leave_approval_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_employeeTypeId_fkey" FOREIGN KEY ("employeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_logs" ADD CONSTRAINT "leave_approval_logs_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_logs" ADD CONSTRAINT "leave_approval_logs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
