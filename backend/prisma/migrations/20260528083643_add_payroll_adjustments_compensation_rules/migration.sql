-- CreateEnum
CREATE TYPE "PayrollAdjustmentStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "AttendancePayrollRuleKind" AS ENUM ('LATE', 'EARLY_LEAVE', 'MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'ABSENCE');

-- CreateEnum
CREATE TYPE "AttendancePayrollDeductionUnit" AS ENUM ('FIXED', 'PER_OCCURRENCE', 'PER_MINUTE', 'PER_HOUR', 'PER_DAY');

-- CreateTable
CREATE TABLE "employee_compensation_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "compensationId" TEXT,
    "componentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayrollLineType" NOT NULL,
    "sourceType" "PayrollLineSourceType" NOT NULL DEFAULT 'ALLOWANCE',
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isSocialSecurityBase" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_compensation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT,
    "payrollRunId" TEXT,
    "componentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayrollLineType" NOT NULL,
    "sourceType" "PayrollLineSourceType" NOT NULL DEFAULT 'ADJUSTMENT',
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "effectiveDate" DATE,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isSocialSecurityBase" BOOLEAN NOT NULL DEFAULT false,
    "status" "PayrollAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "importedAt" TIMESTAMP(3),
    "importedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 500,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_payroll_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "AttendancePayrollRuleKind" NOT NULL,
    "unit" "AttendancePayrollDeductionUnit" NOT NULL DEFAULT 'PER_OCCURRENCE',
    "componentId" TEXT,
    "componentCode" TEXT,
    "useSalaryRate" BOOLEAN NOT NULL DEFAULT true,
    "rateAmount" DECIMAL(14,4),
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "salaryDivisorDays" DECIMAL(8,2) NOT NULL DEFAULT 30,
    "salaryDivisorHours" DECIMAL(8,2) NOT NULL DEFAULT 8,
    "maxDeductionAmount" DECIMAL(14,2),
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "isSocialSecurityBase" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 600,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_payroll_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_compensation_items_companyId_idx" ON "employee_compensation_items"("companyId");

-- CreateIndex
CREATE INDEX "employee_compensation_items_employeeId_idx" ON "employee_compensation_items"("employeeId");

-- CreateIndex
CREATE INDEX "employee_compensation_items_compensationId_idx" ON "employee_compensation_items"("compensationId");

-- CreateIndex
CREATE INDEX "employee_compensation_items_componentId_idx" ON "employee_compensation_items"("componentId");

-- CreateIndex
CREATE INDEX "employee_compensation_items_code_idx" ON "employee_compensation_items"("code");

-- CreateIndex
CREATE INDEX "employee_compensation_items_type_idx" ON "employee_compensation_items"("type");

-- CreateIndex
CREATE INDEX "employee_compensation_items_sourceType_idx" ON "employee_compensation_items"("sourceType");

-- CreateIndex
CREATE INDEX "employee_compensation_items_effectiveDate_idx" ON "employee_compensation_items"("effectiveDate");

-- CreateIndex
CREATE INDEX "employee_compensation_items_endDate_idx" ON "employee_compensation_items"("endDate");

-- CreateIndex
CREATE INDEX "employee_compensation_items_status_idx" ON "employee_compensation_items"("status");

-- CreateIndex
CREATE INDEX "employee_compensation_items_deletedAt_idx" ON "employee_compensation_items"("deletedAt");

-- CreateIndex
CREATE INDEX "payroll_adjustments_companyId_idx" ON "payroll_adjustments"("companyId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_employeeId_idx" ON "payroll_adjustments"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_periodId_idx" ON "payroll_adjustments"("periodId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_payrollRunId_idx" ON "payroll_adjustments"("payrollRunId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_componentId_idx" ON "payroll_adjustments"("componentId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_code_idx" ON "payroll_adjustments"("code");

-- CreateIndex
CREATE INDEX "payroll_adjustments_type_idx" ON "payroll_adjustments"("type");

-- CreateIndex
CREATE INDEX "payroll_adjustments_sourceType_idx" ON "payroll_adjustments"("sourceType");

-- CreateIndex
CREATE INDEX "payroll_adjustments_effectiveDate_idx" ON "payroll_adjustments"("effectiveDate");

-- CreateIndex
CREATE INDEX "payroll_adjustments_status_idx" ON "payroll_adjustments"("status");

-- CreateIndex
CREATE INDEX "payroll_adjustments_approvedById_idx" ON "payroll_adjustments"("approvedById");

-- CreateIndex
CREATE INDEX "payroll_adjustments_importedById_idx" ON "payroll_adjustments"("importedById");

-- CreateIndex
CREATE INDEX "payroll_adjustments_createdById_idx" ON "payroll_adjustments"("createdById");

-- CreateIndex
CREATE INDEX "payroll_adjustments_deletedAt_idx" ON "payroll_adjustments"("deletedAt");

-- CreateIndex
CREATE INDEX "attendance_payroll_rules_companyId_idx" ON "attendance_payroll_rules"("companyId");

-- CreateIndex
CREATE INDEX "attendance_payroll_rules_kind_idx" ON "attendance_payroll_rules"("kind");

-- CreateIndex
CREATE INDEX "attendance_payroll_rules_unit_idx" ON "attendance_payroll_rules"("unit");

-- CreateIndex
CREATE INDEX "attendance_payroll_rules_componentId_idx" ON "attendance_payroll_rules"("componentId");

-- CreateIndex
CREATE INDEX "attendance_payroll_rules_componentCode_idx" ON "attendance_payroll_rules"("componentCode");

-- CreateIndex
CREATE INDEX "attendance_payroll_rules_status_idx" ON "attendance_payroll_rules"("status");

-- CreateIndex
CREATE INDEX "attendance_payroll_rules_deletedAt_idx" ON "attendance_payroll_rules"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_payroll_rules_companyId_code_key" ON "attendance_payroll_rules"("companyId", "code");
