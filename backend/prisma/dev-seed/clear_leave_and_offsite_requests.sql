UPDATE "attendance_daily_summaries"
SET
  "leaveRequestId" = NULL,
  "leaveTypeId" = NULL,
  "leaveIsPaid" = NULL,
  "leaveDayType" = NULL,
  "leaveDurationDays" = NULL,
  "paidLeaveMinutes" = 0,
  "unpaidLeaveMinutes" = 0,
  "unpaidLeaveDeductionAmount" = 0
WHERE
  "leaveRequestId" IS NOT NULL
  OR "leaveTypeId" IS NOT NULL
  OR "paidLeaveMinutes" <> 0
  OR "unpaidLeaveMinutes" <> 0
  OR "unpaidLeaveDeductionAmount" <> 0;

UPDATE "attendance_logs"
SET
  "isOffsite" = false,
  "offsiteRequestId" = NULL,
  "locationVerified" = NULL,
  "distanceFromApprovedLocationMeters" = NULL,
  "gpsVerificationStatus" = NULL,
  "photoUrl" = NULL
WHERE
  "isOffsite" = true
  OR "offsiteRequestId" IS NOT NULL;

UPDATE "attendance_daily_summaries"
SET "offsiteStatus" = NULL
WHERE "offsiteStatus" IS NOT NULL;

DELETE FROM "leave_balance_ledgers";

DELETE FROM "leave_requests";

DELETE FROM "offsite_work_requests";
