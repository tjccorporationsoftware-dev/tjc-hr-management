-- ---------------------------------------------------------------------------
-- แผนก / ฝ่าย เป็น master ระดับระบบ แล้วบริษัท "เลือกเปิดใช้"
--
-- ต่อจาก 20260813120000_position_and_employee_type_catalog ที่ทำกับตำแหน่ง
-- และประเภทพนักงานไปแล้ว เหลือแผนกกับฝ่ายที่ยังต้องพิมพ์เองใหม่ทุกบริษัท
--
-- ต่างจาก catalog ก่อนหน้าตรงที่ฝ่ายผูกกับแผนกเสมอ (Division.departmentId เป็น
-- required) division_catalog จึงต้องมี departmentCatalogId ชี้แผนกแม่ด้วย
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- department_catalog
-- ---------------------------------------------------------------------------
CREATE TABLE "department_catalog" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "department_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_catalog_referenceCode_key" ON "department_catalog"("referenceCode");
CREATE UNIQUE INDEX "department_catalog_code_key" ON "department_catalog"("code");
CREATE INDEX "department_catalog_sortOrder_idx" ON "department_catalog"("sortOrder");
CREATE INDEX "department_catalog_status_idx" ON "department_catalog"("status");
CREATE INDEX "department_catalog_deletedAt_idx" ON "department_catalog"("deletedAt");

-- ---------------------------------------------------------------------------
-- division_catalog : ผูกกับแผนกมาตรฐานเสมอ
--
-- Cascade เพราะฝ่ายมาตรฐานที่แผนกแม่หายไปแล้วไม่มีความหมาย และเป็นข้อมูล
-- ระดับระบบล้วน ๆ (ฝ่ายของบริษัทอยู่ที่ตาราง Division คนละแถวกัน ไม่ถูกลบตาม)
-- ---------------------------------------------------------------------------
CREATE TABLE "division_catalog" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "departmentCatalogId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "division_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "division_catalog_referenceCode_key" ON "division_catalog"("referenceCode");
CREATE UNIQUE INDEX "division_catalog_code_key" ON "division_catalog"("code");
CREATE INDEX "division_catalog_departmentCatalogId_idx" ON "division_catalog"("departmentCatalogId");
CREATE INDEX "division_catalog_sortOrder_idx" ON "division_catalog"("sortOrder");
CREATE INDEX "division_catalog_status_idx" ON "division_catalog"("status");
CREATE INDEX "division_catalog_deletedAt_idx" ON "division_catalog"("deletedAt");

ALTER TABLE "division_catalog"
    ADD CONSTRAINT "division_catalog_departmentCatalogId_fkey"
    FOREIGN KEY ("departmentCatalogId") REFERENCES "department_catalog"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Department : ผูกกับ catalog
--
-- แผนกเดิมของบริษัทยังใช้ได้เหมือนเดิมทุกอย่าง catalogId เป็น null ไปก่อน
-- แล้ว OrganizationCatalogBootstrapService จะจับคู่ให้ตอนบูตด้วยรหัส
-- ---------------------------------------------------------------------------
ALTER TABLE "Department"
    ADD COLUMN "catalogId" TEXT,
    ADD COLUMN "referenceCode" TEXT;

CREATE INDEX "Department_companyId_catalogId_idx" ON "Department"("companyId", "catalogId");
CREATE INDEX "Department_catalogId_idx" ON "Department"("catalogId");

ALTER TABLE "Department"
    ADD CONSTRAINT "Department_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "department_catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Division : ผูกกับ catalog
-- ---------------------------------------------------------------------------
ALTER TABLE "Division"
    ADD COLUMN "catalogId" TEXT,
    ADD COLUMN "referenceCode" TEXT;

CREATE INDEX "Division_departmentId_catalogId_idx" ON "Division"("departmentId", "catalogId");
CREATE INDEX "Division_catalogId_idx" ON "Division"("catalogId");

ALTER TABLE "Division"
    ADD CONSTRAINT "Division_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "division_catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
