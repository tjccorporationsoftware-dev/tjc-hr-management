-- Phase 2 permission repair for Attendance Policy Session Rules
-- Safe to run multiple times. Does not delete any data.

BEGIN;

INSERT INTO "Permission" (id, code, name, "group", description, "isActive", "createdAt", "updatedAt")
VALUES
  ('perm_attendance_policy_read', 'ATTENDANCE_POLICY_READ', 'ดูนโยบายเวลาเข้าออกงาน', 'Attendance', 'View attendance policies and session rules', true, NOW(), NOW()),
  ('perm_attendance_policy_manage', 'ATTENDANCE_POLICY_MANAGE', 'จัดการนโยบายเวลาเข้าออกงาน', 'Attendance', 'Create/update/disable attendance policies', true, NOW(), NOW()),
  ('perm_attendance_session_rule_manage', 'ATTENDANCE_SESSION_RULE_MANAGE', 'จัดการรอบลงเวลา', 'Attendance', 'Create/update/disable attendance session rules', true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  "group" = EXCLUDED."group",
  description = EXCLUDED.description,
  "isActive" = true,
  "updatedAt" = NOW();

-- SYSTEM_ADMIN and HR_ADMIN should be able to manage attendance policies and session rules.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r.id, p.id, NOW()
FROM "Role" r
JOIN "Permission" p ON p.code IN (
  'ATTENDANCE_POLICY_READ',
  'ATTENDANCE_POLICY_MANAGE',
  'ATTENDANCE_SESSION_RULE_MANAGE'
)
WHERE r.code IN ('SYSTEM_ADMIN', 'HR_ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Any custom role that already had ATTENDANCE_POLICY_MANAGE should also receive session-rule management.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT DISTINCT r.id, p_session.id, NOW()
FROM "Role" r
JOIN "RolePermission" rp ON rp."roleId" = r.id
JOIN "Permission" p_manage ON p_manage.id = rp."permissionId"
JOIN "Permission" p_session ON p_session.code = 'ATTENDANCE_SESSION_RULE_MANAGE'
WHERE p_manage.code = 'ATTENDANCE_POLICY_MANAGE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Manager and payroll roles may read policy/session rule data if those roles exist.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r.id, p.id, NOW()
FROM "Role" r
JOIN "Permission" p ON p.code = 'ATTENDANCE_POLICY_READ'
WHERE r.code IN ('MANAGER', 'PAYROLL_ACCOUNTING')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
