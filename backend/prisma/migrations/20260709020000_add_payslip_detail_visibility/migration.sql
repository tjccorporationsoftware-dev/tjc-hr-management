ALTER TABLE "payroll_runs"
  ADD COLUMN "payslipDetailsVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "payslipDetailsVisibilityUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "payslipDetailsVisibilityUpdatedById" TEXT;

CREATE INDEX "payroll_runs_payslipDetailsVisible_idx"
  ON "payroll_runs"("payslipDetailsVisible");

CREATE INDEX "payroll_runs_payslipDetailsVisibilityUpdatedById_idx"
  ON "payroll_runs"("payslipDetailsVisibilityUpdatedById");
