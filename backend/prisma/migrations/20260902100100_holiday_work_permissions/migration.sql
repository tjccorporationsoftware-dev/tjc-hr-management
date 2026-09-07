-- สิทธิ์ของใบทำงานวันหยุด
--
-- ผูกให้บทบาทเดิมโดยอิงจากสิทธิ์ OT ที่แต่ละบทบาทมีอยู่แล้ว
-- (ใครยื่น OT เองได้ ก็ยื่นใบทำงานวันหยุดได้ / ใครอนุมัติ OT ได้ ก็อนุมัติใบนี้ได้)
-- ทำแบบนี้เพื่อไม่ต้องรัน seed ทั้งชุดกับฐานข้อมูลที่ใช้งานจริงอยู่แล้ว

INSERT INTO "Permission" ("id", "code", "name", "group", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'HOLIDAY_WORK_CREATE', 'ยื่นใบทำงานวันหยุด', 'Holiday Work', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'HOLIDAY_WORK_READ', 'ดูใบทำงานวันหยุด', 'Holiday Work', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'HOLIDAY_WORK_APPROVE', 'อนุมัติใบทำงานวันหยุด', 'Holiday Work', true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT rp."roleId", target."id", NOW()
FROM "RolePermission" rp
JOIN "Permission" source ON source."id" = rp."permissionId"
JOIN "Permission" target ON target."code" = CASE source."code"
  WHEN 'OT_CREATE' THEN 'HOLIDAY_WORK_CREATE'
  WHEN 'OT_READ' THEN 'HOLIDAY_WORK_READ'
  WHEN 'OT_APPROVE' THEN 'HOLIDAY_WORK_APPROVE'
END
WHERE source."code" IN ('OT_CREATE', 'OT_READ', 'OT_APPROVE')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
