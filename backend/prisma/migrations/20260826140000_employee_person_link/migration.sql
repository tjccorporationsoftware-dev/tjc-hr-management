-- ผูกทะเบียนพนักงานหลายใบว่าเป็น "คนเดียวกัน"
--
-- บริษัทเดียวในระบบนี้มีหลายสาขาที่จริง ๆ เป็นคนละนิติบุคคล (ART / TJC / ASC / TNJ)
-- ผู้บริหารที่ดูแลสองสาขารับเงินเดือนจากทั้งสองที่ด้วยจำนวนที่ต่างกัน ซึ่งทำได้
-- ทางเดียวคือมีทะเบียนคนละใบต่อสาขา เพราะค่าจ้างผูกกับทะเบียนหนึ่งใบ และรอบจ่ายเงิน
-- หยิบคนจากสาขาของทะเบียนใบนั้น (ดู employee_compensations และ payroll_runs.branchIds)

CREATE TABLE "employee_person_links" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    -- เหตุผลที่ผูก เช่น "ผู้บริหารรับเงินสองสาขา"
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_person_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_person_links_companyId_idx"
    ON "employee_person_links"("companyId");

ALTER TABLE "employee_person_links"
    ADD CONSTRAINT "employee_person_links_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_person_links"
    ADD CONSTRAINT "employee_person_links_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employees" ADD COLUMN "personLinkId" TEXT;

CREATE INDEX "employees_personLinkId_idx" ON "employees"("personLinkId");

ALTER TABLE "employees"
    ADD CONSTRAINT "employees_personLinkId_fkey"
    FOREIGN KEY ("personLinkId") REFERENCES "employee_person_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ถอดข้อจำกัด "เลขบัตร / เลขประกันสังคม / เลขผู้เสียภาษี ห้ามซ้ำในบริษัทเดียวกัน"
--
-- ข้อจำกัดนี้ทำให้คนคนเดียวที่มีทะเบียนสองใบใส่เลขบัตรได้ใบเดียว อีกใบต้องปล่อยว่าง
-- (ข้อมูลจริงตอนนี้เป็นแบบนั้นอยู่) ผลคือทะเบียนใบที่สองออก ภ.ง.ด.1 ไม่ได้
-- เพราะไม่มีเลขประจำตัวผู้เสียภาษี
--
-- ไม่ได้ยกเลิกการกันเลขซ้ำ — ย้ายไปบังคับในโค้ดแทน ซึ่งยอมให้ซ้ำได้เฉพาะเมื่อ
-- ทะเบียนสองใบถูกผูกว่าเป็นคนเดียวกันแล้ว ถ้ายังไม่ผูกยังปฏิเสธเหมือนเดิม
-- ดู EmployeesService.assertIdentityNumbersAvailable
--
-- ดัชนีธรรมดาบน nationalId / socialSecurityNo / taxId ยังอยู่ครบ การค้นหาเลขซ้ำ
-- ในโค้ดจึงยังเร็วเท่าเดิม
-- ---------------------------------------------------------------------------
DROP INDEX "employee_profiles_companyId_nationalId_key";
DROP INDEX "employee_profiles_companyId_socialSecurityNo_key";
DROP INDEX "employee_profiles_companyId_taxId_key";
