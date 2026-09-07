-- สาขาของใบทำงานวันหยุด
--
-- ตารางนี้ไม่ได้ผูก relation กับพนักงาน บัญชีระดับสาขาจึงกรองใบของสาขาตัวเองไม่ได้
-- ถ้าไม่มีคอลัมน์นี้ (เทียบกับกับดักเดิมของตาราง Branch ที่ scope ผิดฟิลด์)
ALTER TABLE "holiday_work_requests" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS "holiday_work_requests_branchId_idx" ON "holiday_work_requests"("branchId");
