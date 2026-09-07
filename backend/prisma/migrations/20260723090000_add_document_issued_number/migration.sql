-- เลขที่หนังสือที่ออกให้จริง (documentNo) แยกจากเลขคำขอ (requestNo)
--
-- เหตุผล:
--   requestNo ออกตอน "สร้างคำขอ" จึงถูกกินโดยคำขอที่ถูกปฏิเสธหรือยกเลิกด้วย
--   ระบบสารบรรณต้องการเลขที่หนังสือที่เดินต่อเนื่องเฉพาะฉบับที่ออกจริงเท่านั้น
--   documentNo จึงออกตอนอนุมัติขั้นสุดท้าย และ issuedAt ตรึงวันที่ออกไว้
--   เพื่อให้การพิมพ์ซ้ำได้เลขและวันที่เดิมเสมอ

ALTER TABLE "document_requests"
  ADD COLUMN IF NOT EXISTS "documentNo" TEXT,
  ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'document_requests'
      AND indexname = 'document_requests_documentNo_key'
  ) THEN
    CREATE UNIQUE INDEX "document_requests_documentNo_key"
      ON "document_requests"("documentNo");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "document_requests_documentNo_idx"
  ON "document_requests"("documentNo");

CREATE INDEX IF NOT EXISTS "document_requests_issuedAt_idx"
  ON "document_requests"("issuedAt");

-- เอกสารเดิมที่อนุมัติไปแล้วก่อนมีฟีเจอร์นี้: ตรึง issuedAt เป็นวันที่อนุมัติ
-- ไม่ย้อนออก documentNo ให้ เพราะจะทำให้ลำดับเลขไม่ตรงกับที่พิมพ์แจกไปแล้ว
UPDATE "document_requests"
SET "issuedAt" = "approvedAt"
WHERE "status" = 'APPROVED'
  AND "approvedAt" IS NOT NULL
  AND "issuedAt" IS NULL;
