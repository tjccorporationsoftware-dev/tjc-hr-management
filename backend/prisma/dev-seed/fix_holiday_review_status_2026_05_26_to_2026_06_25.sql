BEGIN;

-- Patch normal holidays in the dev seed period so weekly/special holidays without work logs
-- are not left as NEED_REVIEW or missing-log records.
-- Scope is intentionally narrow: 2026-05-26 to 2026-06-25 only.

CREATE TEMP TABLE _holiday_review_patch_targets AS
SELECT s."id"
FROM "attendance_daily_summaries" s
WHERE s."workDate" BETWEEN DATE '2026-05-26' AND DATE '2026-06-25'
  AND s."morningInAt" IS NULL
  AND s."afternoonInAt" IS NULL
  AND s."checkOutAt" IS NULL
  AND (
    UPPER(COALESCE(s."calculationStatus", '')) = 'HOLIDAY'
    OR COALESCE(s."policySnapshot"->'holiday'->>'isHoliday', 'false') = 'true'
    OR COALESCE(s."policySnapshot"->'workingHoliday'->'baseHoliday'->>'isHoliday', 'false') = 'true'
  )
  AND COALESCE(s."policySnapshot"->'holiday'->>'isWorkingHoliday', 'false') <> 'true'
  AND COALESCE(s."policySnapshot"->'workingHoliday'->>'workOverride', 'false') <> 'true'
  AND NOT EXISTS (
    SELECT 1
    FROM "time_adjust_requests" ta
    WHERE ta."employeeId" = s."employeeId"
      AND ta."status" = 'SUBMITTED'::"TimeAdjustRequestStatus"
      AND ta."deletedAt" IS NULL
      AND (ta."requestedLogTime" + INTERVAL '7 hours')::date = s."workDate"
  );

CREATE TEMP TABLE _holiday_review_patch_counts_before AS
SELECT 'targetRows' AS key, COUNT(*)::int AS value FROM _holiday_review_patch_targets
UNION ALL
SELECT 'needReviewBefore', COUNT(*)::int
FROM "attendance_daily_summaries" s
JOIN _holiday_review_patch_targets t ON t."id" = s."id"
WHERE s."reviewStatus" = 'NEED_REVIEW'::"AttendanceReviewStatus"
UNION ALL
SELECT 'missingFlagBefore', COUNT(*)::int
FROM "attendance_daily_summaries" s
JOIN _holiday_review_patch_targets t ON t."id" = s."id"
WHERE s."hasMissingLog" = true
  OR s."isMorningMissing" = true
  OR s."isAfternoonMissing" = true
  OR s."isCheckoutMissing" = true;

UPDATE "attendance_daily_summaries" s
SET
  "reviewStatus" = 'CALCULATED'::"AttendanceReviewStatus",
  "calculationStatus" = 'HOLIDAY',
  "isMorningMissing" = false,
  "isAfternoonMissing" = false,
  "isCheckoutMissing" = false,
  "hasMissingLog" = false,
  "isAbsent" = false,
  "absentDays" = 0,
  "morningLateMinutes" = 0,
  "afternoonLateMinutes" = 0,
  "totalLateMinutes" = 0,
  "earlyCheckoutMinutes" = 0,
  "lateCheckoutMinutes" = 0,
  "extraPresenceMinutes" = 0,
  "latePenaltyAmount" = 0,
  "missingLogPenaltyAmount" = 0,
  "missingMorningPenaltyAmount" = 0,
  "missingAfternoonPenaltyAmount" = 0,
  "missingCheckoutPenaltyAmount" = 0,
  "earlyCheckoutPenaltyAmount" = 0,
  "absentDeductionAmount" = 0,
  "unpaidLeaveDeductionAmount" = 0,
  "totalDeductionAmount" = 0,
  "reviewedAt" = NULL,
  "reviewedById" = NULL,
  "calculationNote" = CASE
    WHEN COALESCE(s."calculationNote", '') LIKE '%PATCH_HOLIDAY_NO_REVIEW%' THEN s."calculationNote"
    WHEN NULLIF(TRIM(COALESCE(s."calculationNote", '')), '') IS NULL THEN 'PATCH_HOLIDAY_NO_REVIEW'
    ELSE s."calculationNote" || ' / PATCH_HOLIDAY_NO_REVIEW'
  END,
  "calculatedAt" = NOW(),
  "updatedAt" = NOW()
FROM _holiday_review_patch_targets t
WHERE s."id" = t."id";

CREATE TEMP TABLE _holiday_review_patch_counts_after AS
SELECT 'stillNeedReviewAfter' AS key, COUNT(*)::int AS value
FROM "attendance_daily_summaries" s
JOIN _holiday_review_patch_targets t ON t."id" = s."id"
WHERE s."reviewStatus" = 'NEED_REVIEW'::"AttendanceReviewStatus"
UNION ALL
SELECT 'stillMissingFlagAfter', COUNT(*)::int
FROM "attendance_daily_summaries" s
JOIN _holiday_review_patch_targets t ON t."id" = s."id"
WHERE s."hasMissingLog" = true
  OR s."isMorningMissing" = true
  OR s."isAfternoonMissing" = true
  OR s."isCheckoutMissing" = true;

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
  'holiday_review_patch_' || SUBSTR(MD5(clock_timestamp()::text || random()::text), 1, 12),
  'UPDATE'::"AuditAction",
  'AttendanceDailySummary',
  NULL,
  'Patch weekly/special holidays without work logs to calculated review status for 2026-05-26 to 2026-06-25',
  NULL,
  NULL,
  NULL,
  'manual-sql',
  'SQL',
  'manual holiday review status patch',
  200,
  jsonb_build_object(
    'periodStart', '2026-05-26',
    'periodEnd', '2026-06-25',
    'scope', 'holiday rows without attendance logs and without pending time adjust requests',
    'patch', 'PATCH_HOLIDAY_NO_REVIEW',
    'countsBefore', (SELECT jsonb_object_agg(key, value) FROM _holiday_review_patch_counts_before),
    'countsAfter', (SELECT jsonb_object_agg(key, value) FROM _holiday_review_patch_counts_after)
  ),
  NOW()
);

COMMIT;

-- Optional verification after running this file:
-- SELECT
--   "workDate",
--   "reviewStatus",
--   "calculationStatus",
--   "hasMissingLog",
--   "isMorningMissing",
--   "isAfternoonMissing",
--   "isCheckoutMissing",
--   "totalDeductionAmount",
--   "calculationNote"
-- FROM "attendance_daily_summaries"
-- WHERE "workDate" BETWEEN DATE '2026-05-26' AND DATE '2026-06-25'
--   AND (
--     UPPER(COALESCE("calculationStatus", '')) = 'HOLIDAY'
--     OR COALESCE("policySnapshot"->'holiday'->>'isHoliday', 'false') = 'true'
--     OR COALESCE("policySnapshot"->'workingHoliday'->'baseHoliday'->>'isHoliday', 'false') = 'true'
--   )
-- ORDER BY "workDate", "employeeId"
-- LIMIT 50;
