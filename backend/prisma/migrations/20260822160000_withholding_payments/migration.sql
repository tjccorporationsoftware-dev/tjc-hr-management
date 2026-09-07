-- ภาษีหัก ณ ที่จ่ายของผู้รับเงินที่ไม่ใช่ลูกจ้าง (ภ.ง.ด.3 / ภ.ง.ด.53)
--
-- แยกจากตารางพนักงานเพราะคนกลุ่มนี้ไม่มีสัญญาจ้างและคิดภาษีคนละมาตรา
-- ลูกจ้างใช้ 40(1) หักตามขั้นบันได ส่วนกลุ่มนี้ใช้ 40(5)-(8) หักอัตราคงที่

CREATE TYPE "WithholdingPayeeType" AS ENUM ('INDIVIDUAL', 'JURISTIC');

CREATE TYPE "WithholdingCondition" AS ENUM ('WITHHELD', 'PAID_ALWAYS', 'PAID_ONCE');

CREATE TABLE "withholding_payees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "WithholdingPayeeType" NOT NULL DEFAULT 'INDIVIDUAL',
    "taxId" TEXT NOT NULL,
    "branchNo" TEXT NOT NULL DEFAULT '00000',
    "title" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "withholding_payees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "withholding_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "incomeTypeCode" TEXT NOT NULL,
    "incomeTypeLabel" TEXT NOT NULL,
    "taxRatePercent" DECIMAL(6,3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "condition" "WithholdingCondition" NOT NULL DEFAULT 'WITHHELD',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "withholding_payments_pkey" PRIMARY KEY ("id")
);

-- กันสร้างผู้รับเงินคนเดิมซ้ำในบริษัทเดียวกัน
CREATE UNIQUE INDEX "withholding_payees_companyId_taxId_branchNo_key"
    ON "withholding_payees"("companyId", "taxId", "branchNo");

CREATE INDEX "withholding_payees_companyId_status_deletedAt_idx"
    ON "withholding_payees"("companyId", "status", "deletedAt");

CREATE INDEX "withholding_payees_name_idx" ON "withholding_payees"("name");

-- แบบยื่นดึงตามบริษัทและช่วงวันที่จ่าย จึงทำดัชนีให้ตรงกับการค้นจริง
CREATE INDEX "withholding_payments_companyId_paidOn_deletedAt_idx"
    ON "withholding_payments"("companyId", "paidOn", "deletedAt");

CREATE INDEX "withholding_payments_payeeId_idx" ON "withholding_payments"("payeeId");

ALTER TABLE "withholding_payees"
    ADD CONSTRAINT "withholding_payees_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "withholding_payments"
    ADD CONSTRAINT "withholding_payments_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "withholding_payments"
    ADD CONSTRAINT "withholding_payments_payeeId_fkey"
    FOREIGN KEY ("payeeId") REFERENCES "withholding_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
