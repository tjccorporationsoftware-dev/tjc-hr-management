-- Add optional branch scope to leave and overtime policies.
-- Existing rows remain company-wide because branchId defaults to NULL.
-- This migration is intentionally idempotent because an earlier deployment may
-- have stopped after applying only part of the statements.

ALTER TABLE "leave_policies"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

ALTER TABLE "overtime_policies"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_policies_branchId_fkey'
      AND conrelid = '"leave_policies"'::regclass
  ) THEN
    ALTER TABLE "leave_policies"
      ADD CONSTRAINT "leave_policies_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'overtime_policies_branchId_fkey'
      AND conrelid = '"overtime_policies"'::regclass
  ) THEN
    ALTER TABLE "overtime_policies"
      ADD CONSTRAINT "overtime_policies_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- The previous company-wide leave unique index prevents branch overrides.
DROP INDEX IF EXISTS "leave_policies_companyId_leaveTypeId_employeeTypeId_key";

-- Remove scope unique indexes from an earlier failed attempt. Existing data can
-- legitimately contain duplicate scopes, so uniqueness remains enforced by the
-- application service for newly created or edited policies.
DROP INDEX IF EXISTS "leave_policies_scope_unique_active";
DROP INDEX IF EXISTS "overtime_policies_scope_unique_active";

CREATE INDEX IF NOT EXISTS "leave_policies_branchId_idx"
  ON "leave_policies"("branchId");

CREATE INDEX IF NOT EXISTS "leave_policies_companyId_branchId_leaveTypeId_employeeTypeId_idx"
  ON "leave_policies"("companyId", "branchId", "leaveTypeId", "employeeTypeId");

CREATE INDEX IF NOT EXISTS "overtime_policies_branchId_idx"
  ON "overtime_policies"("branchId");

CREATE INDEX IF NOT EXISTS "overtime_policies_companyId_branchId_workType_employeeTypeId_idx"
  ON "overtime_policies"("companyId", "branchId", "workType", "employeeTypeId");
