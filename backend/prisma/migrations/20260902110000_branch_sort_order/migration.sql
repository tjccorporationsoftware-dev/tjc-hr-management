-- ลำดับการแสดงผลของสาขา (น้อย = ขึ้นก่อน) ค่าเท่ากันถอยไปเรียงตามชื่อ
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 100;
