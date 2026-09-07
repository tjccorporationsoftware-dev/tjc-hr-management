-- HR WFM UAT Full System Seed Overlay
-- Recommended usage:
-- 1) Create a separate UAT database, for example hr_workforce_uat
-- 2) npx prisma db push
-- 3) Run base seed manually if needed, for baseline roles/users/password hashes
-- 4) Run this file to create deterministic UAT data
--
-- Note: UAT user passwords copy the hash from admin@hr.local or another base demo user
-- Default password therefore matches the base seed password, for example Admin@123456

DO $$
DECLARE
  v_hash text;
  v_admin_hash_source text;
BEGIN
  IF current_database() NOT ILIKE '%uat%' THEN
    RAISE EXCEPTION 'Refuse to seed database %. This script only runs when database name contains "uat".', current_database();
  END IF;

  SELECT "passwordHash", email
  INTO v_hash, v_admin_hash_source
  FROM "User"
  WHERE email IN ('admin@hr.local', 'hr.manager@hr.local', 'payroll@hr.local')
  ORDER BY CASE email WHEN 'admin@hr.local' THEN 1 WHEN 'hr.manager@hr.local' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'No base seed user found. Run npx prisma db seed before uat_seed_full_system.sql.';
  END IF;

  RAISE NOTICE 'Using password hash copied from % for UAT login users.', v_admin_hash_source;
END $$;

-- =========================================================
-- 1) Permissions / Roles required by UAT
-- =========================================================
INSERT INTO "Permission" (id, code, name, "group", "isActive", "createdAt", "updatedAt")
VALUES
  ('uat_perm_org_read', 'ORG_READ', 'Organization read', 'Organization', true, NOW(), NOW()),
  ('uat_perm_org_manage', 'ORG_MANAGE', 'Organization manage', 'Organization', true, NOW(), NOW()),
  ('uat_perm_employee_read', 'EMPLOYEE_READ', 'Employee read', 'Employee', true, NOW(), NOW()),
  ('uat_perm_employee_create', 'EMPLOYEE_CREATE', 'Employee create', 'Employee', true, NOW(), NOW()),
  ('uat_perm_employee_update', 'EMPLOYEE_UPDATE', 'Employee update', 'Employee', true, NOW(), NOW()),
  ('uat_perm_attendance_read', 'ATTENDANCE_READ', 'Attendance read', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_attendance_read_own', 'ATTENDANCE_READ_OWN', 'Attendance read own', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_attendance_read_team', 'ATTENDANCE_READ_TEAM', 'Attendance read team', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_attendance_read_all', 'ATTENDANCE_READ_ALL', 'Attendance read all', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_attendance_punch_self', 'ATTENDANCE_PUNCH_SELF', 'Attendance punch self', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_attendance_recalculate', 'ATTENDANCE_RECALCULATE', 'Attendance recalculate', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_attendance_policy_read', 'ATTENDANCE_POLICY_READ', 'Attendance policy read', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_attendance_policy_manage', 'ATTENDANCE_POLICY_MANAGE', 'Attendance policy manage', 'Attendance', true, NOW(), NOW()),
  ('uat_perm_leave_read', 'LEAVE_READ', 'Leave read', 'Leave', true, NOW(), NOW()),
  ('uat_perm_leave_create', 'LEAVE_CREATE', 'Leave create', 'Leave', true, NOW(), NOW()),
  ('uat_perm_leave_approve', 'LEAVE_APPROVE', 'Leave approve', 'Leave', true, NOW(), NOW()),
  ('uat_perm_ot_read', 'OT_READ', 'Overtime read', 'Overtime', true, NOW(), NOW()),
  ('uat_perm_ot_create', 'OT_CREATE', 'Overtime create', 'Overtime', true, NOW(), NOW()),
  ('uat_perm_ot_approve', 'OT_APPROVE', 'Overtime approve', 'Overtime', true, NOW(), NOW()),
  ('uat_perm_payroll_read', 'PAYROLL_READ', 'Payroll read', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_payroll_manage', 'PAYROLL_MANAGE', 'Payroll manage', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_payroll_calculate', 'PAYROLL_CALCULATE', 'Payroll calculate', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_payroll_approve', 'PAYROLL_APPROVE', 'Payroll approve', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_payroll_payment_manage', 'PAYROLL_PAYMENT_MANAGE', 'Payroll payment manage', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_payroll_att_read', 'PAYROLL_ATTENDANCE_DEDUCTION_READ', 'Payroll attendance deduction read', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_payroll_att_import', 'PAYROLL_ATTENDANCE_DEDUCTION_IMPORT', 'Payroll attendance deduction import', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_payroll_slip_view', 'PAYROLL_SLIP_VIEW', 'Payroll slip view', 'Payroll', true, NOW(), NOW()),
  ('uat_perm_manpower_read', 'MANPOWER_READ', 'Manpower read', 'Manpower', true, NOW(), NOW()),
  ('uat_perm_report_view', 'REPORT_VIEW', 'Report view', 'Reports', true, NOW(), NOW()),
  ('uat_perm_ess_access', 'ESS_ACCESS', 'ESS access', 'ESS', true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    "group" = EXCLUDED."group",
    "isActive" = true,
    "updatedAt" = NOW();

INSERT INTO "Role" (id, code, name, description, "isSystem", "isActive", "createdAt", "updatedAt")
VALUES
  ('uat_role_system_admin', 'SYSTEM_ADMIN', 'System Admin', 'UAT system admin', true, true, NOW(), NOW()),
  ('uat_role_hr_admin', 'HR_ADMIN', 'HR Admin', 'UAT HR admin', true, true, NOW(), NOW()),
  ('uat_role_payroll', 'PAYROLL_ACCOUNTING', 'Payroll / Accounting', 'UAT payroll role', true, true, NOW(), NOW()),
  ('uat_role_manager', 'MANAGER', 'Manager', 'UAT manager role', true, true, NOW(), NOW()),
  ('uat_role_employee', 'EMPLOYEE', 'Employee', 'UAT employee role', true, true, NOW(), NOW()),
  ('uat_role_executive', 'EXECUTIVE', 'Executive', 'UAT executive role', true, true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    "isActive" = true,
    "updatedAt" = NOW();

-- Assign selected permissions by role. SYSTEM_ADMIN gets all active permissions.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r.id, p.id, NOW()
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.code = 'SYSTEM_ADMIN'
  AND p."isActive" = true
ON CONFLICT DO NOTHING;

WITH role_map(role_code, permission_code) AS (
  VALUES
    ('HR_ADMIN','ORG_READ'),('HR_ADMIN','EMPLOYEE_READ'),('HR_ADMIN','EMPLOYEE_CREATE'),('HR_ADMIN','EMPLOYEE_UPDATE'),
    ('HR_ADMIN','ATTENDANCE_READ'),('HR_ADMIN','ATTENDANCE_READ_ALL'),('HR_ADMIN','ATTENDANCE_RECALCULATE'),
    ('HR_ADMIN','ATTENDANCE_POLICY_READ'),('HR_ADMIN','ATTENDANCE_POLICY_MANAGE'),
    ('HR_ADMIN','LEAVE_READ'),('HR_ADMIN','LEAVE_CREATE'),('HR_ADMIN','LEAVE_APPROVE'),
    ('HR_ADMIN','OT_READ'),('HR_ADMIN','OT_CREATE'),('HR_ADMIN','OT_APPROVE'),('HR_ADMIN','PAYROLL_SLIP_VIEW'),('HR_ADMIN','ESS_ACCESS'),

    ('PAYROLL_ACCOUNTING','ORG_READ'),('PAYROLL_ACCOUNTING','EMPLOYEE_READ'),('PAYROLL_ACCOUNTING','ATTENDANCE_READ'),
    ('PAYROLL_ACCOUNTING','PAYROLL_READ'),('PAYROLL_ACCOUNTING','PAYROLL_MANAGE'),('PAYROLL_ACCOUNTING','PAYROLL_CALCULATE'),
    ('PAYROLL_ACCOUNTING','PAYROLL_APPROVE'),('PAYROLL_ACCOUNTING','PAYROLL_PAYMENT_MANAGE'),
    ('PAYROLL_ACCOUNTING','PAYROLL_ATTENDANCE_DEDUCTION_READ'),('PAYROLL_ACCOUNTING','PAYROLL_ATTENDANCE_DEDUCTION_IMPORT'),
    ('PAYROLL_ACCOUNTING','PAYROLL_SLIP_VIEW'),('PAYROLL_ACCOUNTING','ESS_ACCESS'),

    ('MANAGER','EMPLOYEE_READ'),('MANAGER','ATTENDANCE_READ'),('MANAGER','ATTENDANCE_READ_TEAM'),('MANAGER','ATTENDANCE_POLICY_READ'),
    ('MANAGER','LEAVE_READ'),('MANAGER','LEAVE_APPROVE'),('MANAGER','OT_READ'),('MANAGER','OT_APPROVE'),('MANAGER','ESS_ACCESS'),

    ('EMPLOYEE','ATTENDANCE_PUNCH_SELF'),('EMPLOYEE','ATTENDANCE_READ_OWN'),('EMPLOYEE','LEAVE_CREATE'),('EMPLOYEE','OT_CREATE'),
    ('EMPLOYEE','ESS_ACCESS'),('EMPLOYEE','PAYROLL_SLIP_VIEW'),

    ('EXECUTIVE','ORG_READ'),('EXECUTIVE','MANPOWER_READ'),('EXECUTIVE','REPORT_VIEW')
)
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r.id, p.id, NOW()
FROM role_map m
JOIN "Role" r ON r.code = m.role_code
JOIN "Permission" p ON p.code = m.permission_code
ON CONFLICT DO NOTHING;

-- =========================================================
-- 2) Users
-- =========================================================
WITH hash_source AS (
  SELECT "passwordHash" AS hash
  FROM "User"
  WHERE email IN ('admin@hr.local', 'hr.manager@hr.local', 'payroll@hr.local')
  ORDER BY CASE email WHEN 'admin@hr.local' THEN 1 WHEN 'hr.manager@hr.local' THEN 2 ELSE 3 END
  LIMIT 1
), uat_users(id, email, display_name, phone, role_code) AS (
  VALUES
    ('uat_user_admin', 'uat.admin@hr.local', 'UAT System Admin', '0901000001', 'SYSTEM_ADMIN'),
    ('uat_user_hr', 'uat.hr@hr.local', 'UAT HR Admin', '0901000002', 'HR_ADMIN'),
    ('uat_user_payroll', 'uat.payroll@hr.local', 'UAT Payroll', '0901000003', 'PAYROLL_ACCOUNTING'),
    ('uat_user_executive', 'uat.executive@hr.local', 'UAT Executive', '0901000004', 'EXECUTIVE'),
    ('uat_user_manager_a', 'uat.manager.a@hr.local', 'UAT Manager A', '0901000005', 'MANAGER'),
    ('uat_user_manager_b', 'uat.manager.b@hr.local', 'UAT Manager B', '0901000006', 'MANAGER'),
    ('uat_user_a1', 'uat.employee.a1@hr.local', 'UAT Employee A1', '0901000007', 'EMPLOYEE'),
    ('uat_user_a2', 'uat.employee.a2@hr.local', 'UAT Employee A2', '0901000008', 'EMPLOYEE'),
    ('uat_user_b1', 'uat.employee.b1@hr.local', 'UAT Employee B1', '0901000009', 'EMPLOYEE'),
    ('uat_user_edge', 'uat.employee.edge@hr.local', 'UAT Employee Edge', '0901000010', 'EMPLOYEE')
)
INSERT INTO "User" (id, email, "passwordHash", "displayName", phone, status, "createdAt", "updatedAt")
SELECT id, email, h.hash, display_name, phone, 'ACTIVE', NOW(), NOW()
FROM uat_users
CROSS JOIN hash_source h
ON CONFLICT (email) DO UPDATE
SET "displayName" = EXCLUDED."displayName",
    phone = EXCLUDED.phone,
    "passwordHash" = EXCLUDED."passwordHash",
    status = 'ACTIVE',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

WITH uat_users(email, role_code) AS (
  VALUES
    ('uat.admin@hr.local', 'SYSTEM_ADMIN'),
    ('uat.hr@hr.local', 'HR_ADMIN'),
    ('uat.payroll@hr.local', 'PAYROLL_ACCOUNTING'),
    ('uat.executive@hr.local', 'EXECUTIVE'),
    ('uat.manager.a@hr.local', 'MANAGER'),
    ('uat.manager.b@hr.local', 'MANAGER'),
    ('uat.employee.a1@hr.local', 'EMPLOYEE'),
    ('uat.employee.a2@hr.local', 'EMPLOYEE'),
    ('uat.employee.b1@hr.local', 'EMPLOYEE'),
    ('uat.employee.edge@hr.local', 'EMPLOYEE')
)
INSERT INTO "UserRole" ("userId", "roleId", "createdAt")
SELECT u.id, r.id, NOW()
FROM uat_users m
JOIN "User" u ON u.email = m.email
JOIN "Role" r ON r.code = m.role_code
ON CONFLICT DO NOTHING;

-- =========================================================
-- 3) Organization / employees
-- =========================================================
INSERT INTO "Company" (id, code, "nameTh", "nameEn", status, "createdAt", "updatedAt")
VALUES ('uat_company_tjc', 'UAT-TJC', 'TJC Corporation UAT', 'TJC Corporation UAT', 'ACTIVE', NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET "nameTh" = EXCLUDED."nameTh", "nameEn" = EXCLUDED."nameEn", status = 'ACTIVE', "deletedAt" = NULL, "updatedAt" = NOW();

INSERT INTO "Branch" (id, "companyId", code, "nameTh", "nameEn", status, "createdAt", "updatedAt")
VALUES ('uat_branch_hq', 'uat_company_tjc', 'UAT-HQ', 'UAT Head Office', 'UAT Head Office', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("companyId", code) DO UPDATE SET "nameTh" = EXCLUDED."nameTh", "nameEn" = EXCLUDED."nameEn", status = 'ACTIVE', "deletedAt" = NULL, "updatedAt" = NOW();

INSERT INTO "Department" (id, "companyId", "branchId", code, "nameTh", "nameEn", status, "createdAt", "updatedAt")
VALUES
  ('uat_dept_ops', 'uat_company_tjc', 'uat_branch_hq', 'UAT-OPS', 'UAT Operations', 'UAT Operations', 'ACTIVE', NOW(), NOW()),
  ('uat_dept_sales', 'uat_company_tjc', 'uat_branch_hq', 'UAT-SALES', 'UAT Sales', 'UAT Sales', 'ACTIVE', NOW(), NOW()),
  ('uat_dept_hr', 'uat_company_tjc', 'uat_branch_hq', 'UAT-HR', 'UAT HR', 'UAT HR', 'ACTIVE', NOW(), NOW()),
  ('uat_dept_fin', 'uat_company_tjc', 'uat_branch_hq', 'UAT-FIN', 'UAT Finance', 'UAT Finance', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("companyId", code) DO UPDATE SET "nameTh" = EXCLUDED."nameTh", "nameEn" = EXCLUDED."nameEn", status = 'ACTIVE', "deletedAt" = NULL, "updatedAt" = NOW();

INSERT INTO "EmployeeType" (id, code, "nameTh", "nameEn", status, "createdAt", "updatedAt")
VALUES ('uat_emp_type_monthly', 'UAT-MONTHLY', 'UAT Monthly Employee', 'UAT Monthly', 'ACTIVE', NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET "nameTh" = EXCLUDED."nameTh", "nameEn" = EXCLUDED."nameEn", status = 'ACTIVE', "deletedAt" = NULL, "updatedAt" = NOW();

INSERT INTO "Position" (id, code, "nameTh", "nameEn", level, "sortOrder", status, "createdAt", "updatedAt")
VALUES
  ('uat_pos_manager', 'UAT-MGR', 'UAT Manager', 'UAT Manager', 3, 10, 'ACTIVE', NOW(), NOW()),
  ('uat_pos_staff', 'UAT-STAFF', 'UAT Staff', 'UAT Staff', 1, 20, 'ACTIVE', NOW(), NOW()),
  ('uat_pos_hr', 'UAT-HR', 'UAT HR Staff', 'UAT HR', 2, 30, 'ACTIVE', NOW(), NOW()),
  ('uat_pos_payroll', 'UAT-PAYROLL', 'UAT Payroll Staff', 'UAT Payroll', 2, 40, 'ACTIVE', NOW(), NOW()),
  ('uat_pos_executive', 'UAT-EXEC', 'UAT Executive', 'UAT Executive', 5, 50, 'ACTIVE', NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET "nameTh" = EXCLUDED."nameTh", "nameEn" = EXCLUDED."nameEn", level = EXCLUDED.level, status = 'ACTIVE', "deletedAt" = NULL, "updatedAt" = NOW();

INSERT INTO employees (id, "employeeCode", title, "firstName", "lastName", "displayName", email, phone, position, "positionId", "startDate", status, "companyId", "branchId", "departmentId", "employeeTypeId", "userId", "supervisorId", "createdAt", "updatedAt")
VALUES
  ('uat_emp_hr', 'UAT-HR-001', '', 'HR', 'Admin', 'UAT HR Admin', 'uat.hr@hr.local', '0901000002', 'HR Admin', 'uat_pos_hr', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_hr', 'uat_emp_type_monthly', 'uat_user_hr', NULL, NOW(), NOW()),
  ('uat_emp_payroll', 'UAT-PAY-001', '', 'Payroll', 'Admin', 'UAT Payroll', 'uat.payroll@hr.local', '0901000003', 'Payroll Admin', 'uat_pos_payroll', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_fin', 'uat_emp_type_monthly', 'uat_user_payroll', NULL, NOW(), NOW()),
  ('uat_emp_executive', 'UAT-EXE-001', '', 'Executive', 'User', 'UAT Executive', 'uat.executive@hr.local', '0901000004', 'Executive', 'uat_pos_executive', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_fin', 'uat_emp_type_monthly', 'uat_user_executive', NULL, NOW(), NOW()),
  ('uat_emp_manager_a', 'UAT-MGR-A', '', 'Manager', 'A', 'UAT Manager A', 'uat.manager.a@hr.local', '0901000005', 'Manager', 'uat_pos_manager', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_ops', 'uat_emp_type_monthly', 'uat_user_manager_a', NULL, NOW(), NOW()),
  ('uat_emp_manager_b', 'UAT-MGR-B', '', 'Manager', 'B', 'UAT Manager B', 'uat.manager.b@hr.local', '0901000006', 'Manager', 'uat_pos_manager', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_sales', 'uat_emp_type_monthly', 'uat_user_manager_b', NULL, NOW(), NOW()),
  ('uat_emp_a1', 'UAT-A1', '', 'Employee', 'A1', 'UAT Employee A1', 'uat.employee.a1@hr.local', '0901000007', 'Operations Staff', 'uat_pos_staff', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_ops', 'uat_emp_type_monthly', 'uat_user_a1', 'uat_emp_manager_a', NOW(), NOW()),
  ('uat_emp_a2', 'UAT-A2', '', 'Employee', 'A2', 'UAT Employee A2', 'uat.employee.a2@hr.local', '0901000008', 'Operations Staff', 'uat_pos_staff', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_ops', 'uat_emp_type_monthly', 'uat_user_a2', 'uat_emp_manager_a', NOW(), NOW()),
  ('uat_emp_b1', 'UAT-B1', '', 'Employee', 'B1', 'UAT Employee B1', 'uat.employee.b1@hr.local', '0901000009', 'Sales Staff', 'uat_pos_staff', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_sales', 'uat_emp_type_monthly', 'uat_user_b1', 'uat_emp_manager_b', NOW(), NOW()),
  ('uat_emp_edge', 'UAT-EDGE', '', 'Employee', 'Edge', 'UAT Employee Edge', 'uat.employee.edge@hr.local', '0901000010', 'Edge Case Staff', 'uat_pos_staff', DATE '2025-01-01', 'ACTIVE', 'uat_company_tjc', 'uat_branch_hq', 'uat_dept_ops', 'uat_emp_type_monthly', 'uat_user_edge', 'uat_emp_manager_a', NOW(), NOW())
ON CONFLICT ("employeeCode") DO UPDATE
SET "displayName" = EXCLUDED."displayName",
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    position = EXCLUDED.position,
    "positionId" = EXCLUDED."positionId",
    status = 'ACTIVE',
    "companyId" = EXCLUDED."companyId",
    "branchId" = EXCLUDED."branchId",
    "departmentId" = EXCLUDED."departmentId",
    "employeeTypeId" = EXCLUDED."employeeTypeId",
    "userId" = EXCLUDED."userId",
    "supervisorId" = EXCLUDED."supervisorId",
    "deletedAt" = NULL,
    "updatedAt" = NOW();

-- =========================================================
-- 4) System / attendance / leave policies
-- =========================================================
INSERT INTO system_settings (id, value, "createdAt", "updatedAt", "createdById", "updatedById")
VALUES (
  'system',
  '{"organizationName":"TJC Corporation UAT","timezone":"Asia/Bangkok","locale":"en-US","dateFormat":"DD/MM/YYYY","timeFormat":"HH:mm","fiscalYearStartMonth":1,"fileUploadMaxMb":20,"allowedFileTypes":["pdf","doc","docx","xls","xlsx","png","jpg","jpeg"],"sessionTimeoutMinutes":480,"passwordMinLength":8,"requireUppercase":false,"requireLowercase":false,"requireNumber":false,"requireSymbol":false,"requireTwoFactor":false,"enableEmailNotification":true,"enableLineNotification":false,"maintenanceMode":false}'::jsonb,
  NOW(), NOW(), 'uat_user_admin', 'uat_user_admin'
)
ON CONFLICT (id) DO UPDATE
SET value = EXCLUDED.value,
    "updatedAt" = NOW(),
    "updatedById" = EXCLUDED."updatedById";

INSERT INTO attendance_policies (id, "companyId", "branchId", code, name, description, "morningCheckInDeadline", "afternoonCheckInDeadline", "checkoutAllowedFrom", "latePenaltyRatePerMinute", "missingLogPenaltyPerDay", timezone, "effectiveFrom", status, "createdAt", "updatedAt")
VALUES ('uat_att_policy_default', 'uat_company_tjc', 'uat_branch_hq', 'UAT-DEFAULT', 'UAT Attendance Policy', '08:00 / 13:00 / 17:00, late 5/min, missing 50/day', '08:00', '13:00', '17:00', 5, 50, 'Asia/Bangkok', DATE '2026-06-01', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("companyId", code) DO UPDATE
SET "morningCheckInDeadline" = EXCLUDED."morningCheckInDeadline",
    "afternoonCheckInDeadline" = EXCLUDED."afternoonCheckInDeadline",
    "checkoutAllowedFrom" = EXCLUDED."checkoutAllowedFrom",
    "latePenaltyRatePerMinute" = EXCLUDED."latePenaltyRatePerMinute",
    "missingLogPenaltyPerDay" = EXCLUDED."missingLogPenaltyPerDay",
    timezone = EXCLUDED.timezone,
    "effectiveFrom" = EXCLUDED."effectiveFrom",
    status = 'ACTIVE',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

INSERT INTO leave_types (id, "companyId", code, "nameTh", "nameEn", "isPaid", "requiresAttachment", "allowHalfDay", "allowHourly", status, "createdAt", "updatedAt")
VALUES
  ('uat_leave_type_paid', 'uat_company_tjc', 'UAT-PAID', 'UAT Paid Leave', 'UAT Paid Leave', true, false, true, false, 'ACTIVE', NOW(), NOW()),
  ('uat_leave_type_unpaid', 'uat_company_tjc', 'UAT-UNPAID', 'UAT Unpaid Leave', 'UAT Unpaid Leave', false, false, true, false, 'ACTIVE', NOW(), NOW())
ON CONFLICT ("companyId", code) DO UPDATE
SET "nameTh" = EXCLUDED."nameTh",
    "isPaid" = EXCLUDED."isPaid",
    "allowHalfDay" = true,
    status = 'ACTIVE',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

INSERT INTO leave_policies (id, "companyId", "leaveTypeId", "employeeTypeId", "annualQuotaDays", "maxConsecutiveDays", "allowCarryForward", "carryForwardLimitDays", "requireApproval", status, "createdAt", "updatedAt")
VALUES
  ('uat_leave_policy_paid', 'uat_company_tjc', 'uat_leave_type_paid', 'uat_emp_type_monthly', 10, 5, false, 0, true, 'ACTIVE', NOW(), NOW()),
  ('uat_leave_policy_unpaid', 'uat_company_tjc', 'uat_leave_type_unpaid', 'uat_emp_type_monthly', 0, 30, false, 0, true, 'ACTIVE', NOW(), NOW())
ON CONFLICT ("companyId", "leaveTypeId", "employeeTypeId") DO UPDATE
SET "annualQuotaDays" = EXCLUDED."annualQuotaDays",
    "requireApproval" = true,
    status = 'ACTIVE',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

-- Approved leaves used by attendance calculation edge cases
INSERT INTO leave_requests (id, "requestNo", "employeeId", "leaveTypeId", "startDate", "endDate", "dayType", "totalDays", reason, status, "submittedAt", "approvedAt", "submittedById", "createdAt", "updatedAt")
VALUES
  ('uat_leave_a1_paid_morning_20260604', 'UAT-LV-PAID-MORNING-A1', 'uat_emp_a1', 'uat_leave_type_paid', DATE '2026-06-04', DATE '2026-06-04', 'HALF_DAY_MORNING', 0.5, 'UAT paid morning leave test', 'APPROVED', NOW(), NOW(), 'uat_user_a1', NOW(), NOW()),
  ('uat_leave_a2_paid_afternoon_20260606', 'UAT-LV-PAID-AFTERNOON-A2', 'uat_emp_a2', 'uat_leave_type_paid', DATE '2026-06-06', DATE '2026-06-06', 'HALF_DAY_AFTERNOON', 0.5, 'UAT paid afternoon leave test', 'APPROVED', NOW(), NOW(), 'uat_user_a2', NOW(), NOW()),
  ('uat_leave_edge_unpaid_full_20260605', 'UAT-LV-UNPAID-FULL-EDGE', 'uat_emp_edge', 'uat_leave_type_unpaid', DATE '2026-06-05', DATE '2026-06-05', 'FULL_DAY', 1.0, 'UAT unpaid full day leave test', 'APPROVED', NOW(), NOW(), 'uat_user_edge', NOW(), NOW())
ON CONFLICT ("requestNo") DO UPDATE
SET "employeeId" = EXCLUDED."employeeId",
    "leaveTypeId" = EXCLUDED."leaveTypeId",
    "dayType" = EXCLUDED."dayType",
    "totalDays" = EXCLUDED."totalDays",
    status = 'APPROVED',
    "approvedAt" = NOW(),
    "deletedAt" = NULL,
    "updatedAt" = NOW();

-- =========================================================
-- 5) Attendance logs. logTime is UTC equivalent of Bangkok local time.
-- =========================================================
DELETE FROM attendance_daily_summaries WHERE "employeeId" LIKE 'uat_emp_%';
DELETE FROM attendance_logs WHERE "employeeId" LIKE 'uat_emp_%';

INSERT INTO attendance_logs (id, "employeeId", "workDate", "logType", "logTime", channel, status, source, session, note, "createdById", "createdAt", "updatedAt")
VALUES
  -- A1 normal 01/06/2569
  ('uat_log_a1_20260601_m', 'uat_emp_a1', DATE '2026-06-01', 'CHECK_IN',  TIMESTAMPTZ '2026-06-01 01:00:00+00', 'WEB', 'NORMAL', 'WEB', 'MORNING', 'UAT A1 normal morning', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260601_a', 'uat_emp_a1', DATE '2026-06-01', 'CHECK_IN',  TIMESTAMPTZ '2026-06-01 06:00:00+00', 'WEB', 'NORMAL', 'WEB', 'AFTERNOON', 'UAT A1 normal afternoon', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260601_o', 'uat_emp_a1', DATE '2026-06-01', 'CHECK_OUT', TIMESTAMPTZ '2026-06-01 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT A1 normal checkout', 'uat_user_a1', NOW(), NOW()),
  -- A1 late morning 5 min 02/06/2569
  ('uat_log_a1_20260602_m', 'uat_emp_a1', DATE '2026-06-02', 'CHECK_IN',  TIMESTAMPTZ '2026-06-02 01:05:00+00', 'WEB', 'LATE', 'WEB', 'MORNING', 'UAT A1 late morning 5', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260602_a', 'uat_emp_a1', DATE '2026-06-02', 'CHECK_IN',  TIMESTAMPTZ '2026-06-02 06:00:00+00', 'WEB', 'NORMAL', 'WEB', 'AFTERNOON', 'UAT A1 afternoon', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260602_o', 'uat_emp_a1', DATE '2026-06-02', 'CHECK_OUT', TIMESTAMPTZ '2026-06-02 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT A1 checkout', 'uat_user_a1', NOW(), NOW()),
  -- A1 late afternoon 4 min 03/06/2569
  ('uat_log_a1_20260603_m', 'uat_emp_a1', DATE '2026-06-03', 'CHECK_IN',  TIMESTAMPTZ '2026-06-03 01:00:00+00', 'WEB', 'NORMAL', 'WEB', 'MORNING', 'UAT A1 morning', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260603_a', 'uat_emp_a1', DATE '2026-06-03', 'CHECK_IN',  TIMESTAMPTZ '2026-06-03 06:04:00+00', 'WEB', 'LATE', 'WEB', 'AFTERNOON', 'UAT A1 late afternoon 4', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260603_o', 'uat_emp_a1', DATE '2026-06-03', 'CHECK_OUT', TIMESTAMPTZ '2026-06-03 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT A1 checkout', 'uat_user_a1', NOW(), NOW()),
  -- A1 paid morning leave + late afternoon 7 min 04/06/2569
  ('uat_log_a1_20260604_a', 'uat_emp_a1', DATE '2026-06-04', 'CHECK_IN',  TIMESTAMPTZ '2026-06-04 06:07:00+00', 'WEB', 'LATE', 'WEB', 'AFTERNOON', 'UAT A1 paid morning leave, late afternoon 7', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260604_o', 'uat_emp_a1', DATE '2026-06-04', 'CHECK_OUT', TIMESTAMPTZ '2026-06-04 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT A1 checkout', 'uat_user_a1', NOW(), NOW()),
  -- A1 missing checkout 05/06/2569
  ('uat_log_a1_20260605_m', 'uat_emp_a1', DATE '2026-06-05', 'CHECK_IN',  TIMESTAMPTZ '2026-06-05 01:00:00+00', 'WEB', 'NORMAL', 'WEB', 'MORNING', 'UAT A1 morning', 'uat_user_a1', NOW(), NOW()),
  ('uat_log_a1_20260605_a', 'uat_emp_a1', DATE '2026-06-05', 'CHECK_IN',  TIMESTAMPTZ '2026-06-05 06:00:00+00', 'WEB', 'NORMAL', 'WEB', 'AFTERNOON', 'UAT A1 afternoon', 'uat_user_a1', NOW(), NOW()),

  -- A2 normal then late both, paid afternoon leave
  ('uat_log_a2_20260601_m', 'uat_emp_a2', DATE '2026-06-01', 'CHECK_IN',  TIMESTAMPTZ '2026-06-01 01:00:00+00', 'WEB', 'NORMAL', 'WEB', 'MORNING', 'UAT A2 normal morning', 'uat_user_a2', NOW(), NOW()),
  ('uat_log_a2_20260601_a', 'uat_emp_a2', DATE '2026-06-01', 'CHECK_IN',  TIMESTAMPTZ '2026-06-01 06:00:00+00', 'WEB', 'NORMAL', 'WEB', 'AFTERNOON', 'UAT A2 normal afternoon', 'uat_user_a2', NOW(), NOW()),
  ('uat_log_a2_20260601_o', 'uat_emp_a2', DATE '2026-06-01', 'CHECK_OUT', TIMESTAMPTZ '2026-06-01 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT A2 normal checkout', 'uat_user_a2', NOW(), NOW()),
  ('uat_log_a2_20260602_m', 'uat_emp_a2', DATE '2026-06-02', 'CHECK_IN',  TIMESTAMPTZ '2026-06-02 01:08:00+00', 'WEB', 'LATE', 'WEB', 'MORNING', 'UAT A2 late morning 8', 'uat_user_a2', NOW(), NOW()),
  ('uat_log_a2_20260602_a', 'uat_emp_a2', DATE '2026-06-02', 'CHECK_IN',  TIMESTAMPTZ '2026-06-02 06:03:00+00', 'WEB', 'LATE', 'WEB', 'AFTERNOON', 'UAT A2 late afternoon 3', 'uat_user_a2', NOW(), NOW()),
  ('uat_log_a2_20260602_o', 'uat_emp_a2', DATE '2026-06-02', 'CHECK_OUT', TIMESTAMPTZ '2026-06-02 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT A2 checkout', 'uat_user_a2', NOW(), NOW()),
  ('uat_log_a2_20260606_m', 'uat_emp_a2', DATE '2026-06-06', 'CHECK_IN',  TIMESTAMPTZ '2026-06-06 01:00:00+00', 'WEB', 'NORMAL', 'WEB', 'MORNING', 'UAT A2 paid afternoon leave, no afternoon/checkout needed', 'uat_user_a2', NOW(), NOW()),

  -- B1 normal then missing morning
  ('uat_log_b1_20260601_m', 'uat_emp_b1', DATE '2026-06-01', 'CHECK_IN',  TIMESTAMPTZ '2026-06-01 01:00:00+00', 'WEB', 'NORMAL', 'WEB', 'MORNING', 'UAT B1 normal morning', 'uat_user_b1', NOW(), NOW()),
  ('uat_log_b1_20260601_a', 'uat_emp_b1', DATE '2026-06-01', 'CHECK_IN',  TIMESTAMPTZ '2026-06-01 06:00:00+00', 'WEB', 'NORMAL', 'WEB', 'AFTERNOON', 'UAT B1 normal afternoon', 'uat_user_b1', NOW(), NOW()),
  ('uat_log_b1_20260601_o', 'uat_emp_b1', DATE '2026-06-01', 'CHECK_OUT', TIMESTAMPTZ '2026-06-01 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT B1 normal checkout', 'uat_user_b1', NOW(), NOW()),
  ('uat_log_b1_20260602_a', 'uat_emp_b1', DATE '2026-06-02', 'CHECK_IN',  TIMESTAMPTZ '2026-06-02 06:00:00+00', 'WEB', 'NORMAL', 'WEB', 'AFTERNOON', 'UAT B1 missing morning', 'uat_user_b1', NOW(), NOW()),
  ('uat_log_b1_20260602_o', 'uat_emp_b1', DATE '2026-06-02', 'CHECK_OUT', TIMESTAMPTZ '2026-06-02 10:00:00+00', 'WEB', 'NORMAL', 'WEB', 'EVENING', 'UAT B1 checkout', 'uat_user_b1', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET "logTime" = EXCLUDED."logTime",
    status = EXCLUDED.status,
    source = EXCLUDED.source,
    session = EXCLUDED.session,
    note = EXCLUDED.note,
    "updatedAt" = NOW();

-- =========================================================
-- 6) Payroll master/test data
-- =========================================================
INSERT INTO payroll_components (id, "companyId", code, "nameTh", "nameEn", type, "sourceType", "isTaxable", "isSocialSecurityBase", "isRecurring", "sortOrder", status, "createdAt", "updatedAt")
VALUES
  ('uat_comp_base_salary', 'uat_company_tjc', 'BASE_SALARY', 'Base Salary', 'Base Salary', 'EARNING', 'BASE_SALARY', true, true, true, 100, 'ACTIVE', NOW(), NOW()),
  ('uat_comp_late', 'uat_company_tjc', 'LATE_DEDUCTION', 'Late Deduction', 'Late Deduction', 'DEDUCTION', 'ATTENDANCE', false, false, false, 610, 'ACTIVE', NOW(), NOW()),
  ('uat_comp_missing', 'uat_company_tjc', 'MISSING_LOG_DEDUCTION', 'Missing Log Deduction', 'Missing Log Deduction', 'DEDUCTION', 'ATTENDANCE', false, false, false, 620, 'ACTIVE', NOW(), NOW()),
  ('uat_comp_unpaid_leave', 'uat_company_tjc', 'UNPAID_LEAVE_DEDUCTION', 'Unpaid Leave Deduction', 'Unpaid Leave Deduction', 'DEDUCTION', 'LEAVE', false, false, false, 630, 'ACTIVE', NOW(), NOW()),
  ('uat_comp_ot', 'uat_company_tjc', 'OVERTIME_EARNING', 'Overtime', 'Overtime', 'EARNING', 'OVERTIME', true, false, false, 300, 'ACTIVE', NOW(), NOW()),
  ('uat_comp_adjustment', 'uat_company_tjc', 'ADJUSTMENT', 'Adjustment', 'Adjustment', 'EARNING', 'ADJUSTMENT', true, false, false, 700, 'ACTIVE', NOW(), NOW())
ON CONFLICT ("companyId", code) DO UPDATE
SET "nameTh" = EXCLUDED."nameTh",
    type = EXCLUDED.type,
    "sourceType" = EXCLUDED."sourceType",
    status = 'ACTIVE',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

INSERT INTO attendance_payroll_rules (id, "companyId", code, name, kind, unit, "componentId", "componentCode", "useSalaryRate", "rateAmount", "graceMinutes", "salaryDivisorDays", "salaryDivisorHours", "isTaxable", "isSocialSecurityBase", "sortOrder", status, "createdAt", "updatedAt")
VALUES
  ('uat_rule_late', 'uat_company_tjc', 'UAT-LATE', 'Late deduction from attendance summary', 'LATE', 'PER_MINUTE', 'uat_comp_late', 'LATE_DEDUCTION', false, 5, 0, 30, 8, false, false, 610, 'ACTIVE', NOW(), NOW()),
  ('uat_rule_missing', 'uat_company_tjc', 'UAT-MISSING', 'Missing log deduction from attendance summary', 'MISSING_CHECK_IN', 'PER_OCCURRENCE', 'uat_comp_missing', 'MISSING_LOG_DEDUCTION', false, 50, 0, 30, 8, false, false, 620, 'ACTIVE', NOW(), NOW())
ON CONFLICT ("companyId", code) DO UPDATE
SET name = EXCLUDED.name,
    "componentId" = EXCLUDED."componentId",
    "componentCode" = EXCLUDED."componentCode",
    "rateAmount" = EXCLUDED."rateAmount",
    status = 'ACTIVE',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

INSERT INTO employee_compensations (id, "companyId", "employeeId", "effectiveDate", "baseSalary", "paymentMethod", "bankName", "bankAccountNo", "bankAccountName", "socialSecurityEnabled", "taxEnabled", status, note, "createdAt", "updatedAt")
VALUES
  ('uat_compensation_a1', 'uat_company_tjc', 'uat_emp_a1', DATE '2026-06-01', 20000, 'BANK_TRANSFER', 'UAT Bank', '1111111111', 'UAT Employee A1', true, true, 'ACTIVE', 'UAT base salary', NOW(), NOW()),
  ('uat_compensation_a2', 'uat_company_tjc', 'uat_emp_a2', DATE '2026-06-01', 25000, 'BANK_TRANSFER', 'UAT Bank', '2222222222', 'UAT Employee A2', true, true, 'ACTIVE', 'UAT base salary', NOW(), NOW()),
  ('uat_compensation_b1', 'uat_company_tjc', 'uat_emp_b1', DATE '2026-06-01', 30000, 'BANK_TRANSFER', 'UAT Bank', '3333333333', 'UAT Employee B1', true, true, 'ACTIVE', 'UAT base salary', NOW(), NOW()),
  ('uat_compensation_edge', 'uat_company_tjc', 'uat_emp_edge', DATE '2026-06-01', 15000, 'BANK_TRANSFER', 'UAT Bank', '4444444444', 'UAT Employee Edge', true, true, 'ACTIVE', 'UAT base salary', NOW(), NOW())
ON CONFLICT ("employeeId", "effectiveDate") DO UPDATE
SET "baseSalary" = EXCLUDED."baseSalary",
    "bankAccountName" = EXCLUDED."bankAccountName",
    status = 'ACTIVE',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

INSERT INTO payroll_periods (id, "companyId", code, name, year, month, "startDate", "endDate", "paymentDate", status, "createdById", "createdAt", "updatedAt")
VALUES ('uat_payroll_period_202606', 'uat_company_tjc', 'UAT-2026-06', 'UAT Payroll June 2026', 2026, 6, DATE '2026-06-01', DATE '2026-06-30', DATE '2026-06-30', 'OPEN', 'uat_user_payroll', NOW(), NOW())
ON CONFLICT ("companyId", code) DO UPDATE
SET name = EXCLUDED.name,
    status = 'OPEN',
    "deletedAt" = NULL,
    "updatedAt" = NOW();

INSERT INTO payroll_runs (id, "companyId", "periodId", "runNo", name, status, "totalEmployees", "totalEarnings", "totalDeductions", "totalGrossPay", "totalNetPay", "createdById", note, "createdAt", "updatedAt")
VALUES ('uat_payroll_run_202606', 'uat_company_tjc', 'uat_payroll_period_202606', 'UAT-RUN-2026-06', 'UAT June Payroll', 'DRAFT', 4, 90000, 0, 90000, 90000, 'uat_user_payroll', 'UAT payroll run for attendance deduction testing', NOW(), NOW())
ON CONFLICT ("periodId", "runNo") DO UPDATE
SET name = EXCLUDED.name,
    status = 'DRAFT',
    "totalEmployees" = 4,
    "totalEarnings" = 90000,
    "totalDeductions" = 0,
    "totalGrossPay" = 90000,
    "totalNetPay" = 90000,
    "payslipsPublishedAt" = NULL,
    "payslipsPublishedById" = NULL,
    "payslipsUnpublishedAt" = NULL,
    "payslipsUnpublishedById" = NULL,
    "deletedAt" = NULL,
    "updatedAt" = NOW();

DELETE FROM payroll_lines WHERE "payrollItemId" IN ('uat_payroll_item_a1','uat_payroll_item_a2','uat_payroll_item_b1','uat_payroll_item_edge');
DELETE FROM payroll_items WHERE "runId" = 'uat_payroll_run_202606';

INSERT INTO payroll_items (id, "runId", "employeeId", "compensationId", status, "baseSalary", "totalEarnings", "totalDeductions", "totalGrossPay", "totalNetPay", "workingDays", "createdAt", "updatedAt")
VALUES
  ('uat_payroll_item_a1', 'uat_payroll_run_202606', 'uat_emp_a1', 'uat_compensation_a1', 'DRAFT', 20000, 20000, 0, 20000, 20000, 30, NOW(), NOW()),
  ('uat_payroll_item_a2', 'uat_payroll_run_202606', 'uat_emp_a2', 'uat_compensation_a2', 'DRAFT', 25000, 25000, 0, 25000, 25000, 30, NOW(), NOW()),
  ('uat_payroll_item_b1', 'uat_payroll_run_202606', 'uat_emp_b1', 'uat_compensation_b1', 'DRAFT', 30000, 30000, 0, 30000, 30000, 30, NOW(), NOW()),
  ('uat_payroll_item_edge', 'uat_payroll_run_202606', 'uat_emp_edge', 'uat_compensation_edge', 'DRAFT', 15000, 15000, 0, 15000, 15000, 30, NOW(), NOW());

INSERT INTO payroll_lines (id, "payrollItemId", "componentId", code, name, type, "sourceType", "sourceId", quantity, rate, amount, "isTaxable", "isSocialSecurityBase", "sortOrder", note, "createdAt")
VALUES
  ('uat_line_base_a1', 'uat_payroll_item_a1', 'uat_comp_base_salary', 'BASE_SALARY', 'Base Salary', 'EARNING', 'BASE_SALARY', 'uat_compensation_a1', 1, 20000, 20000, true, true, 100, 'UAT base salary', NOW()),
  ('uat_line_base_a2', 'uat_payroll_item_a2', 'uat_comp_base_salary', 'BASE_SALARY', 'Base Salary', 'EARNING', 'BASE_SALARY', 'uat_compensation_a2', 1, 25000, 25000, true, true, 100, 'UAT base salary', NOW()),
  ('uat_line_base_b1', 'uat_payroll_item_b1', 'uat_comp_base_salary', 'BASE_SALARY', 'Base Salary', 'EARNING', 'BASE_SALARY', 'uat_compensation_b1', 1, 30000, 30000, true, true, 100, 'UAT base salary', NOW()),
  ('uat_line_base_edge', 'uat_payroll_item_edge', 'uat_comp_base_salary', 'BASE_SALARY', 'Base Salary', 'EARNING', 'BASE_SALARY', 'uat_compensation_edge', 1, 15000, 15000, true, true, 100, 'UAT base salary', NOW());

-- =========================================================
-- 7) Audit marker
-- =========================================================
INSERT INTO "AuditLog" (id, action, entity, "entityId", description, "userId", metadata, "createdAt")
VALUES ('uat_audit_seed_marker', 'CREATE', 'UATSeed', 'uat_seed_full_system', 'UAT seed completed', 'uat_user_admin', '{"scope":"full-system","period":"2026-06"}'::jsonb, NOW())
ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description, metadata = EXCLUDED.metadata, "createdAt" = NOW();

-- =========================================================
-- 8) Quick verification output
-- =========================================================
SELECT 'UAT users' AS check_name, COUNT(*) AS count FROM "User" WHERE email LIKE 'uat.%@hr.local'
UNION ALL SELECT 'UAT employees', COUNT(*) FROM employees WHERE "employeeCode" LIKE 'UAT-%'
UNION ALL SELECT 'UAT attendance logs', COUNT(*) FROM attendance_logs WHERE "employeeId" LIKE 'uat_emp_%'
UNION ALL SELECT 'UAT payroll runs', COUNT(*) FROM payroll_runs WHERE id = 'uat_payroll_run_202606';
