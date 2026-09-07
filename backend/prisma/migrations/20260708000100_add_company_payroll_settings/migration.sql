-- Add company-level payroll calculation settings.
-- Each company can own its payroll period/cutoff and calculation bases while system_settings remains the global fallback.

CREATE TABLE "company_payroll_settings" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "payrollCutoffDay" INTEGER NOT NULL,
  "payrollPeriodStartDay" INTEGER NOT NULL,
  "salaryDivisorDays" INTEGER NOT NULL,
  "workingHoursPerDay" INTEGER NOT NULL,
  "socialSecurityEmployeeRate" DECIMAL(5,2) NOT NULL,
  "socialSecurityEmployerRate" DECIMAL(5,2) NOT NULL,
  "socialSecurityMinBase" DECIMAL(14,2) NOT NULL,
  "socialSecurityMaxBase" DECIMAL(14,2) NOT NULL,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_payroll_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_payroll_settings_audit" (
  "id" TEXT NOT NULL,
  "settingId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "previousValue" JSONB NOT NULL,
  "newValue" JSONB NOT NULL,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_payroll_settings_audit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_payroll_settings_companyId_key" ON "company_payroll_settings"("companyId");
CREATE INDEX "company_payroll_settings_companyId_idx" ON "company_payroll_settings"("companyId");
CREATE INDEX "company_payroll_settings_status_idx" ON "company_payroll_settings"("status");
CREATE INDEX "company_payroll_settings_audit_settingId_idx" ON "company_payroll_settings_audit"("settingId");
CREATE INDEX "company_payroll_settings_audit_companyId_idx" ON "company_payroll_settings_audit"("companyId");
CREATE INDEX "company_payroll_settings_audit_changedById_idx" ON "company_payroll_settings_audit"("changedById");
CREATE INDEX "company_payroll_settings_audit_createdAt_idx" ON "company_payroll_settings_audit"("createdAt");

ALTER TABLE "company_payroll_settings"
  ADD CONSTRAINT "company_payroll_settings_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill one setting row per active company from the current global system_settings payroll values.
-- This makes company-level settings available immediately after the migration.
WITH global_setting AS (
  SELECT "value"::jsonb AS value
  FROM "system_settings"
  WHERE "id" = 'system'
  LIMIT 1
), defaults AS (
  SELECT COALESCE((SELECT value FROM global_setting), '{}'::jsonb) AS value
)
INSERT INTO "company_payroll_settings" (
  "id",
  "companyId",
  "payrollCutoffDay",
  "payrollPeriodStartDay",
  "salaryDivisorDays",
  "workingHoursPerDay",
  "socialSecurityEmployeeRate",
  "socialSecurityEmployerRate",
  "socialSecurityMinBase",
  "socialSecurityMaxBase",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('company_payroll_setting_', c."id") AS "id",
  c."id" AS "companyId",
  CASE
    WHEN d.value ? 'payrollCutoffDay' AND (d.value->>'payrollCutoffDay') ~ '^[0-9]+$'
      THEN LEAST(GREATEST((d.value->>'payrollCutoffDay')::int, 1), 31)
    ELSE 25
  END AS "payrollCutoffDay",
  CASE
    WHEN d.value ? 'payrollPeriodStartDay' AND (d.value->>'payrollPeriodStartDay') ~ '^[0-9]+$'
      THEN LEAST(GREATEST((d.value->>'payrollPeriodStartDay')::int, 1), 31)
    ELSE 26
  END AS "payrollPeriodStartDay",
  CASE
    WHEN d.value ? 'salaryDivisorDays' AND (d.value->>'salaryDivisorDays') ~ '^[0-9]+$'
      THEN LEAST(GREATEST((d.value->>'salaryDivisorDays')::int, 1), 31)
    ELSE 30
  END AS "salaryDivisorDays",
  CASE
    WHEN d.value ? 'workingHoursPerDay' AND (d.value->>'workingHoursPerDay') ~ '^[0-9]+$'
      THEN LEAST(GREATEST((d.value->>'workingHoursPerDay')::int, 1), 24)
    ELSE 8
  END AS "workingHoursPerDay",
  CASE
    WHEN d.value ? 'socialSecurityEmployeeRate' AND (d.value->>'socialSecurityEmployeeRate') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN LEAST(GREATEST((d.value->>'socialSecurityEmployeeRate')::numeric, 0), 100)
    ELSE 5
  END AS "socialSecurityEmployeeRate",
  CASE
    WHEN d.value ? 'socialSecurityEmployerRate' AND (d.value->>'socialSecurityEmployerRate') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN LEAST(GREATEST((d.value->>'socialSecurityEmployerRate')::numeric, 0), 100)
    ELSE 5
  END AS "socialSecurityEmployerRate",
  CASE
    WHEN d.value ? 'socialSecurityMinBase' AND (d.value->>'socialSecurityMinBase') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN GREATEST((d.value->>'socialSecurityMinBase')::numeric, 0)
    ELSE 1650
  END AS "socialSecurityMinBase",
  GREATEST(
    CASE
      WHEN d.value ? 'socialSecurityMaxBase' AND (d.value->>'socialSecurityMaxBase') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN GREATEST((d.value->>'socialSecurityMaxBase')::numeric, 0)
      ELSE 17500
    END,
    CASE
      WHEN d.value ? 'socialSecurityMinBase' AND (d.value->>'socialSecurityMinBase') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN GREATEST((d.value->>'socialSecurityMinBase')::numeric, 0)
      ELSE 1650
    END
  ) AS "socialSecurityMaxBase",
  'ACTIVE'::"MasterStatus" AS "status",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN defaults d
WHERE c."deletedAt" IS NULL
ON CONFLICT ("companyId") DO NOTHING;
