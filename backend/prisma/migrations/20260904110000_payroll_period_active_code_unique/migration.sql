-- รหัสงวดเงินเดือนห้ามซ้ำเฉพาะงวดที่ยังอยู่
--
-- การลบงวดเป็นการยกเลิก (soft delete) ถ้าดัชนียังเป็น unique ธรรมดา งวดที่ลบไปแล้ว
-- จะจองรหัสไว้ตลอด พอลบงวดที่สร้างผิดแล้วสร้างใหม่ด้วยรหัสเดิมจะโดนตีกลับว่าซ้ำ
-- ทั้งที่ไม่เห็นงวดนั้นในรายการแล้ว — แนวเดียวกับดัชนีของการผูกเครื่องสแกน

DROP INDEX IF EXISTS "payroll_periods_companyId_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_periods_active_code_idx"
ON "payroll_periods"("companyId", "code")
WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "payroll_periods_companyId_code_idx"
ON "payroll_periods"("companyId", "code");
