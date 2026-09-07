INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'ESS_ACCESS',
  'OFFSITE_REQUEST_CREATE'
)
WHERE r."code" IN (
  'SYSTEM_ADMIN',
  'HR_ADMIN',
  'EMPLOYEE'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
