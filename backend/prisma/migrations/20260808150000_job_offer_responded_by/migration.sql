-- ผู้ใช้ที่บันทึกคำตอบของผู้สมัคร — ผู้สมัครไม่ได้เข้าระบบเอง HR เป็นคนคีย์แทน
-- ต้องรู้ว่าใครคีย์ เผื่อมีข้อโต้แย้งภายหลังว่า "ไม่เคยตอบรับ"
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "respondedById" TEXT;

ALTER TABLE "job_offers"
  ADD CONSTRAINT "job_offers_respondedById_fkey"
  FOREIGN KEY ("respondedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
