-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATING', 'CALCULATED', 'REVIEWED', 'APPROVED', 'PAID', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayrollItemStatus" AS ENUM ('DRAFT', 'CALCULATED', 'REVIEWED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollLineType" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'INFO');

-- CreateEnum
CREATE TYPE "PayrollLineSourceType" AS ENUM ('MANUAL', 'BASE_SALARY', 'OVERTIME', 'ATTENDANCE', 'LEAVE', 'SOCIAL_SECURITY', 'TAX', 'ALLOWANCE', 'BONUS', 'ADJUSTMENT', 'IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "PayrollPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "positionId" TEXT;

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "level" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_components" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "type" "PayrollLineType" NOT NULL,
    "sourceType" "PayrollLineSourceType" NOT NULL DEFAULT 'MANUAL',
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isSocialSecurityBase" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "baseSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "positionAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "phoneAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PayrollPaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "bankAccountName" TEXT,
    "socialSecurityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "paymentDate" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "runNo" TEXT NOT NULL,
    "name" TEXT,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalGrossPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNetPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "calculatedById" TEXT,
    "approvedById" TEXT,
    "paidById" TEXT,
    "cancelledById" TEXT,
    "note" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "compensationId" TEXT,
    "status" "PayrollItemStatus" NOT NULL DEFAULT 'DRAFT',
    "baseSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalGrossPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNetPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "workingDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "paidLeaveDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "unpaidLeaveDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "absentDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payrollItemId" TEXT NOT NULL,
    "componentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayrollLineType" NOT NULL,
    "sourceType" "PayrollLineSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "quantity" DECIMAL(14,4),
    "rate" DECIMAL(14,4),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isSocialSecurityBase" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_code_key" ON "Position"("code");

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE INDEX "Position_deletedAt_idx" ON "Position"("deletedAt");

-- CreateIndex
CREATE INDEX "payroll_components_companyId_idx" ON "payroll_components"("companyId");

-- CreateIndex
CREATE INDEX "payroll_components_code_idx" ON "payroll_components"("code");

-- CreateIndex
CREATE INDEX "payroll_components_type_idx" ON "payroll_components"("type");

-- CreateIndex
CREATE INDEX "payroll_components_sourceType_idx" ON "payroll_components"("sourceType");

-- CreateIndex
CREATE INDEX "payroll_components_status_idx" ON "payroll_components"("status");

-- CreateIndex
CREATE INDEX "payroll_components_deletedAt_idx" ON "payroll_components"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_components_companyId_code_key" ON "payroll_components"("companyId", "code");

-- CreateIndex
CREATE INDEX "employee_compensations_companyId_idx" ON "employee_compensations"("companyId");

-- CreateIndex
CREATE INDEX "employee_compensations_employeeId_idx" ON "employee_compensations"("employeeId");

-- CreateIndex
CREATE INDEX "employee_compensations_effectiveDate_idx" ON "employee_compensations"("effectiveDate");

-- CreateIndex
CREATE INDEX "employee_compensations_status_idx" ON "employee_compensations"("status");

-- CreateIndex
CREATE INDEX "employee_compensations_deletedAt_idx" ON "employee_compensations"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "employee_compensations_employeeId_effectiveDate_key" ON "employee_compensations"("employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "payroll_periods_companyId_idx" ON "payroll_periods"("companyId");

-- CreateIndex
CREATE INDEX "payroll_periods_year_month_idx" ON "payroll_periods"("year", "month");

-- CreateIndex
CREATE INDEX "payroll_periods_startDate_idx" ON "payroll_periods"("startDate");

-- CreateIndex
CREATE INDEX "payroll_periods_endDate_idx" ON "payroll_periods"("endDate");

-- CreateIndex
CREATE INDEX "payroll_periods_paymentDate_idx" ON "payroll_periods"("paymentDate");

-- CreateIndex
CREATE INDEX "payroll_periods_status_idx" ON "payroll_periods"("status");

-- CreateIndex
CREATE INDEX "payroll_periods_createdById_idx" ON "payroll_periods"("createdById");

-- CreateIndex
CREATE INDEX "payroll_periods_deletedAt_idx" ON "payroll_periods"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_companyId_code_key" ON "payroll_periods"("companyId", "code");

-- CreateIndex
CREATE INDEX "payroll_runs_companyId_idx" ON "payroll_runs"("companyId");

-- CreateIndex
CREATE INDEX "payroll_runs_periodId_idx" ON "payroll_runs"("periodId");

-- CreateIndex
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

-- CreateIndex
CREATE INDEX "payroll_runs_calculatedAt_idx" ON "payroll_runs"("calculatedAt");

-- CreateIndex
CREATE INDEX "payroll_runs_approvedAt_idx" ON "payroll_runs"("approvedAt");

-- CreateIndex
CREATE INDEX "payroll_runs_paidAt_idx" ON "payroll_runs"("paidAt");

-- CreateIndex
CREATE INDEX "payroll_runs_createdById_idx" ON "payroll_runs"("createdById");

-- CreateIndex
CREATE INDEX "payroll_runs_deletedAt_idx" ON "payroll_runs"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_periodId_runNo_key" ON "payroll_runs"("periodId", "runNo");

-- CreateIndex
CREATE INDEX "payroll_items_runId_idx" ON "payroll_items"("runId");

-- CreateIndex
CREATE INDEX "payroll_items_employeeId_idx" ON "payroll_items"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_items_compensationId_idx" ON "payroll_items"("compensationId");

-- CreateIndex
CREATE INDEX "payroll_items_status_idx" ON "payroll_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_runId_employeeId_key" ON "payroll_items"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "payroll_lines_payrollItemId_idx" ON "payroll_lines"("payrollItemId");

-- CreateIndex
CREATE INDEX "payroll_lines_componentId_idx" ON "payroll_lines"("componentId");

-- CreateIndex
CREATE INDEX "payroll_lines_code_idx" ON "payroll_lines"("code");

-- CreateIndex
CREATE INDEX "payroll_lines_type_idx" ON "payroll_lines"("type");

-- CreateIndex
CREATE INDEX "payroll_lines_sourceType_idx" ON "payroll_lines"("sourceType");

-- CreateIndex
CREATE INDEX "payroll_lines_sourceId_idx" ON "payroll_lines"("sourceId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_components" ADD CONSTRAINT "payroll_components_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_calculatedById_fkey" FOREIGN KEY ("calculatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "employee_compensations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "payroll_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "payroll_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;
