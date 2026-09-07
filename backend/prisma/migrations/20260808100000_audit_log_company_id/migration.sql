-- AuditLog เก็บบริษัทที่การกระทำเกิดขึ้น
--
-- เดิมต้อง join ผ่าน User ทุกครั้งที่จะแยกว่าใครดูบันทึกของบริษัทไหนได้
-- ซึ่งพังทันทีเมื่อผู้ใช้ถูกลบ (userId เป็น SetNull) หรือผู้ใช้ย้ายบริษัท
-- เพราะบันทึกเก่าจะถูกนับเป็นของบริษัทใหม่ย้อนหลัง
--
-- ยอมว่างได้เพราะแถวเดิมไม่มีค่านี้ และการกระทำระดับแพลตฟอร์ม
-- (เช่นแอดมินระบบล็อกอิน) ไม่ได้ผูกกับบริษัทใดบริษัทหนึ่ง

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- เติมย้อนหลังเท่าที่ยังสาวถึงได้ จากพนักงานที่ผูกกับผู้ใช้คนนั้น
-- แถวที่สาวไม่ถึงจะเป็น NULL ต่อไป ซึ่งถูกต้องกว่าการเดา
UPDATE "AuditLog" a
   SET "companyId" = e."companyId"
  FROM "employees" e
 WHERE e."userId" = a."userId"
   AND a."companyId" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
