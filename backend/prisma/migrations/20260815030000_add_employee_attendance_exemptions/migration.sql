-- ยกเว้นการลงเวลาเป็นรายพนักงาน
--
-- attendanceTrackingRequired = false  ผู้บริหาร/พนักงานเหมาจ่ายที่ไม่ต้องลงเวลาเลย
--   ปิดการตรวจทั้งวัน ไม่คิดสาย ไม่คิดขาดงาน ไม่คิดลืมสแกน
--   ก่อนมีคอลัมน์นี้ คนกลุ่มนี้ถูกตีเป็นขาดงานทุกวันแล้วโดนหักเงินทั้งเดือน
--
-- attendanceExemptSessions            ยกเว้นเฉพาะบางช่วง เช่น พนักงานจัดส่งที่ออกไป
--   ทำงานข้างนอกตอนกลางวัน ไม่ต้องกลับมากดเข้างานบ่าย (ใส่ AFTERNOON_IN)
--   เก็บเป็น array เพื่อให้ยกเว้นช่วงอื่นได้โดยไม่ต้องเพิ่มคอลัมน์

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "attendanceTrackingRequired" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "attendanceExemptSessions" "AttendanceSessionCode"[] DEFAULT ARRAY[]::"AttendanceSessionCode"[];
