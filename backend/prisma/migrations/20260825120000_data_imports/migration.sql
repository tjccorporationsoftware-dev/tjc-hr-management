-- งานนำเข้าข้อมูลจากไฟล์ Excel (หน้า ผู้ดูแลระบบ › นำเข้าข้อมูล)
--
-- เก็บไฟล์ต้นฉบับไว้กับงาน แล้วอ่านซ้ำตอนกดยืนยัน แทนที่จะให้หน้าเว็บส่งแถว
-- ทั้งหมดกลับมา — พรีวิวกับข้อมูลที่เขียนจริงจึงมาจากไฟล์ก้อนเดียวกันเสมอ
-- และตรวจย้อนหลังได้ว่าใครนำเข้าไฟล์ไหน ผลออกมาอย่างไร

CREATE TYPE "DataImportType" AS ENUM ('EMPLOYEE', 'ATTENDANCE', 'PAYROLL_SUMMARY');

CREATE TYPE "DataImportStatus" AS ENUM ('ANALYZED', 'COMMITTED', 'FAILED', 'CANCELLED');

CREATE TYPE "DataImportDuplicateMode" AS ENUM ('UPDATE', 'SKIP', 'ERROR');

CREATE TABLE "data_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DataImportType" NOT NULL,
    "status" "DataImportStatus" NOT NULL DEFAULT 'ANALYZED',
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "bucketName" TEXT,
    "sheetName" TEXT,
    "headerRowNo" INTEGER,
    -- { fieldKey: หมายเลขคอลัมน์เริ่มที่ 1 }
    "mapping" JSONB,
    "duplicateMode" "DataImportDuplicateMode" NOT NULL DEFAULT 'UPDATE',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    -- แถวที่นำเข้าไม่สำเร็จ เก็บไว้ให้เปิดดูย้อนหลังโดยไม่ต้องเปิดไฟล์เดิม
    "rowErrors" JSONB,
    "committedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

-- หน้าเว็บเปิดประวัติการนำเข้าด้วยคู่ (บริษัท, ชนิดข้อมูล) เรียงตามเวลาเสมอ
CREATE INDEX "data_imports_companyId_type_createdAt_idx"
    ON "data_imports"("companyId", "type", "createdAt");

CREATE INDEX "data_imports_status_idx" ON "data_imports"("status");

CREATE INDEX "data_imports_createdById_idx" ON "data_imports"("createdById");

ALTER TABLE "data_imports"
    ADD CONSTRAINT "data_imports_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "data_imports"
    ADD CONSTRAINT "data_imports_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
