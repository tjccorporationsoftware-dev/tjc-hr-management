-- เก็บยอดที่ถูกยกเว้นไว้ เพื่อให้กด "กลับมาหัก" แล้วคืนยอดเดิมได้โดยไม่ต้องคำนวณใหม่
ALTER TABLE "attendance_daily_summaries"
  ADD COLUMN IF NOT EXISTS "penaltyWaivedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
