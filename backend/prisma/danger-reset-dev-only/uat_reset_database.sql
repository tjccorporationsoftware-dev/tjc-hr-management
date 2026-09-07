-- HR WFM UAT Database Reset
-- ใช้กับฐาน UAT เท่านั้น เช่น hr_workforce_uat
-- ห้ามรันบน dev/prod หลัก

DO $$
DECLARE
  truncate_sql text;
BEGIN
  IF current_database() NOT ILIKE '%uat%' THEN
    RAISE EXCEPTION 'Refuse to reset database %. This script only runs when database name contains "uat".', current_database();
  END IF;

  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
  INTO truncate_sql
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> '_prisma_migrations';

  IF truncate_sql IS NULL THEN
    RAISE NOTICE 'No tables to truncate.';
  ELSE
    EXECUTE truncate_sql;
    RAISE NOTICE 'UAT database % has been reset.', current_database();
  END IF;
END $$;
