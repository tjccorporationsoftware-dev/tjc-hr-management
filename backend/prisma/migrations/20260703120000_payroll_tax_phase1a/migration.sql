-- Payroll Tax Full System - Phase 1A
-- วางฐานข้อมูลสำหรับปีภาษี ขั้นภาษี ประเภทค่าลดหย่อน โปรไฟล์ภาษี และ snapshot การคำนวณ

CREATE TYPE "PayrollTaxProfileStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "PayrollTaxCalculationStatus" AS ENUM ('DRAFT', 'CALCULATED', 'LOCKED', 'CLOSED');

CREATE TABLE "payroll_tax_years" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "taxYear" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "personalExpenseRate" DECIMAL(8,4) NOT NULL DEFAULT 0.50,
  "personalExpenseMax" DECIMAL(14,2) NOT NULL DEFAULT 100000,
  "standardPersonalAllowance" DECIMAL(14,2) NOT NULL DEFAULT 60000,
  "roundingMethod" TEXT NOT NULL DEFAULT 'ROUND_TO_BAHT',
  "taxAveragingMethod" TEXT NOT NULL DEFAULT 'ANNUALIZED_REMAINING_PERIODS',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "payroll_tax_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_tax_brackets" (
  "id" TEXT NOT NULL,
  "taxYearId" TEXT NOT NULL,
  "minIncome" DECIMAL(14,2) NOT NULL,
  "maxIncome" DECIMAL(14,2),
  "rate" DECIMAL(8,4) NOT NULL,
  "quickDeduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "payroll_tax_brackets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_tax_allowance_types" (
  "id" TEXT NOT NULL,
  "taxYearId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameTh" TEXT NOT NULL,
  "nameEn" TEXT,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "defaultAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "maxAmount" DECIMAL(14,2),
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "payroll_tax_allowance_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_tax_profiles" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "taxYearId" TEXT NOT NULL,
  "taxEnabled" BOOLEAN NOT NULL DEFAULT true,
  "taxId" TEXT,
  "maritalStatus" TEXT,
  "spouseHasIncome" BOOLEAN NOT NULL DEFAULT false,
  "profileStatus" "PayrollTaxProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectReason" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "employee_tax_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_tax_allowances" (
  "id" TEXT NOT NULL,
  "taxProfileId" TEXT NOT NULL,
  "allowanceTypeId" TEXT NOT NULL,
  "declaredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "approvedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "PayrollTaxProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "attachmentUrl" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "employee_tax_allowances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_tax_year_summaries" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "taxYearId" TEXT NOT NULL,
  "taxProfileId" TEXT,
  "totalTaxableIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalTaxWithheld" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalSocialSecurity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalTaxPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "lastCalculatedAt" TIMESTAMP(3),
  "snapshot" JSONB,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_tax_year_summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_tax_calculations" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "payrollItemId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "taxYearId" TEXT NOT NULL,
  "taxProfileId" TEXT,
  "taxableIncomeCurrentRun" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "projectedAnnualIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "expenseDeduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "allowanceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netTaxableIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "annualTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxWithheldYtd" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remainingTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currentRunTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "roundingAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "PayrollTaxCalculationStatus" NOT NULL DEFAULT 'CALCULATED',
  "calculationSnapshot" JSONB,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_tax_calculations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_tax_years_companyId_taxYear_key" ON "payroll_tax_years"("companyId", "taxYear");
CREATE INDEX "payroll_tax_years_companyId_idx" ON "payroll_tax_years"("companyId");
CREATE INDEX "payroll_tax_years_taxYear_idx" ON "payroll_tax_years"("taxYear");
CREATE INDEX "payroll_tax_years_isActive_idx" ON "payroll_tax_years"("isActive");
CREATE INDEX "payroll_tax_years_status_idx" ON "payroll_tax_years"("status");
CREATE INDEX "payroll_tax_years_deletedAt_idx" ON "payroll_tax_years"("deletedAt");

CREATE UNIQUE INDEX "payroll_tax_brackets_taxYearId_sortOrder_key" ON "payroll_tax_brackets"("taxYearId", "sortOrder");
CREATE INDEX "payroll_tax_brackets_taxYearId_idx" ON "payroll_tax_brackets"("taxYearId");
CREATE INDEX "payroll_tax_brackets_minIncome_idx" ON "payroll_tax_brackets"("minIncome");
CREATE INDEX "payroll_tax_brackets_maxIncome_idx" ON "payroll_tax_brackets"("maxIncome");
CREATE INDEX "payroll_tax_brackets_deletedAt_idx" ON "payroll_tax_brackets"("deletedAt");

CREATE UNIQUE INDEX "payroll_tax_allowance_types_taxYearId_code_key" ON "payroll_tax_allowance_types"("taxYearId", "code");
CREATE INDEX "payroll_tax_allowance_types_taxYearId_idx" ON "payroll_tax_allowance_types"("taxYearId");
CREATE INDEX "payroll_tax_allowance_types_code_idx" ON "payroll_tax_allowance_types"("code");
CREATE INDEX "payroll_tax_allowance_types_category_idx" ON "payroll_tax_allowance_types"("category");
CREATE INDEX "payroll_tax_allowance_types_status_idx" ON "payroll_tax_allowance_types"("status");
CREATE INDEX "payroll_tax_allowance_types_deletedAt_idx" ON "payroll_tax_allowance_types"("deletedAt");

CREATE UNIQUE INDEX "employee_tax_profiles_employeeId_taxYearId_key" ON "employee_tax_profiles"("employeeId", "taxYearId");
CREATE INDEX "employee_tax_profiles_companyId_idx" ON "employee_tax_profiles"("companyId");
CREATE INDEX "employee_tax_profiles_employeeId_idx" ON "employee_tax_profiles"("employeeId");
CREATE INDEX "employee_tax_profiles_taxYearId_idx" ON "employee_tax_profiles"("taxYearId");
CREATE INDEX "employee_tax_profiles_taxEnabled_idx" ON "employee_tax_profiles"("taxEnabled");
CREATE INDEX "employee_tax_profiles_profileStatus_idx" ON "employee_tax_profiles"("profileStatus");
CREATE INDEX "employee_tax_profiles_approvedById_idx" ON "employee_tax_profiles"("approvedById");
CREATE INDEX "employee_tax_profiles_deletedAt_idx" ON "employee_tax_profiles"("deletedAt");

CREATE UNIQUE INDEX "employee_tax_allowances_taxProfileId_allowanceTypeId_key" ON "employee_tax_allowances"("taxProfileId", "allowanceTypeId");
CREATE INDEX "employee_tax_allowances_taxProfileId_idx" ON "employee_tax_allowances"("taxProfileId");
CREATE INDEX "employee_tax_allowances_allowanceTypeId_idx" ON "employee_tax_allowances"("allowanceTypeId");
CREATE INDEX "employee_tax_allowances_status_idx" ON "employee_tax_allowances"("status");
CREATE INDEX "employee_tax_allowances_approvedById_idx" ON "employee_tax_allowances"("approvedById");
CREATE INDEX "employee_tax_allowances_deletedAt_idx" ON "employee_tax_allowances"("deletedAt");

CREATE UNIQUE INDEX "employee_tax_year_summaries_employeeId_taxYearId_key" ON "employee_tax_year_summaries"("employeeId", "taxYearId");
CREATE INDEX "employee_tax_year_summaries_companyId_idx" ON "employee_tax_year_summaries"("companyId");
CREATE INDEX "employee_tax_year_summaries_employeeId_idx" ON "employee_tax_year_summaries"("employeeId");
CREATE INDEX "employee_tax_year_summaries_taxYearId_idx" ON "employee_tax_year_summaries"("taxYearId");
CREATE INDEX "employee_tax_year_summaries_taxProfileId_idx" ON "employee_tax_year_summaries"("taxProfileId");
CREATE INDEX "employee_tax_year_summaries_lastCalculatedAt_idx" ON "employee_tax_year_summaries"("lastCalculatedAt");

CREATE UNIQUE INDEX "payroll_tax_calculations_payrollItemId_key" ON "payroll_tax_calculations"("payrollItemId");
CREATE INDEX "payroll_tax_calculations_companyId_idx" ON "payroll_tax_calculations"("companyId");
CREATE INDEX "payroll_tax_calculations_payrollRunId_idx" ON "payroll_tax_calculations"("payrollRunId");
CREATE INDEX "payroll_tax_calculations_employeeId_idx" ON "payroll_tax_calculations"("employeeId");
CREATE INDEX "payroll_tax_calculations_taxYearId_idx" ON "payroll_tax_calculations"("taxYearId");
CREATE INDEX "payroll_tax_calculations_taxProfileId_idx" ON "payroll_tax_calculations"("taxProfileId");
CREATE INDEX "payroll_tax_calculations_status_idx" ON "payroll_tax_calculations"("status");

ALTER TABLE "payroll_tax_years" ADD CONSTRAINT "payroll_tax_years_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_brackets" ADD CONSTRAINT "payroll_tax_brackets_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "payroll_tax_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_allowance_types" ADD CONSTRAINT "payroll_tax_allowance_types_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "payroll_tax_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_tax_profiles" ADD CONSTRAINT "employee_tax_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_tax_profiles" ADD CONSTRAINT "employee_tax_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_tax_profiles" ADD CONSTRAINT "employee_tax_profiles_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "payroll_tax_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_tax_allowances" ADD CONSTRAINT "employee_tax_allowances_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "employee_tax_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_tax_allowances" ADD CONSTRAINT "employee_tax_allowances_allowanceTypeId_fkey" FOREIGN KEY ("allowanceTypeId") REFERENCES "payroll_tax_allowance_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_tax_year_summaries" ADD CONSTRAINT "employee_tax_year_summaries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_tax_year_summaries" ADD CONSTRAINT "employee_tax_year_summaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_tax_year_summaries" ADD CONSTRAINT "employee_tax_year_summaries_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "payroll_tax_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_tax_year_summaries" ADD CONSTRAINT "employee_tax_year_summaries_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "employee_tax_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_calculations" ADD CONSTRAINT "payroll_tax_calculations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_calculations" ADD CONSTRAINT "payroll_tax_calculations_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_calculations" ADD CONSTRAINT "payroll_tax_calculations_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "payroll_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_calculations" ADD CONSTRAINT "payroll_tax_calculations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_calculations" ADD CONSTRAINT "payroll_tax_calculations_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "payroll_tax_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_tax_calculations" ADD CONSTRAINT "payroll_tax_calculations_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "employee_tax_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
