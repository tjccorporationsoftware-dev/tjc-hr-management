-- ข้อมูลสาขาที่ใช้ทำหัวสลิปเงินเดือน (โลโก้ / เลขภาษี / ประกันสังคม / หมายเหตุท้ายสลิป)
ALTER TABLE "Branch" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Branch" ADD COLUMN "usePayslipHeader" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Branch" ADD COLUMN "taxId" TEXT;
ALTER TABLE "Branch" ADD COLUMN "taxBranchNo" TEXT;
ALTER TABLE "Branch" ADD COLUMN "socialSecurityBranchNo" TEXT;
ALTER TABLE "Branch" ADD COLUMN "payslipNote" TEXT;
