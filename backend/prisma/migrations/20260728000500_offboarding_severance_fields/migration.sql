-- ข้อมูลที่ต้องใช้คำนวณค่าชดเชยบนใบออกจากงาน
--
-- เดิมกรอก severancePay เป็นตัวเลขก้อนเดียว ตรวจย้อนหลังไม่ได้ว่าคิดจากอะไร
-- ตอนนี้เก็บตัวตั้งแยกช่อง แล้วเก็บผลคำนวณทั้งก้อนไว้ใน severanceBreakdown
--
-- ทุกช่องเป็น nullable หรือมีค่าตั้งต้น ใบเดิมจึงไม่เปลี่ยนความหมาย
-- terminatedWithCause ตั้งต้น false = ไม่ใช่การเลิกจ้างเพราะทำผิด ซึ่งเป็นกรณีทั่วไป

ALTER TABLE "offboarding_cases"
  ADD COLUMN IF NOT EXISTS "terminatedWithCause" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "noticePayDays" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "specialSeveranceDays" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "otherSeparationPay" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "severanceBreakdown" JSONB,
  ADD COLUMN IF NOT EXISTS "severanceCalculatedAt" TIMESTAMP(3);
