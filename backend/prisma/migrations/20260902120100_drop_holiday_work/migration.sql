-- ถอดฟีเจอร์ใบทำงานวันหยุดออก (ยกเลิกการใช้งาน)
--
-- ย้อนของที่ migration 20260902100000 / 100100 / 100200 สร้างไว้ทั้งหมด
-- สิทธิ์หยุดชดเชยจากการลงเวลาในวันหยุด (ของเดิม) ไม่ถูกแตะ

DROP TABLE IF EXISTS "holiday_work_attachments";
DROP TABLE IF EXISTS "holiday_work_requests";

DROP TYPE IF EXISTS "HolidayWorkAttachmentKind";
DROP TYPE IF EXISTS "HolidayWorkRequestStatus";

-- คืนชนิด "ที่มาของสิทธิ์หยุดชดเชย" ให้เหลือทางเดียวเหมือนเดิม
-- (ลบค่าออกจาก enum ตรง ๆ ไม่ได้ ต้องสร้างชนิดใหม่แล้วย้ายคอลัมน์)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "substitute_holiday_credits" WHERE "sourceType"::text = 'HOLIDAY_WORK_REQUEST'
  ) THEN
    RAISE EXCEPTION 'ยังมีสิทธิ์หยุดชดเชยที่ออกจากใบทำงานวันหยุดอยู่ ถอดชนิดข้อมูลไม่ได้';
  END IF;

  ALTER TYPE "SubstituteHolidayCreditSourceType" RENAME TO "SubstituteHolidayCreditSourceType_old";
  CREATE TYPE "SubstituteHolidayCreditSourceType" AS ENUM ('WORKING_HOLIDAY_ATTENDANCE');

  ALTER TABLE "substitute_holiday_credits" ALTER COLUMN "sourceType" DROP DEFAULT;
  ALTER TABLE "substitute_holiday_credits"
    ALTER COLUMN "sourceType" TYPE "SubstituteHolidayCreditSourceType"
    USING ("sourceType"::text::"SubstituteHolidayCreditSourceType");
  ALTER TABLE "substitute_holiday_credits"
    ALTER COLUMN "sourceType" SET DEFAULT 'WORKING_HOLIDAY_ATTENDANCE';

  DROP TYPE "SubstituteHolidayCreditSourceType_old";
END $$;

-- สิทธิ์การใช้งานของฟีเจอร์นี้ (RolePermission ตามไปเองด้วย FK cascade)
DELETE FROM "Permission" WHERE "code" IN (
  'HOLIDAY_WORK_CREATE',
  'HOLIDAY_WORK_READ',
  'HOLIDAY_WORK_APPROVE'
);

-- ประเภทลา "ลาหยุดชดเชย" ที่ฟีเจอร์นี้สร้างให้อัตโนมัติ
-- ลบเฉพาะกรณีที่ยังไม่มีใบลาไหนใช้ ถ้ามีใบลาแล้วให้คงไว้เพื่อไม่ให้ประวัติหาย
DELETE FROM "leave_balance_ledgers"
WHERE "leaveTypeId" IN (
  SELECT t."id" FROM "leave_types" t
  WHERE t."code" = 'SUB_HOLIDAY'
    AND NOT EXISTS (SELECT 1 FROM "leave_requests" r WHERE r."leaveTypeId" = t."id")
);

DELETE FROM "leave_balances"
WHERE "leaveTypeId" IN (
  SELECT t."id" FROM "leave_types" t
  WHERE t."code" = 'SUB_HOLIDAY'
    AND NOT EXISTS (SELECT 1 FROM "leave_requests" r WHERE r."leaveTypeId" = t."id")
);

DELETE FROM "leave_policies"
WHERE "leaveTypeId" IN (
  SELECT t."id" FROM "leave_types" t
  WHERE t."code" = 'SUB_HOLIDAY'
    AND NOT EXISTS (SELECT 1 FROM "leave_requests" r WHERE r."leaveTypeId" = t."id")
);

DELETE FROM "leave_types" t
WHERE t."code" = 'SUB_HOLIDAY'
  AND NOT EXISTS (SELECT 1 FROM "leave_requests" r WHERE r."leaveTypeId" = t."id");
