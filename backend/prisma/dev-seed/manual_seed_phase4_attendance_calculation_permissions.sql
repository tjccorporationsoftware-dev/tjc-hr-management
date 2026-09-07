-- Phase 4 permission helper: Attendance Daily Summary recalculation.
-- Safe to run multiple times.

INSERT INTO "Permission" ("id", "code", "name", "group", "description", "isActive", "createdAt", "updatedAt")
VALUES
  ('perm_attendance_recalculate', 'ATTENDANCE_RECALCULATE', 'คำนวณสรุปเวลาและค่าปรับใหม่', 'Attendance', 'ใช้สำหรับ POST /api/attendance/daily-summaries/recalculate', true, NOW(), NOW()),
  ('perm_attendance_read_all', 'ATTENDANCE_READ_ALL', 'ดูข้อมูลลงเวลาทั้งองค์กร', 'Attendance', 'ใช้สำหรับ GET /api/attendance/daily-summaries', true, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = NOW();

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('ATTENDANCE_RECALCULATE', 'ATTENDANCE_READ_ALL')
WHERE r."code" IN ('SYSTEM_ADMIN', 'HR_ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
