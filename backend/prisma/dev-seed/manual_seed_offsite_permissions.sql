-- Phase 6 Offsite Work permissions
-- Safe to run multiple times.

INSERT INTO "Permission" ("id", "code", "name", "group", "description", "isActive", "createdAt", "updatedAt")
VALUES
  ('perm_offsite_request_create', 'OFFSITE_REQUEST_CREATE', 'ยื่นคำขอทำงานนอกสถานที่', 'Offsite Work', NULL, true, NOW(), NOW()),
  ('perm_offsite_request_read', 'OFFSITE_REQUEST_READ', 'ดูคำขอทำงานนอกสถานที่', 'Offsite Work', NULL, true, NOW(), NOW()),
  ('perm_offsite_request_approve', 'OFFSITE_REQUEST_APPROVE', 'อนุมัติคำขอทำงานนอกสถานที่', 'Offsite Work', NULL, true, NOW(), NOW()),
  ('perm_offsite_request_manage', 'OFFSITE_REQUEST_MANAGE', 'จัดการคำขอทำงานนอกสถานที่', 'Offsite Work', NULL, true, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "isActive" = true,
  "updatedAt" = NOW();

-- SYSTEM_ADMIN: all offsite permissions.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'OFFSITE_REQUEST_CREATE',
  'OFFSITE_REQUEST_READ',
  'OFFSITE_REQUEST_APPROVE',
  'OFFSITE_REQUEST_MANAGE'
)
WHERE r."code" = 'SYSTEM_ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- HR_ADMIN: read/create/approve/manage.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'OFFSITE_REQUEST_CREATE',
  'OFFSITE_REQUEST_READ',
  'OFFSITE_REQUEST_APPROVE',
  'OFFSITE_REQUEST_MANAGE'
)
WHERE r."code" = 'HR_ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- MANAGER: read/approve requests assigned by approval matrix.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('OFFSITE_REQUEST_READ', 'OFFSITE_REQUEST_APPROVE')
WHERE r."code" = 'MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- EMPLOYEE: create own requests.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('OFFSITE_REQUEST_CREATE')
WHERE r."code" = 'EMPLOYEE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
