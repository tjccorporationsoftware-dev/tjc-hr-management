BEGIN;

-- Patch timezone shift for DEV seed attendance cycle 2026-05-26 to 2026-06-25.
-- Problem being fixed:
--   The first seed stored Bangkok local clock values directly in DateTime columns.
--   The API/frontend then displayed those values as Asia/Bangkok, causing +7 hours:
--     07:xx -> 14:xx, 12:xx -> 19:xx, 17:xx -> 00:xx.
--
-- This patch subtracts 7 hours only from records that still look like the wrong seed values.
-- It is guarded so re-running it will not keep subtracting another 7 hours after the data is already fixed.

CREATE OR REPLACE FUNCTION pg_temp._dev_seed_is_wrong_morning(p_ts timestamp)
RETURNS boolean
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT p_ts IS NOT NULL
     AND p_ts::time >= TIME '07:00'
     AND p_ts::time <  TIME '10:00';
$$;

CREATE OR REPLACE FUNCTION pg_temp._dev_seed_is_wrong_afternoon(p_ts timestamp)
RETURNS boolean
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT p_ts IS NOT NULL
     AND p_ts::time >= TIME '12:00'
     AND p_ts::time <  TIME '15:00';
$$;

CREATE OR REPLACE FUNCTION pg_temp._dev_seed_is_wrong_evening(p_ts timestamp)
RETURNS boolean
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT p_ts IS NOT NULL
     AND p_ts::time >= TIME '17:00'
     AND p_ts::time <  TIME '19:30';
$$;

CREATE OR REPLACE FUNCTION pg_temp._dev_seed_is_wrong_request_morning(p_ts timestamp)
RETURNS boolean
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT p_ts IS NOT NULL
     AND p_ts::time >= TIME '07:00'
     AND p_ts::time <  TIME '08:30';
$$;

CREATE OR REPLACE FUNCTION pg_temp._dev_seed_is_wrong_time_adjust_action(p_ts timestamp)
RETURNS boolean
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT p_ts IS NOT NULL
     AND p_ts::time >= TIME '18:00'
     AND p_ts::time <  TIME '19:30';
$$;

CREATE OR REPLACE FUNCTION pg_temp._dev_seed_bkk_minutes(p_ts timestamp)
RETURNS int
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_ts IS NULL THEN NULL
    ELSE (
      EXTRACT(HOUR FROM (p_ts + INTERVAL '7 hours'))::int * 60
      + EXTRACT(MINUTE FROM (p_ts + INTERVAL '7 hours'))::int
    )
  END;
$$;

CREATE TEMP TABLE _patch_counts_before AS
SELECT 'attendance_logs_to_shift' AS key, COUNT(*)::int AS value
FROM "attendance_logs"
WHERE "rawScannerRecordId" LIKE 'DEV64-CYCLE-20260526-%'
  AND (
    ("session" = 'MORNING' AND pg_temp._dev_seed_is_wrong_morning("logTime"))
    OR ("session" = 'AFTERNOON' AND pg_temp._dev_seed_is_wrong_afternoon("logTime"))
    OR ("session" = 'EVENING' AND pg_temp._dev_seed_is_wrong_evening("logTime"))
  )
UNION ALL
SELECT 'attendance_daily_summaries_to_shift', COUNT(*)::int
FROM "attendance_daily_summaries"
WHERE "calculationNote" LIKE 'DEV_SEED_REALISTIC_CYCLE_20260526_20260625%'
  AND (
    pg_temp._dev_seed_is_wrong_morning("morningInAt")
    OR pg_temp._dev_seed_is_wrong_afternoon("afternoonInAt")
    OR pg_temp._dev_seed_is_wrong_evening("checkOutAt")
  )
UNION ALL
SELECT 'leave_requests_to_shift', COUNT(*)::int
FROM "leave_requests"
WHERE "requestNo" LIKE 'LV-CYCLE-20260526-%'
  AND (
    pg_temp._dev_seed_is_wrong_request_morning("submittedAt")
    OR pg_temp._dev_seed_is_wrong_request_morning("approvedAt")
  )
UNION ALL
SELECT 'offsite_requests_to_shift', COUNT(*)::int
FROM "offsite_work_requests"
WHERE "requestNo" LIKE 'OS-CYCLE-20260526-%'
  AND (
    pg_temp._dev_seed_is_wrong_request_morning("submittedAt")
    OR pg_temp._dev_seed_is_wrong_request_morning("approvedAt")
  )
UNION ALL
SELECT 'time_adjust_requests_to_shift', COUNT(*)::int
FROM "time_adjust_requests"
WHERE "requestNo" LIKE 'TA-CYCLE-20260526-%'
  AND (
    pg_temp._dev_seed_is_wrong_evening("requestedLogTime")
    OR pg_temp._dev_seed_is_wrong_time_adjust_action("submittedAt")
    OR pg_temp._dev_seed_is_wrong_time_adjust_action("approvedAt")
    OR pg_temp._dev_seed_is_wrong_time_adjust_action("rejectedAt")
  );

-- 1) Attendance logs: fix actual logTime values.
UPDATE "attendance_logs" l
SET
  "logTime" = l."logTime" - INTERVAL '7 hours',
  "updatedAt" = NOW()
WHERE l."rawScannerRecordId" LIKE 'DEV64-CYCLE-20260526-%'
  AND (
    (l."session" = 'MORNING' AND pg_temp._dev_seed_is_wrong_morning(l."logTime"))
    OR (l."session" = 'AFTERNOON' AND pg_temp._dev_seed_is_wrong_afternoon(l."logTime"))
    OR (l."session" = 'EVENING' AND pg_temp._dev_seed_is_wrong_evening(l."logTime"))
  );

-- 2) Time-adjust requests and related records.
UPDATE "time_adjust_requests" ta
SET
  "originalLogTime" = CASE
    WHEN pg_temp._dev_seed_is_wrong_evening(ta."originalLogTime")
      THEN ta."originalLogTime" - INTERVAL '7 hours'
    ELSE ta."originalLogTime"
  END,
  "requestedLogTime" = CASE
    WHEN pg_temp._dev_seed_is_wrong_evening(ta."requestedLogTime")
      THEN ta."requestedLogTime" - INTERVAL '7 hours'
    ELSE ta."requestedLogTime"
  END,
  "submittedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_time_adjust_action(ta."submittedAt")
      THEN ta."submittedAt" - INTERVAL '7 hours'
    ELSE ta."submittedAt"
  END,
  "approvedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_time_adjust_action(ta."approvedAt")
      THEN ta."approvedAt" - INTERVAL '7 hours'
    ELSE ta."approvedAt"
  END,
  "rejectedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_time_adjust_action(ta."rejectedAt")
      THEN ta."rejectedAt" - INTERVAL '7 hours'
    ELSE ta."rejectedAt"
  END,
  "updatedAt" = NOW()
WHERE ta."requestNo" LIKE 'TA-CYCLE-20260526-%';

UPDATE "time_adjust_logs" tal
SET "createdAt" = tal."createdAt" - INTERVAL '7 hours'
FROM "time_adjust_requests" ta
WHERE tal."timeAdjustRequestId" = ta."id"
  AND ta."requestNo" LIKE 'TA-CYCLE-20260526-%'
  AND pg_temp._dev_seed_is_wrong_time_adjust_action(tal."createdAt");

UPDATE "time_adjust_approval_steps" tas
SET
  "actedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_time_adjust_action(tas."actedAt")
      THEN tas."actedAt" - INTERVAL '7 hours'
    ELSE tas."actedAt"
  END,
  "updatedAt" = NOW()
FROM "time_adjust_requests" ta
WHERE tas."timeAdjustRequestId" = ta."id"
  AND ta."requestNo" LIKE 'TA-CYCLE-20260526-%';

UPDATE "attendance_edit_logs" ael
SET
  "oldLogTime" = CASE
    WHEN pg_temp._dev_seed_is_wrong_evening(ael."oldLogTime")
      THEN ael."oldLogTime" - INTERVAL '7 hours'
    ELSE ael."oldLogTime"
  END,
  "newLogTime" = CASE
    WHEN pg_temp._dev_seed_is_wrong_evening(ael."newLogTime")
      THEN ael."newLogTime" - INTERVAL '7 hours'
    ELSE ael."newLogTime"
  END,
  "createdAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_time_adjust_action(ael."createdAt")
      THEN ael."createdAt" - INTERVAL '7 hours'
    ELSE ael."createdAt"
  END
FROM "time_adjust_requests" ta
WHERE ael."timeAdjustRequestId" = ta."id"
  AND ta."requestNo" LIKE 'TA-CYCLE-20260526-%';

-- 3) Leave requests and approval records.
UPDATE "leave_requests" lr
SET
  "submittedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_request_morning(lr."submittedAt")
      THEN lr."submittedAt" - INTERVAL '7 hours'
    ELSE lr."submittedAt"
  END,
  "approvedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_request_morning(lr."approvedAt")
      THEN lr."approvedAt" - INTERVAL '7 hours'
    ELSE lr."approvedAt"
  END,
  "updatedAt" = NOW()
WHERE lr."requestNo" LIKE 'LV-CYCLE-20260526-%';

UPDATE "leave_approval_logs" lal
SET "createdAt" = lal."createdAt" - INTERVAL '7 hours'
FROM "leave_requests" lr
WHERE lal."leaveRequestId" = lr."id"
  AND lr."requestNo" LIKE 'LV-CYCLE-20260526-%'
  AND pg_temp._dev_seed_is_wrong_request_morning(lal."createdAt");

UPDATE "leave_approval_steps" las
SET
  "actedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_request_morning(las."actedAt")
      THEN las."actedAt" - INTERVAL '7 hours'
    ELSE las."actedAt"
  END,
  "updatedAt" = NOW()
FROM "leave_requests" lr
WHERE las."leaveRequestId" = lr."id"
  AND lr."requestNo" LIKE 'LV-CYCLE-20260526-%';

-- 4) Offsite requests.
UPDATE "offsite_work_requests" os
SET
  "submittedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_request_morning(os."submittedAt")
      THEN os."submittedAt" - INTERVAL '7 hours'
    ELSE os."submittedAt"
  END,
  "approvedAt" = CASE
    WHEN pg_temp._dev_seed_is_wrong_request_morning(os."approvedAt")
      THEN os."approvedAt" - INTERVAL '7 hours'
    ELSE os."approvedAt"
  END,
  "updatedAt" = NOW()
WHERE os."requestNo" LIKE 'OS-CYCLE-20260526-%';

-- 5) Daily summaries: fix display timestamps and recalculate the stored penalty minutes/amounts.
WITH shifted AS (
  SELECT
    s."id",
    CASE
      WHEN pg_temp._dev_seed_is_wrong_morning(s."morningInAt")
        THEN s."morningInAt" - INTERVAL '7 hours'
      ELSE s."morningInAt"
    END AS new_morning_in_at,
    CASE
      WHEN pg_temp._dev_seed_is_wrong_afternoon(s."afternoonInAt")
        THEN s."afternoonInAt" - INTERVAL '7 hours'
      ELSE s."afternoonInAt"
    END AS new_afternoon_in_at,
    CASE
      WHEN pg_temp._dev_seed_is_wrong_evening(s."checkOutAt")
        THEN s."checkOutAt" - INTERVAL '7 hours'
      ELSE s."checkOutAt"
    END AS new_check_out_at,
    s."isAbsent",
    s."hasMissingLog",
    s."missingLogPenaltyAmount",
    s."absentDeductionAmount",
    s."unpaidLeaveDeductionAmount",
    s."calculationNote"
  FROM "attendance_daily_summaries" s
  WHERE s."calculationNote" LIKE 'DEV_SEED_REALISTIC_CYCLE_20260526_20260625%'
),
calc AS (
  SELECT
    shifted.*,
    CASE
      WHEN shifted.new_morning_in_at IS NULL THEN 0
      ELSE GREATEST(pg_temp._dev_seed_bkk_minutes(shifted.new_morning_in_at) - 480, 0)
    END AS new_morning_late_minutes,
    CASE
      WHEN shifted.new_afternoon_in_at IS NULL THEN 0
      ELSE GREATEST(pg_temp._dev_seed_bkk_minutes(shifted.new_afternoon_in_at) - 780, 0)
    END AS new_afternoon_late_minutes,
    CASE
      WHEN shifted.new_check_out_at IS NULL THEN 0
      ELSE GREATEST(1020 - pg_temp._dev_seed_bkk_minutes(shifted.new_check_out_at), 0)
    END AS new_early_checkout_minutes
  FROM shifted
)
UPDATE "attendance_daily_summaries" s
SET
  "morningInAt" = calc.new_morning_in_at,
  "afternoonInAt" = calc.new_afternoon_in_at,
  "checkOutAt" = calc.new_check_out_at,

  "morningLateMinutes" = calc.new_morning_late_minutes,
  "afternoonLateMinutes" = calc.new_afternoon_late_minutes,
  "totalLateMinutes" = calc.new_morning_late_minutes + calc.new_afternoon_late_minutes,

  "earlyCheckoutMinutes" = calc.new_early_checkout_minutes,
  "lateCheckoutMinutes" = 0,
  "extraPresenceMinutes" = 0,

  "latePenaltyAmount" = ((calc.new_morning_late_minutes + calc.new_afternoon_late_minutes) * 5.00)::numeric(14,2),
  "earlyCheckoutPenaltyAmount" = (calc.new_early_checkout_minutes * 5.00)::numeric(14,2),
  "totalDeductionAmount" = (
      ((calc.new_morning_late_minutes + calc.new_afternoon_late_minutes) * 5.00)
      + COALESCE(calc."missingLogPenaltyAmount", 0)
      + (calc.new_early_checkout_minutes * 5.00)
      + COALESCE(calc."absentDeductionAmount", 0)
      + COALESCE(calc."unpaidLeaveDeductionAmount", 0)
    )::numeric(14,2),

  "reviewStatus" = CASE
    WHEN s."isAbsent" = true OR s."hasMissingLog" = true
      THEN 'NEED_REVIEW'::"AttendanceReviewStatus"
    ELSE 'CALCULATED'::"AttendanceReviewStatus"
  END,
  "calculationNote" = CASE
    WHEN s."calculationNote" LIKE '%TZ_PATCH_BKK_UTC_MINUS_7%' THEN s."calculationNote"
    ELSE s."calculationNote" || ' | TZ_PATCH_BKK_UTC_MINUS_7'
  END,
  "calculatedAt" = NOW(),
  "updatedAt" = NOW()
FROM calc
WHERE s."id" = calc."id";

CREATE TEMP TABLE _patch_counts_after AS
SELECT 'attendance_logs_still_wrong' AS key, COUNT(*)::int AS value
FROM "attendance_logs"
WHERE "rawScannerRecordId" LIKE 'DEV64-CYCLE-20260526-%'
  AND (
    ("session" = 'MORNING' AND pg_temp._dev_seed_is_wrong_morning("logTime"))
    OR ("session" = 'AFTERNOON' AND pg_temp._dev_seed_is_wrong_afternoon("logTime"))
    OR ("session" = 'EVENING' AND pg_temp._dev_seed_is_wrong_evening("logTime"))
  )
UNION ALL
SELECT 'daily_summaries_still_wrong', COUNT(*)::int
FROM "attendance_daily_summaries"
WHERE "calculationNote" LIKE 'DEV_SEED_REALISTIC_CYCLE_20260526_20260625%'
  AND (
    pg_temp._dev_seed_is_wrong_morning("morningInAt")
    OR pg_temp._dev_seed_is_wrong_afternoon("afternoonInAt")
    OR pg_temp._dev_seed_is_wrong_evening("checkOutAt")
  );

INSERT INTO "AuditLog" (
  "id",
  "action",
  "entity",
  "entityId",
  "description",
  "userId",
  "requestId",
  "ipAddress",
  "userAgent",
  "method",
  "path",
  "statusCode",
  "metadata",
  "createdAt"
)
VALUES (
  'seed_fix_tz_' || SUBSTR(MD5(clock_timestamp()::text || random()::text), 1, 20),
  'UPDATE'::"AuditAction",
  'DevSeed',
  NULL,
  'Patch timezone shift for realistic attendance seed cycle 2026-05-26 to 2026-06-25',
  NULL,
  NULL,
  NULL,
  'manual-sql',
  'SQL',
  'manual dev seed timezone patch',
  200,
  jsonb_build_object(
    'seedKey', 'DEV_SEED_REALISTIC_CYCLE_20260526_20260625',
    'patch', 'TZ_PATCH_BKK_UTC_MINUS_7',
    'periodStart', '2026-05-26',
    'periodEnd', '2026-06-25',
    'countsBefore', (SELECT jsonb_object_agg(key, value) FROM _patch_counts_before),
    'countsAfter', (SELECT jsonb_object_agg(key, value) FROM _patch_counts_after)
  ),
  NOW()
);

COMMIT;

-- Optional verification query to run manually after this patch:
-- SELECT
--   "workDate",
--   to_char("morningInAt" + interval '7 hours', 'HH24:MI') AS morning_th,
--   to_char("afternoonInAt" + interval '7 hours', 'HH24:MI') AS afternoon_th,
--   to_char("checkOutAt" + interval '7 hours', 'HH24:MI') AS checkout_th,
--   "morningLateMinutes",
--   "afternoonLateMinutes",
--   "earlyCheckoutMinutes",
--   "totalDeductionAmount"
-- FROM "attendance_daily_summaries"
-- WHERE "calculationNote" LIKE 'DEV_SEED_REALISTIC_CYCLE_20260526_20260625%'
-- ORDER BY "workDate" DESC
-- LIMIT 20;
