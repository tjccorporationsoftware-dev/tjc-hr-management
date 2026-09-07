-- Add optional branch scope to approval matrices (additive + idempotent, no DROP)
-- branchId = NULL  -> สายอนุมัติใช้ได้ทั้งบริษัท (ทุกสาขา)
-- branchId set     -> ใช้เฉพาะพนักงานในสาขานั้น

ALTER TABLE "approval_matrices" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

CREATE INDEX IF NOT EXISTS "approval_matrices_branchId_idx" ON "approval_matrices"("branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_matrices_branchId_fkey'
  ) THEN
    ALTER TABLE "approval_matrices"
      ADD CONSTRAINT "approval_matrices_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
