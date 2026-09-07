-- ============================================================================
-- เตรียมเปิดใช้เงื่อนไข "นับวันหยุดนักขัตฤกษ์ / นับวันหยุดประจำสัปดาห์"
--
-- ระบบเดิมนับวันลาตามปฏิทินทั้งหมด (วันหยุดที่คร่อมช่วงลาถูกนับเป็นวันลาด้วย)
-- ซึ่งตรงกับความหมาย includeHoliday = true / includeWeekend = true
--
-- ก่อนหน้านี้คอลัมน์ทั้งสองมีค่าเริ่มต้นเป็น false ทั้งที่ยังไม่มีใครอ่านค่าไปใช้
-- migration นี้จึงตั้งค่าเดิมให้ตรงกับพฤติกรรมจริง ก่อนที่ logic จะเริ่มอ่านค่า
-- เพื่อให้จำนวนวันลาของทุกบริษัทไม่เปลี่ยนในวันที่ deploy
--
-- หลังจากนี้ HR เลือกปิดเองได้ที่ ตั้งค่า > นโยบายการทำงาน > การลา
-- ============================================================================

ALTER TABLE "leave_types"
    ALTER COLUMN "includeHoliday" SET DEFAULT true,
    ALTER COLUMN "includeWeekend" SET DEFAULT true;

ALTER TABLE "leave_type_catalog"
    ALTER COLUMN "includeHoliday" SET DEFAULT true,
    ALTER COLUMN "includeWeekend" SET DEFAULT true;

UPDATE "leave_types"
SET "includeHoliday" = true,
    "includeWeekend" = true
WHERE "deletedAt" IS NULL;

UPDATE "leave_type_catalog"
SET "includeHoliday" = true,
    "includeWeekend" = true
WHERE "deletedAt" IS NULL;
