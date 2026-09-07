-- เซ็ตการตั้งค่า OT ให้ครบแนวเดียวกับนโยบายการลา
-- เดิม OT มีแค่ อัตราคูณ / ขั้นต่ำ / สูงสุดต่อวัน / ต้องอนุมัติ
-- เพิ่ม: จุดเริ่มคำนวณ, การปัดเศษชั่วโมง, การปัดเศษจำนวนเงิน และฐานที่นำไปคำนวณต่อ
--
-- ค่าตั้งต้นทุกคอลัมน์ใหม่ = พฤติกรรมเดิมเป๊ะ
-- (เริ่มคำนวณทันที / ไม่ปัดเศษ / เข้าฐานภาษี / ไม่เข้าฐานประกันสังคม)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OvertimeCalcStartMode') THEN
    CREATE TYPE "OvertimeCalcStartMode" AS ENUM ('IMMEDIATE', 'AFTER_MIN_MINUTES');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OvertimeHourRoundingMode') THEN
    CREATE TYPE "OvertimeHourRoundingMode" AS ENUM (
      'NONE',
      'HALF_HOUR_DOWN',
      'HALF_HOUR_UP',
      'HOUR_DOWN',
      'HOUR_UP'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OvertimeAmountRoundingMode') THEN
    CREATE TYPE "OvertimeAmountRoundingMode" AS ENUM (
      'NONE',
      'ROUND_DOWN',
      'ROUND_UP',
      'ROUND_NEAREST'
    );
  END IF;
END
$$;

ALTER TABLE "overtime_policies"
  ADD COLUMN IF NOT EXISTS "calcStartMode" "OvertimeCalcStartMode" NOT NULL DEFAULT 'IMMEDIATE',
  ADD COLUMN IF NOT EXISTS "hourRoundingMode" "OvertimeHourRoundingMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "amountRoundingMode" "OvertimeAmountRoundingMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "includeInTax" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "includeInSocialSecurity" BOOLEAN NOT NULL DEFAULT false;
