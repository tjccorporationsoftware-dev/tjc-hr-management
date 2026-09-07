-- Inspect Prisma migration history only.
-- Safe to run: this does not modify data.

SELECT
  migration_name,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at, migration_name;

-- Focus only on records that are in database but not in local migrations:
SELECT
  migration_name,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count,
  logs
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260518023809_phase4_3_time_adjust_core',
  '20260528035433_add_overtime_approval_steps',
  '20260528065634_add_overtime_approval_steps',
  '20260528083643_add_overtime_approval_steps'
)
ORDER BY migration_name;
