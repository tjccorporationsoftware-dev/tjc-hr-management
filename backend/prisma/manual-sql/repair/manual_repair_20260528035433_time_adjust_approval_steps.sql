-- Manual repair for migration: 20260528035433_add_time_adjust_approval_steps
-- Purpose: make this old migration idempotently match the existing database state.
-- Safe approach: create missing enum/table/indexes/FKs only if they do not already exist.
-- Do NOT drop existing objects or data.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'TimeAdjustApprovalStepStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public."TimeAdjustApprovalStepStatus" AS ENUM (
      'WAITING',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'SKIPPED'
    );
  END IF;
END $$;

-- If the enum already existed but is missing any value, add it safely.
ALTER TYPE public."TimeAdjustApprovalStepStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE public."TimeAdjustApprovalStepStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE public."TimeAdjustApprovalStepStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE public."TimeAdjustApprovalStepStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE public."TimeAdjustApprovalStepStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE public."TimeAdjustApprovalStepStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

CREATE TABLE IF NOT EXISTS public."time_adjust_approval_steps" (
  "id" TEXT NOT NULL,
  "timeAdjustRequestId" TEXT NOT NULL,
  "matrixId" TEXT,
  "matrixStepId" TEXT,
  "stepNo" INTEGER NOT NULL,
  "nameTh" TEXT NOT NULL,
  "description" TEXT,
  "approverType" public."ApprovalStepApproverType" NOT NULL,
  "expectedApproverId" TEXT,
  "expectedEmployeeId" TEXT,
  "positionId" TEXT,
  "roleCode" TEXT,
  "minApproverCount" INTEGER NOT NULL DEFAULT 1,
  "approvedCount" INTEGER NOT NULL DEFAULT 0,
  "status" public."TimeAdjustApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
  "actedById" TEXT,
  "actedAt" TIMESTAMP(3),
  "reason" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "time_adjust_approval_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_timeAdjustRequestId_idx"
  ON public."time_adjust_approval_steps"("timeAdjustRequestId");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_matrixId_idx"
  ON public."time_adjust_approval_steps"("matrixId");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_matrixStepId_idx"
  ON public."time_adjust_approval_steps"("matrixStepId");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_expectedApproverId_idx"
  ON public."time_adjust_approval_steps"("expectedApproverId");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_expectedEmployeeId_idx"
  ON public."time_adjust_approval_steps"("expectedEmployeeId");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_positionId_idx"
  ON public."time_adjust_approval_steps"("positionId");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_roleCode_idx"
  ON public."time_adjust_approval_steps"("roleCode");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_status_idx"
  ON public."time_adjust_approval_steps"("status");

CREATE INDEX IF NOT EXISTS "time_adjust_approval_steps_createdAt_idx"
  ON public."time_adjust_approval_steps"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "time_adjust_approval_steps_timeAdjustRequestId_stepNo_key"
  ON public."time_adjust_approval_steps"("timeAdjustRequestId", "stepNo");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_adjust_approval_steps_timeAdjustRequestId_fkey') THEN
    ALTER TABLE public."time_adjust_approval_steps"
      ADD CONSTRAINT "time_adjust_approval_steps_timeAdjustRequestId_fkey"
      FOREIGN KEY ("timeAdjustRequestId") REFERENCES public."time_adjust_requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_adjust_approval_steps_matrixId_fkey') THEN
    ALTER TABLE public."time_adjust_approval_steps"
      ADD CONSTRAINT "time_adjust_approval_steps_matrixId_fkey"
      FOREIGN KEY ("matrixId") REFERENCES public."approval_matrices"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_adjust_approval_steps_matrixStepId_fkey') THEN
    ALTER TABLE public."time_adjust_approval_steps"
      ADD CONSTRAINT "time_adjust_approval_steps_matrixStepId_fkey"
      FOREIGN KEY ("matrixStepId") REFERENCES public."approval_matrix_steps"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_adjust_approval_steps_expectedApproverId_fkey') THEN
    ALTER TABLE public."time_adjust_approval_steps"
      ADD CONSTRAINT "time_adjust_approval_steps_expectedApproverId_fkey"
      FOREIGN KEY ("expectedApproverId") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_adjust_approval_steps_expectedEmployeeId_fkey') THEN
    ALTER TABLE public."time_adjust_approval_steps"
      ADD CONSTRAINT "time_adjust_approval_steps_expectedEmployeeId_fkey"
      FOREIGN KEY ("expectedEmployeeId") REFERENCES public."employees"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_adjust_approval_steps_positionId_fkey') THEN
    ALTER TABLE public."time_adjust_approval_steps"
      ADD CONSTRAINT "time_adjust_approval_steps_positionId_fkey"
      FOREIGN KEY ("positionId") REFERENCES public."Position"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_adjust_approval_steps_actedById_fkey') THEN
    ALTER TABLE public."time_adjust_approval_steps"
      ADD CONSTRAINT "time_adjust_approval_steps_actedById_fkey"
      FOREIGN KEY ("actedById") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
