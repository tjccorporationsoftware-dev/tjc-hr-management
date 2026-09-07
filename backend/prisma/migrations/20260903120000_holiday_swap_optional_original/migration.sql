-- ให้วันหยุดเพิ่มโดยไม่ต้องแลกกับวันไหน
--
-- เดิมตารางออกแบบเป็น "ย้ายวันหยุด" จึงบังคับกรอกทั้งวันหยุดเดิมและวันหยุดใหม่
-- แต่ของจริงมีเคสที่บริษัทให้วันหยุดเพิ่มเฉย ๆ ไม่ได้เอาวันไหนไปแลก
-- ถ้าฝืนยัดวันมั่ว ๆ ลงช่องวันหยุดเดิม วันนั้นจะกลายเป็นวันทำงานแล้วถูกนับขาดงานแทน
ALTER TABLE "holiday_swaps" ALTER COLUMN "originalHolidayDate" DROP NOT NULL;

-- Postgres ถือว่า NULL ไม่เท่ากับ NULL ดัชนีกันซ้ำเดิมจึงคุมแถวที่ไม่มีวันหยุดเดิมไม่ได้
-- ต้องแยกเป็นสองตัว: ตัวเดิมคุมเคสย้ายวันหยุด ตัวใหม่คุมเคสให้วันหยุดเพิ่ม
DROP INDEX IF EXISTS "holiday_swaps_active_unique_idx";

CREATE UNIQUE INDEX "holiday_swaps_active_unique_idx"
  ON "holiday_swaps" ("originalHolidayDate", "swappedHolidayDate", "scopeType", "scopeId")
  WHERE "deletedAt" IS NULL
    AND "status" = 'ACTIVE'::"HolidaySwapStatus"
    AND "originalHolidayDate" IS NOT NULL;

CREATE UNIQUE INDEX "holiday_swaps_grant_unique_idx"
  ON "holiday_swaps" ("swappedHolidayDate", "scopeType", "scopeId")
  WHERE "deletedAt" IS NULL
    AND "status" = 'ACTIVE'::"HolidaySwapStatus"
    AND "originalHolidayDate" IS NULL;
