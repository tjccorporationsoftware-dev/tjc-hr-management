-- Add per-employee requester scope for approval matrices.
-- When a matrix has rows in this table, it applies only to the listed employees.
CREATE TABLE IF NOT EXISTS "approval_matrix_requesters" (
  "id" TEXT NOT NULL,
  "approvalMatrixId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "approval_matrix_requesters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_matrix_requesters_approvalMatrixId_employeeId_key"
  ON "approval_matrix_requesters"("approvalMatrixId", "employeeId");

CREATE INDEX IF NOT EXISTS "approval_matrix_requesters_approvalMatrixId_idx"
  ON "approval_matrix_requesters"("approvalMatrixId");

CREATE INDEX IF NOT EXISTS "approval_matrix_requesters_employeeId_idx"
  ON "approval_matrix_requesters"("employeeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_matrix_requesters_approvalMatrixId_fkey'
  ) THEN
    ALTER TABLE "approval_matrix_requesters"
      ADD CONSTRAINT "approval_matrix_requesters_approvalMatrixId_fkey"
      FOREIGN KEY ("approvalMatrixId") REFERENCES "approval_matrices"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_matrix_requesters_employeeId_fkey'
  ) THEN
    ALTER TABLE "approval_matrix_requesters"
      ADD CONSTRAINT "approval_matrix_requesters_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
