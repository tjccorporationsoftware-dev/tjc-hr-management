-- Phase 1 Foundation: add tenant scope fields to User.
-- This migration does not enforce tenant filtering in application queries yet.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScopeLevel') THEN
    CREATE TYPE "ScopeLevel" AS ENUM ('GLOBAL', 'COMPANY', 'BRANCH');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "scopeLevel" "ScopeLevel" NOT NULL DEFAULT 'BRANCH',
  ADD COLUMN IF NOT EXISTS "scopedCompanyId" TEXT,
  ADD COLUMN IF NOT EXISTS "scopedBranchId" TEXT;

CREATE INDEX IF NOT EXISTS "User_scopedCompanyId_idx" ON "User"("scopedCompanyId");
CREATE INDEX IF NOT EXISTS "User_scopedBranchId_idx" ON "User"("scopedBranchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_scopedCompanyId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_scopedCompanyId_fkey"
      FOREIGN KEY ("scopedCompanyId") REFERENCES "Company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_scopedBranchId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_scopedBranchId_fkey"
      FOREIGN KEY ("scopedBranchId") REFERENCES "Branch"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Phase 1 uses a safe transitional check: unresolved BRANCH users with no scoped company/branch are allowed
-- so existing accounts that require manual review do not break on normal account updates.
-- After backfill/manual assignment is complete, tighten this constraint in a later hardening migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_scope_consistency_chk'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "user_scope_consistency_chk"
      CHECK (
        ("scopeLevel" = 'GLOBAL'  AND "scopedCompanyId" IS NULL AND "scopedBranchId" IS NULL) OR
        ("scopeLevel" = 'COMPANY' AND "scopedCompanyId" IS NOT NULL AND "scopedBranchId" IS NULL) OR
        ("scopeLevel" = 'BRANCH'  AND "scopedCompanyId" IS NOT NULL AND "scopedBranchId" IS NOT NULL) OR
        ("scopeLevel" = 'BRANCH'  AND "scopedCompanyId" IS NULL AND "scopedBranchId" IS NULL)
      );
  END IF;
END $$;
