-- Phase 6.17.1: Normalize Holiday / Working Holiday / Substitute Holiday storage
-- ย้ายรายการวันหยุด, รายการคนที่ต้องมาทำงานในวันหยุด และสิทธิ์หยุดชดเชย ออกจาก JSON settings ไปเป็นตารางจริง

-- CreateEnum
CREATE TYPE "HolidayCalendarType" AS ENUM ('COMPANY', 'SPECIAL', 'PUBLIC');

-- CreateEnum
CREATE TYPE "HolidayWorkAssignmentTargetType" AS ENUM ('ALL', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'DIVISION', 'EMPLOYEE_TYPE', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "HolidayWorkAssignmentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubstituteHolidayCreditStatus" AS ENUM ('AVAILABLE', 'USED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubstituteHolidayCreditSourceType" AS ENUM ('WORKING_HOLIDAY_ATTENDANCE');

-- CreateTable
CREATE TABLE "holiday_calendars" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "holidayType" "HolidayCalendarType" NOT NULL DEFAULT 'SPECIAL',
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedById" TEXT,

    CONSTRAINT "holiday_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_work_assignments" (
    "id" TEXT NOT NULL,
    "holidayId" TEXT NOT NULL,
    "targetType" "HolidayWorkAssignmentTargetType" NOT NULL,
    "targetId" TEXT NOT NULL DEFAULT 'ALL',
    "name" TEXT NOT NULL,
    "reason" TEXT,
    "grantSubstituteHoliday" BOOLEAN NOT NULL DEFAULT true,
    "status" "HolidayWorkAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledReason" TEXT,

    CONSTRAINT "holiday_work_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitute_holiday_credits" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "earnedDate" DATE NOT NULL,
    "holidayId" TEXT,
    "workAssignmentId" TEXT,
    "holidayNameSnapshot" TEXT,
    "workAssignmentNameSnapshot" TEXT,
    "reasonSnapshot" TEXT,
    "grantedDays" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "grantedMinutes" INTEGER NOT NULL DEFAULT 480,
    "status" "SubstituteHolidayCreditStatus" NOT NULL DEFAULT 'AVAILABLE',
    "sourceType" "SubstituteHolidayCreditSourceType" NOT NULL DEFAULT 'WORKING_HOLIDAY_ATTENDANCE',
    "sourceSummaryId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "substitute_holiday_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendars_date_key" ON "holiday_calendars"("date");
CREATE INDEX "holiday_calendars_holidayType_idx" ON "holiday_calendars"("holidayType");
CREATE INDEX "holiday_calendars_status_idx" ON "holiday_calendars"("status");
CREATE INDEX "holiday_calendars_deletedAt_idx" ON "holiday_calendars"("deletedAt");

CREATE UNIQUE INDEX "holiday_work_assignments_holidayId_targetType_targetId_key" ON "holiday_work_assignments"("holidayId", "targetType", "targetId");
CREATE INDEX "holiday_work_assignments_holidayId_idx" ON "holiday_work_assignments"("holidayId");
CREATE INDEX "holiday_work_assignments_targetType_targetId_idx" ON "holiday_work_assignments"("targetType", "targetId");
CREATE INDEX "holiday_work_assignments_status_idx" ON "holiday_work_assignments"("status");
CREATE INDEX "holiday_work_assignments_deletedAt_idx" ON "holiday_work_assignments"("deletedAt");

CREATE UNIQUE INDEX "substitute_holiday_credits_employeeId_earnedDate_sourceType_key" ON "substitute_holiday_credits"("employeeId", "earnedDate", "sourceType");
CREATE INDEX "substitute_holiday_credits_employeeId_idx" ON "substitute_holiday_credits"("employeeId");
CREATE INDEX "substitute_holiday_credits_earnedDate_idx" ON "substitute_holiday_credits"("earnedDate");
CREATE INDEX "substitute_holiday_credits_holidayId_idx" ON "substitute_holiday_credits"("holidayId");
CREATE INDEX "substitute_holiday_credits_workAssignmentId_idx" ON "substitute_holiday_credits"("workAssignmentId");
CREATE INDEX "substitute_holiday_credits_sourceSummaryId_idx" ON "substitute_holiday_credits"("sourceSummaryId");
CREATE INDEX "substitute_holiday_credits_status_idx" ON "substitute_holiday_credits"("status");
CREATE INDEX "substitute_holiday_credits_deletedAt_idx" ON "substitute_holiday_credits"("deletedAt");

-- AddForeignKey
ALTER TABLE "holiday_work_assignments" ADD CONSTRAINT "holiday_work_assignments_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "holiday_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate legacy JSON settings to normalized tables when previous quick patches were applied.
INSERT INTO "holiday_calendars" ("id", "date", "name", "holidayType", "status", "createdAt", "updatedAt")
SELECT
  'legacy_holiday_' || replace(item->>'date', '-', '_'),
  (item->>'date')::date,
  COALESCE(NULLIF(item->>'name', ''), 'วันหยุดพิเศษ'),
  CASE
    WHEN upper(COALESCE(item->>'holidayType', 'SPECIAL')) IN ('COMPANY', 'SPECIAL', 'PUBLIC')
      THEN upper(COALESCE(item->>'holidayType', 'SPECIAL'))::"HolidayCalendarType"
    ELSE 'SPECIAL'::"HolidayCalendarType"
  END,
  'ACTIVE'::"MasterStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "system_settings" s
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s."value"->'attendanceCustomHolidays', '[]'::jsonb)) item
WHERE s."id" = 'system'
  AND item ? 'date'
ON CONFLICT ("date") DO UPDATE SET
  "name" = EXCLUDED."name",
  "holidayType" = EXCLUDED."holidayType",
  "status" = 'ACTIVE',
  "deletedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Legacy work override: all/company/branch/department/division/employeeType/employee scopes
WITH raw AS (
  SELECT item
  FROM "system_settings" s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s."value"->'attendanceHolidayWorkOverrides', '[]'::jsonb)) item
  WHERE s."id" = 'system' AND item ? 'date'
), normalized AS (
  SELECT
    h."id" AS "holidayId",
    item,
    COALESCE(NULLIF(item->>'name', ''), 'ทำงานในวันหยุด') AS "name",
    NULLIF(item->>'reason', '') AS "reason",
    COALESCE((item->>'grantSubstituteHoliday')::boolean, true) AS "grantSubstituteHoliday"
  FROM raw
  JOIN "holiday_calendars" h ON h."date" = (item->>'date')::date
), scopes AS (
  SELECT "holidayId", item, "name", "reason", "grantSubstituteHoliday", 'ALL'::"HolidayWorkAssignmentTargetType" AS "targetType", 'ALL' AS "targetId"
  FROM normalized
  WHERE COALESCE((item->>'appliesToAll')::boolean, false) = true
  UNION ALL
  SELECT "holidayId", item, "name", "reason", "grantSubstituteHoliday", 'COMPANY'::"HolidayWorkAssignmentTargetType", value
  FROM normalized, LATERAL jsonb_array_elements_text(COALESCE(item->'companyIds', '[]'::jsonb)) value
  UNION ALL
  SELECT "holidayId", item, "name", "reason", "grantSubstituteHoliday", 'BRANCH'::"HolidayWorkAssignmentTargetType", value
  FROM normalized, LATERAL jsonb_array_elements_text(COALESCE(item->'branchIds', '[]'::jsonb)) value
  UNION ALL
  SELECT "holidayId", item, "name", "reason", "grantSubstituteHoliday", 'DEPARTMENT'::"HolidayWorkAssignmentTargetType", value
  FROM normalized, LATERAL jsonb_array_elements_text(COALESCE(item->'departmentIds', '[]'::jsonb)) value
  UNION ALL
  SELECT "holidayId", item, "name", "reason", "grantSubstituteHoliday", 'DIVISION'::"HolidayWorkAssignmentTargetType", value
  FROM normalized, LATERAL jsonb_array_elements_text(COALESCE(item->'divisionIds', '[]'::jsonb)) value
  UNION ALL
  SELECT "holidayId", item, "name", "reason", "grantSubstituteHoliday", 'EMPLOYEE_TYPE'::"HolidayWorkAssignmentTargetType", value
  FROM normalized, LATERAL jsonb_array_elements_text(COALESCE(item->'employeeTypeIds', '[]'::jsonb)) value
  UNION ALL
  SELECT "holidayId", item, "name", "reason", "grantSubstituteHoliday", 'EMPLOYEE'::"HolidayWorkAssignmentTargetType", value
  FROM normalized, LATERAL jsonb_array_elements_text(COALESCE(item->'employeeIds', '[]'::jsonb)) value
)
INSERT INTO "holiday_work_assignments" ("id", "holidayId", "targetType", "targetId", "name", "reason", "grantSubstituteHoliday", "status", "createdAt", "updatedAt")
SELECT
  'legacy_hwa_' || md5("holidayId" || "targetType"::text || COALESCE("targetId", 'ALL')),
  "holidayId",
  "targetType",
  COALESCE(NULLIF("targetId", ''), 'ALL'),
  "name",
  "reason",
  "grantSubstituteHoliday",
  'ACTIVE'::"HolidayWorkAssignmentStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM scopes
WHERE COALESCE(NULLIF("targetId", ''), 'ALL') <> ''
ON CONFLICT ("holidayId", "targetType", "targetId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "reason" = EXCLUDED."reason",
  "grantSubstituteHoliday" = EXCLUDED."grantSubstituteHoliday",
  "status" = 'ACTIVE',
  "deletedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "substitute_holiday_credits" (
  "id", "employeeId", "earnedDate", "holidayNameSnapshot", "workAssignmentNameSnapshot", "reasonSnapshot",
  "grantedDays", "grantedMinutes", "status", "sourceType", "sourceSummaryId", "grantedAt", "grantedById", "usedAt", "usedById",
  "cancelledAt", "cancelledById", "cancelledReason", "createdAt", "updatedAt"
)
SELECT
  COALESCE(NULLIF(item->>'id', ''), 'legacy_shc_' || md5(COALESCE(item->>'employeeId','') || COALESCE(item->>'earnedDate',''))),
  item->>'employeeId',
  (item->>'earnedDate')::date,
  NULLIF(item->>'holidayName', ''),
  NULLIF(item->>'workOverrideName', ''),
  NULLIF(item->>'reason', ''),
  COALESCE(NULLIF(item->>'grantedDays', '')::decimal, 1),
  COALESCE(NULLIF(item->>'grantedMinutes', '')::integer, 480),
  CASE
    WHEN upper(COALESCE(item->>'status', 'AVAILABLE')) IN ('AVAILABLE', 'USED', 'CANCELLED')
      THEN upper(COALESCE(item->>'status', 'AVAILABLE'))::"SubstituteHolidayCreditStatus"
    ELSE 'AVAILABLE'::"SubstituteHolidayCreditStatus"
  END,
  'WORKING_HOLIDAY_ATTENDANCE'::"SubstituteHolidayCreditSourceType",
  NULLIF(item->>'sourceSummaryId', ''),
  COALESCE(NULLIF(item->>'grantedAt', '')::timestamp, CURRENT_TIMESTAMP),
  NULLIF(item->>'grantedById', ''),
  NULLIF(item->>'usedAt', '')::timestamp,
  NULLIF(item->>'usedById', ''),
  NULLIF(item->>'cancelledAt', '')::timestamp,
  NULLIF(item->>'cancelledById', ''),
  NULLIF(item->>'cancelledReason', ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "system_settings" s
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s."value"->'attendanceSubstituteHolidayCredits', '[]'::jsonb)) item
WHERE s."id" = 'system'
  AND item ? 'employeeId'
  AND item ? 'earnedDate'
ON CONFLICT ("employeeId", "earnedDate", "sourceType") DO UPDATE SET
  "holidayNameSnapshot" = EXCLUDED."holidayNameSnapshot",
  "workAssignmentNameSnapshot" = EXCLUDED."workAssignmentNameSnapshot",
  "reasonSnapshot" = EXCLUDED."reasonSnapshot",
  "grantedDays" = EXCLUDED."grantedDays",
  "grantedMinutes" = EXCLUDED."grantedMinutes",
  "status" = EXCLUDED."status",
  "sourceSummaryId" = EXCLUDED."sourceSummaryId",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Keep only policy-like settings in system_settings JSON.
UPDATE "system_settings"
SET "value" = "value" - 'attendanceCustomHolidays' - 'attendanceHolidayWorkOverrides' - 'attendanceSubstituteHolidayCredits',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'system';
