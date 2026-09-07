-- ตัด index ที่ไม่ได้ใช้งานจริงออก
-- ------------------------------------------------------------------
-- schema มี 667 @@index บน 116 model ซึ่งเกินความจำเป็น กลุ่มที่ตัดในนี้คือ
--
--   1) index คอลัมน์เดียวที่เป็น prefix ซ้ายของ composite/unique ที่มีอยู่แล้ว
--      Postgres ใช้ composite ตอบ query ที่กรองคอลัมน์แรกได้อยู่แล้ว
--      index เดี่ยวจึงเพิ่มแต่ค่าเขียนกับพื้นที่
--   2) index บนคอลัมน์ boolean ซึ่ง cardinality ต่ำเกินกว่า planner จะเลือกใช้
--      (ตรวจแล้วว่าไม่มี query ไหน filter คอลัมน์เหล่านี้แบบเดี่ยว ๆ)
--
-- ตารางที่ได้ประโยชน์มากที่สุดคือ attendance_daily_summaries กับ attendance_logs
-- ซึ่งเขียนหนักสุดตอน recalculate
--
-- ถ้าภายหลังพบว่า query ไหนต้องใช้ index ที่ตัดไป ให้เพิ่มกลับเป็น composite
-- ที่ตรงกับ query นั้นแทนการเพิ่ม index เดี่ยว

-- attendance_daily_summaries
--   [employeeId] covered by index([employeeId, workDate, reviewStatus])
DROP INDEX IF EXISTS "attendance_daily_summaries_employeeId_idx";
--   [workDate] covered by index([workDate, employeeId])
DROP INDEX IF EXISTS "attendance_daily_summaries_workDate_idx";
--   [isAbsent] boolean column
DROP INDEX IF EXISTS "attendance_daily_summaries_isAbsent_idx";

-- leave_requests
--   [employeeId] covered by index([employeeId, status, startDate, endDate])
DROP INDEX IF EXISTS "leave_requests_employeeId_idx";
--   [isRetroactive] boolean column
DROP INDEX IF EXISTS "leave_requests_isRetroactive_idx";
--   [requiresPayrollCorrection] boolean column
DROP INDEX IF EXISTS "leave_requests_requiresPayrollCorrection_idx";

-- Role
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "Role_companyId_idx";
--   [isActive] boolean column
DROP INDEX IF EXISTS "Role_isActive_idx";

-- attendance_logs
--   [employeeId] covered by index([employeeId, workDate])
DROP INDEX IF EXISTS "attendance_logs_employeeId_idx";
--   [isOffsite] boolean column
DROP INDEX IF EXISTS "attendance_logs_isOffsite_idx";

-- payroll_runs
--   [periodId] covered by unique([periodId, runNo])
DROP INDEX IF EXISTS "payroll_runs_periodId_idx";
--   [payslipDetailsVisible] boolean column
DROP INDEX IF EXISTS "payroll_runs_payslipDetailsVisible_idx";

-- payroll_tax_years
--   [companyId] covered by unique([companyId, taxYear])
DROP INDEX IF EXISTS "payroll_tax_years_companyId_idx";
--   [isActive] boolean column
DROP INDEX IF EXISTS "payroll_tax_years_isActive_idx";

-- employee_tax_profiles
--   [employeeId] covered by unique([employeeId, taxYearId])
DROP INDEX IF EXISTS "employee_tax_profiles_employeeId_idx";
--   [taxEnabled] boolean column
DROP INDEX IF EXISTS "employee_tax_profiles_taxEnabled_idx";

-- Permission
--   [isActive] boolean column
DROP INDEX IF EXISTS "Permission_isActive_idx";

-- Branch
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "Branch_companyId_idx";

-- Department
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "Department_companyId_idx";

-- Division
--   [departmentId] covered by unique([departmentId, code])
DROP INDEX IF EXISTS "Division_departmentId_idx";

-- EmployeeType
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "EmployeeType_companyId_idx";

-- Position
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "Position_companyId_idx";

-- approval_matrices
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "approval_matrices_companyId_idx";

-- approval_matrix_requesters
--   [approvalMatrixId] covered by unique([approvalMatrixId, employeeId])
DROP INDEX IF EXISTS "approval_matrix_requesters_approvalMatrixId_idx";

-- approval_matrix_steps
--   [matrixId] covered by unique([matrixId, stepNo])
DROP INDEX IF EXISTS "approval_matrix_steps_matrixId_idx";

-- PaymentAccount
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "PaymentAccount_companyId_idx";

-- TaxMethod
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "TaxMethod_companyId_idx";

-- SocialInsuranceMethod
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "SocialInsuranceMethod_companyId_idx";

-- Notification
--   [userId] covered by index([userId, readAt])
DROP INDEX IF EXISTS "Notification_userId_idx";

-- severance_pay_tiers
--   [settingId] covered by unique([settingId, minServiceMonths])
DROP INDEX IF EXISTS "severance_pay_tiers_settingId_idx";

-- employees
--   [companyId] covered by index([companyId, branchId, departmentId, status, deletedAt])
DROP INDEX IF EXISTS "employees_companyId_idx";

-- holiday_calendars
--   [companyId] covered by unique([companyId, date])
DROP INDEX IF EXISTS "holiday_calendars_companyid_idx";

-- holiday_work_assignments
--   [holidayId] covered by unique([holidayId, targetType, targetId])
DROP INDEX IF EXISTS "holiday_work_assignments_holidayId_idx";

-- substitute_holiday_credits
--   [employeeId] covered by unique([employeeId, earnedDate, sourceType])
DROP INDEX IF EXISTS "substitute_holiday_credits_employeeId_idx";

-- attendance_locations
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "attendance_locations_companyId_idx";

-- attendance_device_enrollments
--   [deviceId] covered by unique([deviceId, deviceUserId])
DROP INDEX IF EXISTS "attendance_device_enrollments_deviceId_idx";

-- attendance_policies
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "attendance_policies_companyId_idx";

-- attendance_raw_events
--   [deviceId] covered by unique([deviceId, rawRecordId])
DROP INDEX IF EXISTS "attendance_raw_events_deviceId_idx";

-- leave_types
--   [companyId] covered by index([companyId, catalogId])
DROP INDEX IF EXISTS "leave_types_companyId_idx";

-- leave_policies
--   [companyId] covered by index([companyId, branchId, leaveTypeId, employeeTypeId])
DROP INDEX IF EXISTS "leave_policies_companyId_idx";

-- leave_quota_tiers
--   [policyId] covered by unique([policyId, minServiceMonths])
DROP INDEX IF EXISTS "leave_quota_tiers_policyId_idx";

-- leave_balances
--   [employeeId] covered by unique([employeeId, leaveTypeId, year])
DROP INDEX IF EXISTS "leave_balances_employeeId_idx";

-- leave_approval_steps
--   [leaveRequestId] covered by unique([leaveRequestId, stepNo])
DROP INDEX IF EXISTS "leave_approval_steps_leaveRequestId_idx";

-- overtime_policies
--   [companyId] covered by index([companyId, branchId, workType, employeeTypeId])
DROP INDEX IF EXISTS "overtime_policies_companyId_idx";

-- overtime_requests
--   [employeeId] covered by index([employeeId, status, workDate])
DROP INDEX IF EXISTS "overtime_requests_employeeId_idx";

-- overtime_approval_steps
--   [overtimeRequestId] covered by unique([overtimeRequestId, stepNo])
DROP INDEX IF EXISTS "overtime_approval_steps_overtimeRequestId_idx";

-- time_adjust_requests
--   [employeeId] covered by index([employeeId, status, requestedLogTime])
DROP INDEX IF EXISTS "time_adjust_requests_employeeId_idx";

-- time_adjust_approval_steps
--   [timeAdjustRequestId] covered by unique([timeAdjustRequestId, stepNo])
DROP INDEX IF EXISTS "time_adjust_approval_steps_timeAdjustRequestId_idx";

-- document_types
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "document_types_companyId_idx";

-- document_templates
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "document_templates_companyId_idx";

-- evaluation_forms
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "evaluation_forms_companyId_idx";

-- warning_letters
--   [companyId] covered by unique([companyId, letterNo])
DROP INDEX IF EXISTS "warning_letters_companyId_idx";

-- onboarding_checklists
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "onboarding_checklists_companyId_idx";

-- offsite_work_requests
--   [employeeId] covered by index([employeeId, status, workDate])
DROP INDEX IF EXISTS "offsite_work_requests_employeeId_idx";

-- payroll_components
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "payroll_components_companyId_idx";

-- employee_compensations
--   [employeeId] covered by unique([employeeId, effectiveDate])
DROP INDEX IF EXISTS "employee_compensations_employeeId_idx";

-- payroll_periods
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "payroll_periods_companyId_idx";

-- payroll_items
--   [runId] covered by unique([runId, employeeId])
DROP INDEX IF EXISTS "payroll_items_runId_idx";

-- payroll_tax_brackets
--   [taxYearId] covered by unique([taxYearId, sortOrder])
DROP INDEX IF EXISTS "payroll_tax_brackets_taxYearId_idx";

-- payroll_tax_allowance_types
--   [taxYearId] covered by unique([taxYearId, code])
DROP INDEX IF EXISTS "payroll_tax_allowance_types_taxYearId_idx";

-- payroll_tax_allowance_limit_groups
--   [taxYearId] covered by unique([taxYearId, code])
DROP INDEX IF EXISTS "payroll_tax_allowance_limit_groups_taxYearId_idx";

-- employee_tax_allowances
--   [taxProfileId] covered by unique([taxProfileId, allowanceTypeId])
DROP INDEX IF EXISTS "employee_tax_allowances_taxProfileId_idx";

-- employee_tax_year_summaries
--   [employeeId] covered by unique([employeeId, taxYearId])
DROP INDEX IF EXISTS "employee_tax_year_summaries_employeeId_idx";

-- hr_review_items
--   [sourceType] covered by unique([sourceType, sourceId])
DROP INDEX IF EXISTS "hr_review_items_sourceType_idx";

-- employee_deduction_plan_entries
--   [planId] covered by unique([planId, payrollRunId])
DROP INDEX IF EXISTS "employee_deduction_plan_entries_planId_idx";

-- attendance_payroll_rules
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "attendance_payroll_rules_companyId_idx";

-- offboarding_checklists
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "offboarding_checklists_companyId_idx";

-- job_postings
--   [companyId] covered by unique([companyId, code])
DROP INDEX IF EXISTS "job_postings_companyId_idx";
