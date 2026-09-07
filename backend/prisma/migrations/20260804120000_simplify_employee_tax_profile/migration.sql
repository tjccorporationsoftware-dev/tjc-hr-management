-- ตัดสายอนุมัติออกจากข้อมูลภาษีพนักงาน
--
-- เดิมโปรไฟล์ภาษีต้องผ่าน DRAFT -> SUBMITTED -> APPROVED ก่อน tax engine
-- ถึงจะยอมคำนวณ ทำให้แก้ค่าลดหย่อนหนึ่งรายการแล้วทั้งใบตกกลับเป็นร่าง
-- และภาษีของพนักงานคนนั้นกลายเป็น 0 จนกว่าจะมีคนกดอนุมัติใหม่
--
-- ตอนนี้บันทึกแล้วใช้คำนวณทันที การตรวจสอบย้อนหลังใช้ audit log
-- (audit.service.ts ครอบคลุม EmployeeTaxProfile / EmployeeTaxAllowance อยู่แล้ว)

-- 1) รักษาผลคำนวณเดิมไว้ก่อนทิ้งคอลัมน์
--    โปรไฟล์ที่อนุมัติแล้วใช้ approved_amount คำนวณอยู่ จึงต้องยกมาเป็น declared_amount
UPDATE "employee_tax_allowances" a
SET "declaredAmount" = a."approvedAmount"
FROM "employee_tax_profiles" p
WHERE a."taxProfileId" = p."id"
  AND p."profileStatus" = 'APPROVED'
  AND a."status" = 'APPROVED';

-- 2) โปรไฟล์ที่หมดอายุต้องไม่กลับมามีผลหลังตัดสถานะทิ้ง
UPDATE "employee_tax_profiles"
SET "deletedAt" = NOW()
WHERE "profileStatus" = 'EXPIRED'
  AND "deletedAt" IS NULL;

UPDATE "employee_tax_allowances" a
SET "deletedAt" = NOW()
FROM "employee_tax_profiles" p
WHERE a."taxProfileId" = p."id"
  AND p."deletedAt" IS NOT NULL
  AND a."deletedAt" IS NULL;

-- 3) ทิ้ง index ของคอลัมน์ที่กำลังจะหายไป
DROP INDEX IF EXISTS "employee_tax_profiles_profileStatus_idx";
DROP INDEX IF EXISTS "employee_tax_profiles_approvedById_idx";
DROP INDEX IF EXISTS "employee_tax_allowances_status_idx";
DROP INDEX IF EXISTS "employee_tax_allowances_approvedById_idx";

-- 4) ทิ้งคอลัมน์สายอนุมัติ
ALTER TABLE "employee_tax_profiles"
  DROP COLUMN IF EXISTS "profileStatus",
  DROP COLUMN IF EXISTS "submittedAt",
  DROP COLUMN IF EXISTS "approvedAt",
  DROP COLUMN IF EXISTS "approvedById",
  DROP COLUMN IF EXISTS "rejectedAt",
  DROP COLUMN IF EXISTS "rejectedById",
  DROP COLUMN IF EXISTS "rejectReason";

ALTER TABLE "employee_tax_allowances"
  DROP COLUMN IF EXISTS "approvedAmount",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "approvedAt",
  DROP COLUMN IF EXISTS "approvedById";

-- 5) enum ไม่มีใครใช้แล้ว
DROP TYPE IF EXISTS "PayrollTaxProfileStatus";
