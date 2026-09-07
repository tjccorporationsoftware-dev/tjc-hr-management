-- ============================================================================
-- แผนหักเงินเดือนแบบผ่อนงวด — กยศ./กรอ. เงินกู้พนักงาน สหกรณ์
--
-- ต่างจาก payroll_adjustments ตรงที่ตัวนี้มียอดคงเหลือและหักอัตโนมัติทุกงวดจนครบ
-- ส่วน payroll_adjustments เป็นรายการครั้งเดียวเฉพาะงวด
--
-- employee_deduction_plan_entries ใช้กันหักซ้ำเมื่อคำนวณ payroll run ใหม่
-- ด้วย unique(planId, payrollRunId)
-- ============================================================================

CREATE TYPE "EmployeeDeductionPlanType" AS ENUM (
    'STUDENT_LOAN',
    'EMPLOYEE_LOAN',
    'COOPERATIVE',
    'OTHER'
);

CREATE TYPE "EmployeeDeductionPlanStatus" AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'SUSPENDED',
    'CANCELLED'
);

CREATE TABLE "employee_deduction_plans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "planType" "EmployeeDeductionPlanType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceNo" TEXT,
    "totalAmount" DECIMAL(14,2),
    "installmentAmount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "allowPartialDeduction" BOOLEAN NOT NULL DEFAULT true,
    "status" "EmployeeDeductionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_deduction_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_deduction_plans_companyId_idx" ON "employee_deduction_plans"("companyId");
CREATE INDEX "employee_deduction_plans_employeeId_idx" ON "employee_deduction_plans"("employeeId");
CREATE INDEX "employee_deduction_plans_planType_idx" ON "employee_deduction_plans"("planType");
CREATE INDEX "employee_deduction_plans_status_idx" ON "employee_deduction_plans"("status");
CREATE INDEX "employee_deduction_plans_startDate_idx" ON "employee_deduction_plans"("startDate");
CREATE INDEX "employee_deduction_plans_priority_idx" ON "employee_deduction_plans"("priority");
CREATE INDEX "employee_deduction_plans_deletedAt_idx" ON "employee_deduction_plans"("deletedAt");

-- หมายเหตุ: model Company ไม่มี @@map ชื่อตารางจริงจึงเป็น "Company" ตามชื่อ model
ALTER TABLE "employee_deduction_plans"
    ADD CONSTRAINT "employee_deduction_plans_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_deduction_plans"
    ADD CONSTRAINT "employee_deduction_plans_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_deduction_plan_entries" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "payrollItemId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceBefore" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_deduction_plan_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_deduction_plan_entries_planId_payrollRunId_key"
    ON "employee_deduction_plan_entries"("planId", "payrollRunId");
CREATE INDEX "employee_deduction_plan_entries_planId_idx" ON "employee_deduction_plan_entries"("planId");
CREATE INDEX "employee_deduction_plan_entries_payrollRunId_idx" ON "employee_deduction_plan_entries"("payrollRunId");
CREATE INDEX "employee_deduction_plan_entries_payrollItemId_idx" ON "employee_deduction_plan_entries"("payrollItemId");

ALTER TABLE "employee_deduction_plan_entries"
    ADD CONSTRAINT "employee_deduction_plan_entries_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "employee_deduction_plans"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_deduction_plan_entries"
    ADD CONSTRAINT "employee_deduction_plan_entries_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
