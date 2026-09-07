-- เลิกใช้ช่องเบี้ยคงที่ 4 ช่องในฐานเงินเดือน
--
-- เบี้ยประจำทุกก้อนย้ายไปอยู่ที่ "รายการประจำ" (employee_compensation_items)
-- ซึ่งแก้ไข/ปิดได้จากหน้าจอ และตั้งได้ว่าเข้าภาษี/เข้าฐานประกันสังคมหรือไม่
-- ตอนที่ยังมีสองที่อยู่ ตัวคำนวณบวกทั้งคู่ทำให้ยอดจ่ายเกินจริงโดยไม่มีใครเห็น
-- (เจอจริงตอนเทียบยอดสาขา ART งวด ส.ค. 2569)
--
-- ข้อมูลถูกย้ายและเขียนเป็นศูนย์ครบทุกแถวแล้วก่อนรัน migration นี้
ALTER TABLE "employee_compensations"
  DROP COLUMN IF EXISTS "positionAllowance",
  DROP COLUMN IF EXISTS "transportAllowance",
  DROP COLUMN IF EXISTS "phoneAllowance",
  DROP COLUMN IF EXISTS "otherAllowance";
