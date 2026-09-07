-- ============================================================================
-- Leave policy phase: system-level leave type catalog + quota tiers
--  - ประเภทการลาเป็น master ระดับระบบ (leave_type_catalog)
--    บริษัท/สาขาไหนต้องการใช้ค่อยกดเปิดใช้ -> สร้าง leave_types ของบริษัทนั้น
--  - รองรับคอลัมน์ตามเอกสารมาตรฐาน: ลาล่วงหน้า / จำนวนปีสะสม / ค่าปรับ /
--    นำไปคำนวณ (ภาษี, ประกันสังคม) / ระยะเวลาทำงาน-โควตา (ขั้นบันได) / เงื่อนไข
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "LeaveGenderEligibility" AS ENUM ('ALL', 'MALE', 'FEMALE');
CREATE TYPE "LeaveServiceStartBasis" AS ENUM ('HIRE_DATE', 'PROBATION_PASS_DATE');
CREATE TYPE "LeaveRoundingMode" AS ENUM ('NONE', 'HALF_HOUR_UP', 'HALF_DAY_UP');
CREATE TYPE "LeaveQuotaDisplayUnit" AS ENUM ('DAY', 'HOUR');

-- ---------------------------------------------------------------------------
-- leave_type_catalog : master ระดับระบบ
-- ---------------------------------------------------------------------------
CREATE TABLE "leave_type_catalog" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "allowHourly" BOOLEAN NOT NULL DEFAULT false,
    "deductQuota" BOOLEAN NOT NULL DEFAULT true,
    "affectAttendance" BOOLEAN NOT NULL DEFAULT true,
    "affectPayroll" BOOLEAN NOT NULL DEFAULT true,
    "minLeaveUnitMinutes" INTEGER NOT NULL DEFAULT 240,
    "maxLeaveDaysPerRequest" DECIMAL(8,2),
    "advanceNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "allowBackdated" BOOLEAN NOT NULL DEFAULT false,
    "maxBackdatedDays" INTEGER NOT NULL DEFAULT 0,
    "backdatedRequiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "backdatedRequiresHrApproval" BOOLEAN NOT NULL DEFAULT true,
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "negativeBalanceMode" TEXT,
    "enforceQuotaLimit" BOOLEAN NOT NULL DEFAULT true,
    "includeHoliday" BOOLEAN NOT NULL DEFAULT false,
    "includeWeekend" BOOLEAN NOT NULL DEFAULT false,
    "attachmentRequiredAfterDays" DECIMAL(8,2),
    "quotaAccrualYears" INTEGER NOT NULL DEFAULT 1,
    "genderEligibility" "LeaveGenderEligibility" NOT NULL DEFAULT 'ALL',
    "serviceStartBasis" "LeaveServiceStartBasis" NOT NULL DEFAULT 'HIRE_DATE',
    "prorateFirstYear" BOOLEAN NOT NULL DEFAULT false,
    "roundingMode" "LeaveRoundingMode" NOT NULL DEFAULT 'NONE',
    "quotaDisplayUnit" "LeaveQuotaDisplayUnit" NOT NULL DEFAULT 'DAY',
    "defaultMaxConsecutiveDays" INTEGER,
    "defaultAnnualQuotaDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "defaultUnpaidDeductionMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "defaultIncludeInTax" BOOLEAN NOT NULL DEFAULT true,
    "defaultIncludeInSocialSecurity" BOOLEAN NOT NULL DEFAULT false,
    "defaultAllowCarryForward" BOOLEAN NOT NULL DEFAULT false,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leave_type_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_type_catalog_referenceCode_key" ON "leave_type_catalog"("referenceCode");
CREATE UNIQUE INDEX "leave_type_catalog_code_key" ON "leave_type_catalog"("code");
CREATE INDEX "leave_type_catalog_sortOrder_idx" ON "leave_type_catalog"("sortOrder");
CREATE INDEX "leave_type_catalog_status_idx" ON "leave_type_catalog"("status");
CREATE INDEX "leave_type_catalog_deletedAt_idx" ON "leave_type_catalog"("deletedAt");

-- ---------------------------------------------------------------------------
-- leave_types : ผูกกับ catalog + ฟิลด์เงื่อนไขใหม่
-- ---------------------------------------------------------------------------
ALTER TABLE "leave_types"
    ADD COLUMN "catalogId" TEXT,
    ADD COLUMN "referenceCode" TEXT,
    ADD COLUMN "advanceNoticeDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "enforceQuotaLimit" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "quotaAccrualYears" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "genderEligibility" "LeaveGenderEligibility" NOT NULL DEFAULT 'ALL',
    ADD COLUMN "serviceStartBasis" "LeaveServiceStartBasis" NOT NULL DEFAULT 'HIRE_DATE',
    ADD COLUMN "prorateFirstYear" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "roundingMode" "LeaveRoundingMode" NOT NULL DEFAULT 'NONE',
    ADD COLUMN "quotaDisplayUnit" "LeaveQuotaDisplayUnit" NOT NULL DEFAULT 'DAY';

CREATE INDEX "leave_types_companyId_catalogId_idx" ON "leave_types"("companyId", "catalogId");
CREATE INDEX "leave_types_catalogId_idx" ON "leave_types"("catalogId");

ALTER TABLE "leave_types"
    ADD CONSTRAINT "leave_types_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "leave_type_catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- leave_policies : ค่าปรับ + นำไปคำนวณ
-- ---------------------------------------------------------------------------
ALTER TABLE "leave_policies"
    ADD COLUMN "unpaidDeductionMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 0,
    ADD COLUMN "includeInTax" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "includeInSocialSecurity" BOOLEAN NOT NULL DEFAULT false;

-- นโยบายเดิมที่ผูกกับประเภทลาแบบไม่ได้รับค่าจ้าง ให้ตั้งค่าปรับเป็น 1 เท่าต่อวัน
UPDATE "leave_policies" p
SET "unpaidDeductionMultiplier" = 1
FROM "leave_types" t
WHERE p."leaveTypeId" = t."id" AND t."isPaid" = false;

-- ---------------------------------------------------------------------------
-- leave_quota_tiers : โควตาขั้นบันไดตามอายุงาน
-- ---------------------------------------------------------------------------
CREATE TABLE "leave_quota_tiers" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "minServiceMonths" INTEGER NOT NULL DEFAULT 0,
    "quotaDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_quota_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_quota_tiers_policyId_minServiceMonths_key" ON "leave_quota_tiers"("policyId", "minServiceMonths");
CREATE INDEX "leave_quota_tiers_policyId_idx" ON "leave_quota_tiers"("policyId");
CREATE INDEX "leave_quota_tiers_minServiceMonths_idx" ON "leave_quota_tiers"("minServiceMonths");

ALTER TABLE "leave_quota_tiers"
    ADD CONSTRAINT "leave_quota_tiers_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "leave_policies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- นโยบายเดิมทุกตัวได้ tier ตั้งต้น (อายุงาน 0 เดือน = โควตาปัจจุบัน)
-- เพื่อให้ logic ใหม่ที่อ่าน tier ยังคืนค่าเดิมได้ทันที
INSERT INTO "leave_quota_tiers" ("id", "policyId", "minServiceMonths", "quotaDays", "sortOrder", "createdAt", "updatedAt")
SELECT
    'lqt_' || replace(gen_random_uuid()::text, '-', ''),
    p."id",
    0,
    p."annualQuotaDays",
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "leave_policies" p
WHERE p."deletedAt" IS NULL;
