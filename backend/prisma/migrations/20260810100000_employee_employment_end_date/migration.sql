-- วันสุดท้ายของการเป็นพนักงาน ใช้ให้ payroll คิดเงินงวดสุดท้ายตามวันจริง
ALTER TABLE "employees" ADD COLUMN "employmentEndDate" TIMESTAMP(3);

-- เติมย้อนหลังจากเคสออกจากงานที่ปิดแล้ว (คนที่พ้นสภาพไปก่อนมีคอลัมน์นี้)
UPDATE "employees" e
SET "employmentEndDate" = c."effectiveDate"
FROM "offboarding_cases" c
WHERE c."employeeId" = e.id
  AND c."status" = 'COMPLETED'
  AND c."deletedAt" IS NULL
  AND e."employmentEndDate" IS NULL;

-- รองรับการค้นหาช่วงเวลาที่เป็นพนักงานตอนสร้างงวดเงินเดือน
CREATE INDEX "employees_employmentEndDate_idx" ON "employees"("employmentEndDate");
