-- Manual seed for clearly separated Attendance/Payroll permissions.
-- Use this when you do not want ORG_MANAGE to unlock the attendance policy page.
-- Safe to run multiple times.

INSERT INTO "Permission" ("id", "code", "name", "group", "description", "isActive", "createdAt", "updatedAt")
VALUES
  ('perm_attendance_policy_read', 'ATTENDANCE_POLICY_READ', 'ดูนโยบายเวลาเข้าออกงาน', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_attendance_policy_manage', 'ATTENDANCE_POLICY_MANAGE', 'จัดการนโยบายเวลาเข้าออกงาน', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_attendance_punch_self', 'ATTENDANCE_PUNCH_SELF', 'บันทึกเวลาเข้าออกของตนเอง', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_attendance_read_own', 'ATTENDANCE_READ_OWN', 'ดูข้อมูลลงเวลาของตนเอง', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_attendance_read_team', 'ATTENDANCE_READ_TEAM', 'ดูข้อมูลลงเวลาของทีม', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_attendance_read_all', 'ATTENDANCE_READ_ALL', 'ดูข้อมูลลงเวลาทั้งองค์กร', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_attendance_import_scanner', 'ATTENDANCE_IMPORT_SCANNER', 'นำเข้าข้อมูลจากเครื่องสแกน', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_attendance_recalculate', 'ATTENDANCE_RECALCULATE', 'คำนวณสรุปเวลาและค่าปรับใหม่', 'Attendance', NULL, true, NOW(), NOW()),
  ('perm_payroll_attendance_deduction_read', 'PAYROLL_ATTENDANCE_DEDUCTION_READ', 'ดูยอดหักจากเวลาเข้าออกงาน', 'Payroll', NULL, true, NOW(), NOW()),
  ('perm_payroll_attendance_deduction_import', 'PAYROLL_ATTENDANCE_DEDUCTION_IMPORT', 'นำเข้ายอดหักจากเวลาเข้าออกงานเข้าเงินเดือน', 'Payroll', NULL, true, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "isActive" = true,
  "updatedAt" = NOW();

-- SYSTEM_ADMIN: all new permissions.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'ATTENDANCE_POLICY_READ',
  'ATTENDANCE_POLICY_MANAGE',
  'ATTENDANCE_PUNCH_SELF',
  'ATTENDANCE_READ_OWN',
  'ATTENDANCE_READ_TEAM',
  'ATTENDANCE_READ_ALL',
  'ATTENDANCE_IMPORT_SCANNER',
  'ATTENDANCE_RECALCULATE',
  'PAYROLL_ATTENDANCE_DEDUCTION_READ',
  'PAYROLL_ATTENDANCE_DEDUCTION_IMPORT'
)
WHERE r."code" = 'SYSTEM_ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- HR_ADMIN: manage attendance policy and organization-wide attendance operations.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'ATTENDANCE_POLICY_READ',
  'ATTENDANCE_POLICY_MANAGE',
  'ATTENDANCE_READ_ALL',
  'ATTENDANCE_IMPORT_SCANNER',
  'ATTENDANCE_RECALCULATE'
)
WHERE r."code" = 'HR_ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- MANAGER: read own team's attendance and policy only.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'ATTENDANCE_POLICY_READ',
  'ATTENDANCE_READ_TEAM'
)
WHERE r."code" = 'MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- PAYROLL_ACCOUNTING: read policy and import attendance deductions, without broad system admin rights.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'ATTENDANCE_POLICY_READ',
  'PAYROLL_ATTENDANCE_DEDUCTION_READ',
  'PAYROLL_ATTENDANCE_DEDUCTION_IMPORT'
)
WHERE r."code" = 'PAYROLL_ACCOUNTING'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- EMPLOYEE: punch and read own attendance only.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'ATTENDANCE_PUNCH_SELF',
  'ATTENDANCE_READ_OWN'
)
WHERE r."code" = 'EMPLOYEE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
