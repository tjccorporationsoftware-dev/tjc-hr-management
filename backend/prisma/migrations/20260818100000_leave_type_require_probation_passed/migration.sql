-- แยก "ต้องผ่านบรรจุก่อนถึงจะลาได้" ออกจาก "นับอายุงานจากวันไหน"
--
-- ของเดิมใช้ serviceStartBasis ตัวเดียวทำสองหน้าที่ปนกัน
--   1. ฐานนับอายุงานเพื่อคิดโควตา
--   2. ด่านบล็อกไม่ให้ยื่นใบลา (โยน error)
-- HR ที่ตั้งให้ลาพักร้อนนับอายุงานจากวันบรรจุ จึงเผลอบล็อกลาป่วยกับลาคลอด
-- ของพนักงานทดลองงานไปด้วย ซึ่งขัด พ.ร.บ.คุ้มครองแรงงาน ม.32 และ ม.41

ALTER TABLE "leave_types"
  ADD COLUMN IF NOT EXISTS "requireProbationPassed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "leave_type_catalog"
  ADD COLUMN IF NOT EXISTS "requireProbationPassed" BOOLEAN NOT NULL DEFAULT false;

-- ย้ายค่าเดิมมาที่ฟิลด์ใหม่ เพื่อไม่ให้พฤติกรรมที่ HR ตั้งใจไว้หายไป
--
-- ยกเว้นสิทธิลาที่กฎหมายให้ไว้ ซึ่งผูกกับการผ่านทดลองงานไม่ได้อยู่แล้ว
--   ม.32 ลาป่วย · ม.33 ลาทำหมัน · ม.34 ลากิจธุระจำเป็น
--   ม.35 ลาทหาร · ม.41 ลาคลอด
-- เทียบด้วย LIKE เพราะรหัสจริงมีส่วนต่อท้าย เช่น SICK_CERTIFIED / MATERNITY_PAID
-- ผลคือลาพักร้อนยังต้องผ่านบรรจุตามเดิม ส่วนลาป่วย/ลาคลอด/ลากิจ ถูกปลดออก
UPDATE "leave_types"
SET "requireProbationPassed" = true
WHERE "serviceStartBasis" = 'PROBATION_PASS_DATE'
  AND UPPER("code") NOT LIKE 'SICK%'
  AND UPPER("code") NOT LIKE 'STERILIZATION%'
  AND UPPER("code") NOT LIKE 'PERSONAL%'
  AND UPPER("code") NOT LIKE 'BUSINESS%'
  AND UPPER("code") NOT LIKE 'MILITARY%'
  AND UPPER("code") NOT LIKE 'MATERNITY%'
  AND UPPER("code") NOT LIKE 'PATERNITY%';

UPDATE "leave_type_catalog"
SET "requireProbationPassed" = true
WHERE "serviceStartBasis" = 'PROBATION_PASS_DATE'
  AND UPPER("code") NOT LIKE 'SICK%'
  AND UPPER("code") NOT LIKE 'STERILIZATION%'
  AND UPPER("code") NOT LIKE 'PERSONAL%'
  AND UPPER("code") NOT LIKE 'BUSINESS%'
  AND UPPER("code") NOT LIKE 'MILITARY%'
  AND UPPER("code") NOT LIKE 'MATERNITY%'
  AND UPPER("code") NOT LIKE 'PATERNITY%';
