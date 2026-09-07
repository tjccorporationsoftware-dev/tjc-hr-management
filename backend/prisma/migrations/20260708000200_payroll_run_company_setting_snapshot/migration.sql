-- Add payroll setting snapshot used during Payroll Run calculation
ALTER TABLE "payroll_runs"
ADD COLUMN IF NOT EXISTS "payrollSettingSnapshot" JSONB;
