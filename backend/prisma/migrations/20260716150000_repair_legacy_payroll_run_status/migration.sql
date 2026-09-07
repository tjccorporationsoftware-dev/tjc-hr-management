-- Repair legacy payroll run statuses that are no longer part of the Prisma PayrollRunStatus enum.
-- The current official workflow status after source data has been prepared/calculated is CALCULATED.
UPDATE "payroll_runs"
SET
  "status" = 'CALCULATED',
  "updatedAt" = NOW()
WHERE "status"::text = 'SOURCES_READY';
