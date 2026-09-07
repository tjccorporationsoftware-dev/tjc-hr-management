-- ค่าชดเชยเลิกจ้างและภาษีของเงินก้อนที่จ่ายเมื่อออกจากงาน
--
-- เดิม severancePay บนใบออกจากงานเป็นตัวเลขที่คนพิมพ์เอง ไม่มีบันไดตามกฎหมาย
-- และไม่มีการคิดสิทธิยกเว้นภาษี migration นี้เพิ่มโครงให้ระบบคำนวณเองได้
--
-- ค่าตั้งต้นทุกช่องตรงกับกฎหมายที่ใช้อยู่ ระบบจึงคิดถูกทันทีโดยไม่ต้องตั้งค่าเพิ่ม
-- และบริษัทที่ให้ดีกว่ากฎหมายก็แก้บันไดของตัวเองได้

ALTER TABLE "company_payroll_settings"
  ADD COLUMN IF NOT EXISTS "severanceTaxExemptMaxDays" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS "severanceTaxExemptMaxAmount" DECIMAL(14, 2) NOT NULL DEFAULT 300000,
  ADD COLUMN IF NOT EXISTS "separationExpensePerYear" DECIMAL(14, 2) NOT NULL DEFAULT 7000,
  ADD COLUMN IF NOT EXISTS "separationMinServiceYears" INTEGER NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS "severance_pay_tiers" (
  "id" TEXT NOT NULL,
  "settingId" TEXT NOT NULL,
  "minServiceMonths" INTEGER NOT NULL,
  "payDays" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "severance_pay_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "severance_pay_tiers_settingId_minServiceMonths_key"
  ON "severance_pay_tiers" ("settingId", "minServiceMonths");
CREATE INDEX IF NOT EXISTS "severance_pay_tiers_settingId_idx"
  ON "severance_pay_tiers" ("settingId");
CREATE INDEX IF NOT EXISTS "severance_pay_tiers_status_idx"
  ON "severance_pay_tiers" ("status");
CREATE INDEX IF NOT EXISTS "severance_pay_tiers_deletedAt_idx"
  ON "severance_pay_tiers" ("deletedAt");

ALTER TABLE "severance_pay_tiers"
  DROP CONSTRAINT IF EXISTS "severance_pay_tiers_settingId_fkey";
ALTER TABLE "severance_pay_tiers"
  ADD CONSTRAINT "severance_pay_tiers_settingId_fkey"
  FOREIGN KEY ("settingId") REFERENCES "company_payroll_settings" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- เติมบันไดตามมาตรา 118 ให้ทุกบริษัทที่มีค่าตั้งค่า payroll อยู่แล้ว
-- ใช้ ON CONFLICT DO NOTHING เผื่อรันซ้ำ และไม่ทับของที่บริษัทแก้เองไว้
INSERT INTO "severance_pay_tiers"
  ("id", "settingId", "minServiceMonths", "payDays", "sortOrder", "status", "note", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  s."id",
  tier."minServiceMonths",
  tier."payDays",
  tier."sortOrder",
  'ACTIVE',
  tier."note",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "company_payroll_settings" s
CROSS JOIN (
  VALUES
    (4,   30,  10, 'ทำงานครบ 120 วัน แต่ไม่ครบ 1 ปี'),
    (12,  90,  20, 'ทำงานครบ 1 ปี แต่ไม่ครบ 3 ปี'),
    (36,  180, 30, 'ทำงานครบ 3 ปี แต่ไม่ครบ 6 ปี'),
    (72,  240, 40, 'ทำงานครบ 6 ปี แต่ไม่ครบ 10 ปี'),
    (120, 300, 50, 'ทำงานครบ 10 ปี แต่ไม่ครบ 20 ปี'),
    (240, 400, 60, 'ทำงานครบ 20 ปีขึ้นไป')
) AS tier("minServiceMonths", "payDays", "sortOrder", "note")
ON CONFLICT ("settingId", "minServiceMonths") DO NOTHING;
