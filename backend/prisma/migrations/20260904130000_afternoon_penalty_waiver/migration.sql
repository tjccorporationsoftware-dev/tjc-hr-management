-- ยกเว้นค่าปรับช่วงบ่ายเป็นรายวัน
--
-- ของเดิมยกเว้นได้แค่ "ค่าปรับลืมสแกน" ทั้งก้อน ซึ่งครอบทั้งเช้า/บ่าย/ออกงาน
-- แต่เคสจริงที่เจอบ่อยคือคนออกไปทำงานนอกบริษัทช่วงบ่ายแล้วกลับมาสแกนไม่ทัน
-- ต้องยกเว้นเฉพาะช่วงบ่าย (ทั้งมาสายบ่ายและลืมสแกนเข้าบ่าย) โดยที่เช้ายังหักปกติ
--
-- เก็บที่สรุปรายวันเหมือนการยกเว้นแบบเดิม เพราะเป็นการตัดสินใจของ "วันนั้น"
-- และต้องรอดจากการคำนวณใหม่ ตัวคำนวณจึงอ่านค่าเดิมกลับมาใส่ทุกครั้ง
ALTER TABLE "attendance_daily_summaries"
  ADD COLUMN IF NOT EXISTS "afternoonPenaltyWaived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "afternoonPenaltyWaivedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "afternoonPenaltyWaivedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_afternoon_waived_idx"
  ON "attendance_daily_summaries" ("afternoonPenaltyWaived")
  WHERE "afternoonPenaltyWaived" = true;
