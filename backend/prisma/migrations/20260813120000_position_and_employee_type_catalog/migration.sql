-- ---------------------------------------------------------------------------
-- ตำแหน่ง / ประเภทพนักงาน เป็น master ระดับระบบ แล้วบริษัท "เลือกเปิดใช้"
--
-- เดิมทุกบริษัทต้องพิมพ์ตำแหน่งกับประเภทพนักงานเองตั้งแต่ศูนย์ ทั้งที่ชุดที่ใช้จริง
-- แทบจะเหมือนกันทุกบริษัท ผลคือรหัส/ชื่อ/ระดับไม่ตรงกันข้ามบริษัท เทียบข้อมูลไม่ได้
--
-- โครงเดียวกับ leave_type_catalog:
--   position_catalog / employee_type_catalog -> ระบบ  : ชื่อ/รหัสอ้างอิง/ค่าตั้งต้น
--   Position / EmployeeType                  -> บริษัท: สำเนาที่บริษัทแก้ต่อได้เอง
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- position_catalog
-- ---------------------------------------------------------------------------
CREATE TABLE "position_catalog" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "level" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "position_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "position_catalog_referenceCode_key" ON "position_catalog"("referenceCode");
CREATE UNIQUE INDEX "position_catalog_code_key" ON "position_catalog"("code");
CREATE INDEX "position_catalog_category_idx" ON "position_catalog"("category");
CREATE INDEX "position_catalog_sortOrder_idx" ON "position_catalog"("sortOrder");
CREATE INDEX "position_catalog_status_idx" ON "position_catalog"("status");
CREATE INDEX "position_catalog_deletedAt_idx" ON "position_catalog"("deletedAt");

-- ---------------------------------------------------------------------------
-- employee_type_catalog
-- ---------------------------------------------------------------------------
CREATE TABLE "employee_type_catalog" (
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

    CONSTRAINT "employee_type_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_type_catalog_referenceCode_key" ON "employee_type_catalog"("referenceCode");
CREATE UNIQUE INDEX "employee_type_catalog_code_key" ON "employee_type_catalog"("code");
CREATE INDEX "employee_type_catalog_sortOrder_idx" ON "employee_type_catalog"("sortOrder");
CREATE INDEX "employee_type_catalog_status_idx" ON "employee_type_catalog"("status");
CREATE INDEX "employee_type_catalog_deletedAt_idx" ON "employee_type_catalog"("deletedAt");

-- ---------------------------------------------------------------------------
-- Position : ผูกกับ catalog
--
-- ตำแหน่งเดิมของบริษัทยังใช้ได้เหมือนเดิมทุกอย่าง catalogId เป็น null ไปก่อน
-- แล้ว OrganizationCatalogBootstrapService จะจับคู่ให้ตอนบูตด้วยรหัส
-- ---------------------------------------------------------------------------
ALTER TABLE "Position"
    ADD COLUMN "catalogId" TEXT,
    ADD COLUMN "referenceCode" TEXT;

CREATE INDEX "Position_companyId_catalogId_idx" ON "Position"("companyId", "catalogId");
CREATE INDEX "Position_catalogId_idx" ON "Position"("catalogId");

ALTER TABLE "Position"
    ADD CONSTRAINT "Position_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "position_catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- EmployeeType : ผูกกับ catalog
-- ---------------------------------------------------------------------------
ALTER TABLE "EmployeeType"
    ADD COLUMN "catalogId" TEXT,
    ADD COLUMN "referenceCode" TEXT;

CREATE INDEX "EmployeeType_companyId_catalogId_idx" ON "EmployeeType"("companyId", "catalogId");
CREATE INDEX "EmployeeType_catalogId_idx" ON "EmployeeType"("catalogId");

ALTER TABLE "EmployeeType"
    ADD CONSTRAINT "EmployeeType_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "employee_type_catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
