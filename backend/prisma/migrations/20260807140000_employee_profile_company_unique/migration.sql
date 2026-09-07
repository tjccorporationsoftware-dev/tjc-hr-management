-- ห้ามเลขประจำตัวซ้ำภายในบริษัทเดียวกัน
--
-- เดิม employee_profiles มีแค่ index ธรรมดาบน nationalId / socialSecurityNo / taxId
-- คนเดียวจึงถูกสร้างเป็นพนักงานสองคนได้ ผลคือจ่ายเงินซ้ำและยื่นประกันสังคมซ้ำ
--
-- Postgres สร้าง unique index ข้ามตารางไม่ได้ จึงต้องมี companyId อยู่ในตารางนี้ด้วย
-- ไม่บังคับ unique ทั้งระบบ เพราะคนเดียวทำงานหลายบริษัทในเครือได้จริง

-- AlterTable: เพิ่มคอลัมน์แบบยอมว่างไว้ก่อน เพื่อเติมค่าให้แถวเดิมได้
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- เติมค่าจากพนักงานเจ้าของ profile
UPDATE "employee_profiles" p
   SET "companyId" = e."companyId"
  FROM "employees" e
 WHERE e."id" = p."employeeId"
   AND p."companyId" IS NULL;

-- profile ที่หาพนักงานไม่เจอไม่ควรมี แต่ถ้ามีต้องลบทิ้งก่อน ไม่งั้นบังคับ NOT NULL ไม่ได้
DELETE FROM "employee_profiles" WHERE "companyId" IS NULL;

-- AlterTable
ALTER TABLE "employee_profiles" ALTER COLUMN "companyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employee_profiles_companyId_idx" ON "employee_profiles"("companyId");

-- CreateIndex
-- NULL ไม่ชนกันใน Postgres คนที่ยังไม่กรอกเลขจึงไม่ติดข้อจำกัดนี้
CREATE UNIQUE INDEX IF NOT EXISTS "employee_profiles_companyId_nationalId_key" ON "employee_profiles"("companyId", "nationalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "employee_profiles_companyId_socialSecurityNo_key" ON "employee_profiles"("companyId", "socialSecurityNo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "employee_profiles_companyId_taxId_key" ON "employee_profiles"("companyId", "taxId");

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
