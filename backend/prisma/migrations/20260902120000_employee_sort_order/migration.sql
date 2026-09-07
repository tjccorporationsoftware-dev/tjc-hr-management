-- ลำดับที่จัดไว้เองในกระดานผังองค์กร (0 = ยังไม่เคยจัดมือ)
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
