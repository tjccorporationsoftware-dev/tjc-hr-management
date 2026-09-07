-- DEV/STAGING ONLY. BACKUP DATABASE BEFORE USING.
-- This removes only wrong/old Prisma migration HISTORY records.
-- It does NOT drop any real table, enum, index, or data.
--
-- Use only if:
-- 1) You confirmed these migration folders do not exist locally.
-- 2) This database is not production, OR you have a verified backup.
-- 3) You understand this only reconciles Prisma migration history.

BEGIN;

-- Check target rows before delete
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260518023809_phase4_3_time_adjust_core',
  '20260528035433_add_overtime_approval_steps',
  '20260528065634_add_overtime_approval_steps',
  '20260528083643_add_overtime_approval_steps'
)
ORDER BY migration_name;

-- Uncomment only after confirming the SELECT above is correct.
-- DELETE FROM "_prisma_migrations"
-- WHERE migration_name IN (
--   '20260518023809_phase4_3_time_adjust_core',
--   '20260528035433_add_overtime_approval_steps',
--   '20260528065634_add_overtime_approval_steps',
--   '20260528083643_add_overtime_approval_steps'
-- );

-- Keep as ROLLBACK by default for safety.
-- Change ROLLBACK to COMMIT only when you intentionally want to apply.
ROLLBACK;
-- COMMIT;
