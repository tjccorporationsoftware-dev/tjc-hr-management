-- ============================================================================
-- clear_payroll_all_from_periods.sql
-- HR Workforce Management System / Payroll cleanup utility
--
-- Purpose:
--   Clear all Payroll transaction data starting from Payroll Periods onward,
--   while preserving master/setup data and real HR/attendance source data.
--
-- Target database:
--   PostgreSQL database generated from Prisma schema in backend67.
--
-- IMPORTANT SAFETY NOTES:
--   1) BACKUP the database before running this script.
--   2) Recommended for DEV/UAT cleanup only.
--   3) Do NOT run on Production unless the business owner has approved and a
--      verified backup exists.
--   4) This script keeps audit logs and master payroll setup.
--
-- What this script clears:
--   - payroll_lines
--   - payroll_items
--   - payroll_runs
--   - payroll_periods
--
-- What this script resets:
--   - attendance_daily_summaries payroll links
--   - hr_review_items payroll links
--   - payroll_adjustments import/payroll links
--
-- What this script does NOT delete:
--   - audit_logs
--   - payroll_components
--   - employee_compensations
--   - employee_compensation_items
--   - attendance_payroll_rules
--   - employees
--   - attendance_daily_summaries source calculations
--   - leave_requests / overtime_requests / time_adjust_requests / offsite_work_requests
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Preview counts before cleanup
-- ---------------------------------------------------------------------------
SELECT 'BEFORE payroll_periods' AS item, COUNT(*) AS count FROM payroll_periods
UNION ALL SELECT 'BEFORE payroll_runs', COUNT(*) FROM payroll_runs
UNION ALL SELECT 'BEFORE payroll_items', COUNT(*) FROM payroll_items
UNION ALL SELECT 'BEFORE payroll_lines', COUNT(*) FROM payroll_lines
UNION ALL SELECT 'BEFORE attendance_daily_summaries linked to payroll', COUNT(*)
  FROM attendance_daily_summaries
  WHERE "payrollPeriodId" IS NOT NULL
     OR "payrollRunId" IS NOT NULL
     OR "sentToPayrollAt" IS NOT NULL
     OR "sentToPayrollById" IS NOT NULL
UNION ALL SELECT 'BEFORE hr_review_items linked/sent to payroll', COUNT(*)
  FROM hr_review_items
  WHERE "periodId" IS NOT NULL
     OR "payrollRunId" IS NOT NULL
     OR "sentToPayrollAt" IS NOT NULL
     OR "sentToPayrollById" IS NOT NULL
     OR status = 'SENT_TO_PAYROLL'
UNION ALL SELECT 'BEFORE payroll_adjustments linked/imported to payroll', COUNT(*)
  FROM payroll_adjustments
  WHERE "periodId" IS NOT NULL
     OR "payrollRunId" IS NOT NULL
     OR "importedAt" IS NOT NULL
     OR "importedById" IS NOT NULL
     OR status = 'IMPORTED';

-- ---------------------------------------------------------------------------
-- 2) Reset Attendance Monthly Review payroll links
--    Keep actual attendance summaries/calculated amounts intact.
--    If a day was SENT_TO_PAYROLL, return it to LOCKED when it had lockedAt,
--    otherwise return it to READY_FOR_PAYROLL.
-- ---------------------------------------------------------------------------
UPDATE attendance_daily_summaries
SET
  "payrollPeriodId" = NULL,
  "payrollRunId" = NULL,
  "sentToPayrollAt" = NULL,
  "sentToPayrollById" = NULL,
  "reviewStatus" = CASE
    WHEN "reviewStatus" = 'SENT_TO_PAYROLL' AND "lockedAt" IS NOT NULL THEN 'LOCKED'::"AttendanceReviewStatus"
    WHEN "reviewStatus" = 'SENT_TO_PAYROLL' THEN 'READY_FOR_PAYROLL'::"AttendanceReviewStatus"
    ELSE "reviewStatus"
  END
WHERE "payrollPeriodId" IS NOT NULL
   OR "payrollRunId" IS NOT NULL
   OR "sentToPayrollAt" IS NOT NULL
   OR "sentToPayrollById" IS NOT NULL
   OR "reviewStatus" = 'SENT_TO_PAYROLL';

-- ---------------------------------------------------------------------------
-- 3) Reset legacy HR Review payroll handoff items
--    Keep reviewed/payroll-ready items, but remove period/run handoff links.
-- ---------------------------------------------------------------------------
UPDATE hr_review_items
SET
  "periodId" = NULL,
  "payrollRunId" = NULL,
  "sentToPayrollAt" = NULL,
  "sentToPayrollById" = NULL,
  status = CASE
    WHEN status = 'SENT_TO_PAYROLL' THEN 'PAYROLL_READY'::"HrReviewStatus"
    ELSE status
  END
WHERE "periodId" IS NOT NULL
   OR "payrollRunId" IS NOT NULL
   OR "sentToPayrollAt" IS NOT NULL
   OR "sentToPayrollById" IS NOT NULL
   OR status = 'SENT_TO_PAYROLL';

-- ---------------------------------------------------------------------------
-- 4) Reset payroll adjustments imported into Payroll Runs
--    Keep the adjustment records; return IMPORTED back to APPROVED.
-- ---------------------------------------------------------------------------
UPDATE payroll_adjustments
SET
  "periodId" = NULL,
  "payrollRunId" = NULL,
  "importedAt" = NULL,
  "importedById" = NULL,
  status = CASE
    WHEN status = 'IMPORTED' THEN 'APPROVED'::"PayrollAdjustmentStatus"
    ELSE status
  END
WHERE "periodId" IS NOT NULL
   OR "payrollRunId" IS NOT NULL
   OR "importedAt" IS NOT NULL
   OR "importedById" IS NOT NULL
   OR status = 'IMPORTED';

-- ---------------------------------------------------------------------------
-- 5) Delete Payroll transaction records from child to parent
-- ---------------------------------------------------------------------------
DELETE FROM payroll_lines;
DELETE FROM payroll_items;
DELETE FROM payroll_runs;
DELETE FROM payroll_periods;

-- ---------------------------------------------------------------------------
-- 6) Verify counts after cleanup
-- ---------------------------------------------------------------------------
SELECT 'AFTER payroll_periods' AS item, COUNT(*) AS count FROM payroll_periods
UNION ALL SELECT 'AFTER payroll_runs', COUNT(*) FROM payroll_runs
UNION ALL SELECT 'AFTER payroll_items', COUNT(*) FROM payroll_items
UNION ALL SELECT 'AFTER payroll_lines', COUNT(*) FROM payroll_lines
UNION ALL SELECT 'AFTER attendance_daily_summaries linked to payroll', COUNT(*)
  FROM attendance_daily_summaries
  WHERE "payrollPeriodId" IS NOT NULL
     OR "payrollRunId" IS NOT NULL
     OR "sentToPayrollAt" IS NOT NULL
     OR "sentToPayrollById" IS NOT NULL
UNION ALL SELECT 'AFTER hr_review_items linked/sent to payroll', COUNT(*)
  FROM hr_review_items
  WHERE "periodId" IS NOT NULL
     OR "payrollRunId" IS NOT NULL
     OR "sentToPayrollAt" IS NOT NULL
     OR "sentToPayrollById" IS NOT NULL
     OR status = 'SENT_TO_PAYROLL'
UNION ALL SELECT 'AFTER payroll_adjustments linked/imported to payroll', COUNT(*)
  FROM payroll_adjustments
  WHERE "periodId" IS NOT NULL
     OR "payrollRunId" IS NOT NULL
     OR "importedAt" IS NOT NULL
     OR "importedById" IS NOT NULL
     OR status = 'IMPORTED';

COMMIT;

-- If you want to test without committing, change COMMIT above to ROLLBACK.
