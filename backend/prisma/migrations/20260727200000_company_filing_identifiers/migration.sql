-- ============================================================================
-- ข้อมูลนายจ้างที่ต้องใช้ในไฟล์นำส่ง
--
--   socialSecurityAccountNo  เลขที่บัญชีนายจ้าง 10 หลัก ใช้ในหัวแบบ สปส.1-10
--   socialSecurityBranchNo   ลำดับที่สาขา ปกติ "000" ถ้าไม่ได้แยกสาขา
--   bankCompanyCode          รหัสบริษัทที่ธนาคารออกให้ ใช้ในไฟล์นำเข้าระบบจ่ายเงินเดือน
--   bankDebitAccountNo       บัญชีบริษัทที่ใช้ตัดจ่ายเงินเดือน
--
-- หมายเหตุ: model Company ไม่มี @@map ชื่อตารางจริงจึงเป็น "Company"
-- ============================================================================

ALTER TABLE "Company"
    ADD COLUMN "socialSecurityAccountNo" TEXT,
    ADD COLUMN "socialSecurityBranchNo" TEXT,
    ADD COLUMN "bankCompanyCode" TEXT,
    ADD COLUMN "bankDebitAccountNo" TEXT;
