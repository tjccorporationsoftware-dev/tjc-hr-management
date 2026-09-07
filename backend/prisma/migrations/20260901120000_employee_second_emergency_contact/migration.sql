-- ผู้ติดต่อฉุกเฉินคนที่สอง
--
-- ของจริงคนแรกติดต่อไม่ได้บ่อย (ปิดเครื่อง/อยู่ต่างจังหวัด) HR จึงต้องมีอีกชื่อสำรอง
-- เก็บเป็นคอลัมน์ชุดที่สองในตารางโปรไฟล์เดิม ไม่แยกตารางใหม่ เพราะใช้แค่สองคน
-- และทุกที่ที่อ่านโปรไฟล์อยู่แล้วจะได้ไม่ต้อง join เพิ่ม

ALTER TABLE "employee_profiles"
  ADD COLUMN "emergencyContactName2" TEXT,
  ADD COLUMN "emergencyContactPhone2" TEXT,
  ADD COLUMN "emergencyContactRelation2" TEXT,
  ADD COLUMN "emergencyContactAddress2" TEXT;
