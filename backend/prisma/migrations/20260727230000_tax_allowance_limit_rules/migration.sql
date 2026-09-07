-- เพดานค่าลดหย่อนภาษีแบบเต็มรูปแบบ
-- เดิมมีแค่ maxAmount (จำนวนเงินก้อนเดียว) ซึ่งรองรับกฎจริงไม่ได้
-- เพิ่ม 3 อย่าง: เพดานเป็น % ของเงินได้, ตัวคูณยอดที่หักได้, และกลุ่มเพดานรวม
--
-- ค่าตั้งต้นของทุกคอลัมน์ใหม่ = "ไม่มีเพดานเพิ่ม / ไม่คูณ / ไม่เข้ากลุ่ม"
-- ปีภาษีที่ตั้งค่าไว้แล้วจึงคำนวณได้ตัวเลขเท่าเดิมเป๊ะ จนกว่าจะตั้งเพดานใหม่เอง

ALTER TABLE "payroll_tax_allowance_types"
  ADD COLUMN IF NOT EXISTS "maxPercentOfIncome" DECIMAL(8, 4),
  ADD COLUMN IF NOT EXISTS "percentBase" TEXT NOT NULL DEFAULT 'GROSS_INCOME',
  ADD COLUMN IF NOT EXISTS "deductionMultiplier" DECIMAL(8, 4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "limitGroupCode" TEXT;

CREATE INDEX IF NOT EXISTS "payroll_tax_allowance_types_limitGroupCode_idx"
  ON "payroll_tax_allowance_types" ("limitGroupCode");

CREATE TABLE IF NOT EXISTS "payroll_tax_allowance_limit_groups" (
  "id" TEXT NOT NULL,
  "taxYearId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameTh" TEXT NOT NULL,
  "nameEn" TEXT,
  "maxAmount" DECIMAL(14, 2),
  "maxPercentOfIncome" DECIMAL(8, 4),
  "percentBase" TEXT NOT NULL DEFAULT 'GROSS_INCOME',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "payroll_tax_allowance_limit_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_tax_allowance_limit_groups_taxYearId_code_key"
  ON "payroll_tax_allowance_limit_groups" ("taxYearId", "code");
CREATE INDEX IF NOT EXISTS "payroll_tax_allowance_limit_groups_taxYearId_idx"
  ON "payroll_tax_allowance_limit_groups" ("taxYearId");
CREATE INDEX IF NOT EXISTS "payroll_tax_allowance_limit_groups_code_idx"
  ON "payroll_tax_allowance_limit_groups" ("code");
CREATE INDEX IF NOT EXISTS "payroll_tax_allowance_limit_groups_status_idx"
  ON "payroll_tax_allowance_limit_groups" ("status");
CREATE INDEX IF NOT EXISTS "payroll_tax_allowance_limit_groups_deletedAt_idx"
  ON "payroll_tax_allowance_limit_groups" ("deletedAt");

ALTER TABLE "payroll_tax_allowance_limit_groups"
  DROP CONSTRAINT IF EXISTS "payroll_tax_allowance_limit_groups_taxYearId_fkey";
ALTER TABLE "payroll_tax_allowance_limit_groups"
  ADD CONSTRAINT "payroll_tax_allowance_limit_groups_taxYearId_fkey"
  FOREIGN KEY ("taxYearId") REFERENCES "payroll_tax_years" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
