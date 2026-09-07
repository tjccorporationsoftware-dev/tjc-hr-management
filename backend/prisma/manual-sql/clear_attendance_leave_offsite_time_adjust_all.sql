BEGIN;

-- Clear only transaction/request data for attendance, leave, offsite work, and time-adjust.
-- Keep master data: users, employees, roles, permissions, companies, departments, policies, leave types.
-- IMPORTANT: Run backup before executing this file.

CREATE TEMP TABLE _reset_counts AS
SELECT 'attendance_logs' AS table_name, COUNT(*)::int AS row_count FROM "attendance_logs"
UNION ALL SELECT 'attendance_daily_summaries', COUNT(*)::int FROM "attendance_daily_summaries"
UNION ALL SELECT 'attendance_edit_logs', COUNT(*)::int FROM "attendance_edit_logs"
UNION ALL SELECT 'attendance_raw_events', COUNT(*)::int FROM "attendance_raw_events"
UNION ALL SELECT 'attendance_imports', COUNT(*)::int FROM "attendance_imports"
UNION ALL SELECT 'leave_requests', COUNT(*)::int FROM "leave_requests"
UNION ALL SELECT 'leave_balance_ledgers', COUNT(*)::int FROM "leave_balance_ledgers"
UNION ALL SELECT 'offsite_work_requests', COUNT(*)::int FROM "offsite_work_requests"
UNION ALL SELECT 'time_adjust_requests', COUNT(*)::int FROM "time_adjust_requests"
UNION ALL SELECT 'hr_review_items_leave_time_adjust', COUNT(*)::int FROM "hr_review_items" WHERE "sourceType" IN ('LEAVE', 'TIME_ADJUST')
UNION ALL SELECT 'notifications_related', COUNT(*)::int FROM "Notification"
WHERE "entityType" IN (
  'AttendanceDailySummary',
  'LeaveRequest',
  'OffsiteWorkRequest',
  'TimeAdjustRequest',
  'HrReviewItem'
);

-- Remove notifications related to this reset scope.
DELETE FROM "Notification"
WHERE "entityType" IN (
  'AttendanceDailySummary',
  'LeaveRequest',
  'OffsiteWorkRequest',
  'TimeAdjustRequest',
  'HrReviewItem'
);

-- Remove HR review items created from leave/time-adjust.
-- OVERTIME is intentionally not removed because the requested scope did not include overtime.
DELETE FROM "hr_review_items"
WHERE "sourceType" IN ('LEAVE', 'TIME_ADJUST');

-- Clear time-adjust data.
DELETE FROM "time_adjust_attachments";
DELETE FROM "time_adjust_approval_steps";
DELETE FROM "time_adjust_logs";
DELETE FROM "time_adjust_requests";

-- Clear leave links from attendance summaries before deleting leave requests.
UPDATE "attendance_daily_summaries"
SET
  "leaveRequestId" = NULL,
  "leaveTypeId" = NULL,
  "leaveIsPaid" = NULL,
  "leaveDayType" = NULL,
  "leaveDurationDays" = 0,
  "paidLeaveMinutes" = 0,
  "unpaidLeaveMinutes" = 0,
  "unpaidLeaveDeductionAmount" = 0
WHERE
  "leaveRequestId" IS NOT NULL
  OR "leaveTypeId" IS NOT NULL
  OR "paidLeaveMinutes" <> 0
  OR "unpaidLeaveMinutes" <> 0
  OR "unpaidLeaveDeductionAmount" <> 0;

-- Clear leave requests and leave balance movements.
DELETE FROM "leave_attachments";
DELETE FROM "leave_approval_steps";
DELETE FROM "leave_approval_logs";
DELETE FROM "leave_requests";
DELETE FROM "leave_balance_ledgers";

-- Keep leave balance rows, but reset used/pending values.
UPDATE "leave_balances"
SET
  "usedDays" = 0,
  "pendingDays" = 0,
  "updatedAt" = NOW();

-- Clear offsite markers from attendance data before deleting offsite requests.
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
SET
  "offsiteStatus" = NULL,
  "offsiteMinutes" = 0
WHERE
  "offsiteStatus" IS NOT NULL
  OR "offsiteMinutes" <> 0;

DELETE FROM "offsite_work_requests";

-- Clear attendance data.
DELETE FROM "attendance_edit_logs";
DELETE FROM "attendance_daily_summaries";
DELETE FROM "attendance_logs";
DELETE FROM "attendance_raw_events";
DELETE FROM "attendance_imports";

-- Manual audit log because direct SQL does not pass through NestJS AuditInterceptor.
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
  gen_random_uuid()::text,
  'DELETE',
  'MaintenanceReset',
  NULL,
  'Clear attendance, leave, offsite work and time adjust data for all employees',
  NULL,
  NULL,
  NULL,
  'manual-sql',
  'SQL',
  'manual database reset',
  200,
  jsonb_build_object(
    'scope', ARRAY[
      'attendance_logs',
      'attendance_daily_summaries',
      'attendance_edit_logs',
      'attendance_raw_events',
      'attendance_imports',
      'leave_requests',
      'leave_balance_ledgers',
      'offsite_work_requests',
      'time_adjust_requests',
      'hr_review_items',
      'notifications'
    ],
    'countsBefore', (
      SELECT jsonb_object_agg(table_name, row_count)
      FROM _reset_counts
    )
  ),
  NOW()
);

COMMIT;
