-- HR Review monthly aggregate performance indexes
-- Supports database-side GROUP BY / issue filtering for large payroll periods.

CREATE INDEX IF NOT EXISTS "idx_hr_review_employee_scope"
  ON "employees" ("companyId", "branchId", "departmentId", "status", "deletedAt");

CREATE INDEX IF NOT EXISTS "idx_hr_review_ads_workdate_employee"
  ON "attendance_daily_summaries" ("workDate", "employeeId");

CREATE INDEX IF NOT EXISTS "idx_hr_review_ads_employee_date_status"
  ON "attendance_daily_summaries" ("employeeId", "workDate", "reviewStatus");

CREATE INDEX IF NOT EXISTS "idx_hr_review_ads_workdate_status"
  ON "attendance_daily_summaries" ("workDate", "reviewStatus");

CREATE INDEX IF NOT EXISTS "idx_hr_review_leave_pending"
  ON "leave_requests" ("employeeId", "status", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "idx_hr_review_overtime_pending"
  ON "overtime_requests" ("employeeId", "status", "workDate");

CREATE INDEX IF NOT EXISTS "idx_hr_review_time_adjust_pending"
  ON "time_adjust_requests" ("employeeId", "status", "requestedLogTime");

CREATE INDEX IF NOT EXISTS "idx_hr_review_offsite_pending"
  ON "offsite_work_requests" ("employeeId", "status", "workDate");
