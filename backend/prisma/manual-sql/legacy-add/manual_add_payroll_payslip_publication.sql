-- Batch 10: Payroll Safety / Payslip Publication
-- Run once before using publish/unpublish payslip endpoints.

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS "payslipsPublishedAt" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "payslipsPublishedById" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "payslipsUnpublishedAt" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "payslipsUnpublishedById" TEXT NULL;

CREATE INDEX IF NOT EXISTS "payroll_runs_payslipsPublishedAt_idx"
  ON payroll_runs ("payslipsPublishedAt");

CREATE INDEX IF NOT EXISTS "payroll_runs_payslipsPublishedById_idx"
  ON payroll_runs ("payslipsPublishedById");

CREATE INDEX IF NOT EXISTS "payroll_runs_payslipsUnpublishedAt_idx"
  ON payroll_runs ("payslipsUnpublishedAt");
