-- ให้ HR ตัดสินใจรายวันได้ว่าจะหักค่าปรับลืมสแกนหรือไม่
--
-- เดิมค่าปรับลืมสแกนคิดจากกติกาล้วน HR ไม่มีทางยกเว้นเป็นรายวัน
-- ของจริงมีเคสที่ไม่ควรหัก เช่น เครื่องสแกนเสีย หรือถูกสั่งออกไปทำงานข้างนอกกะทันหัน
--
-- เก็บไว้ที่สรุปรายวัน เพราะเป็นการตัดสินใจของ "วันนั้น" ไม่ใช่ของคนนั้นทั้งเดือน
-- และต้องรอดจากการคำนวณใหม่ ตัวคำนวณจึงอ่านค่าเดิมกลับมาใส่ทุกครั้ง
ALTER TABLE "attendance_daily_summaries"
  ADD COLUMN IF NOT EXISTS "missingLogPenaltyWaived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "penaltyWaivedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "penaltyWaivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "penaltyWaivedById" TEXT;

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_penalty_waived_idx"
  ON "attendance_daily_summaries" ("missingLogPenaltyWaived")
  WHERE "missingLogPenaltyWaived" = true;
