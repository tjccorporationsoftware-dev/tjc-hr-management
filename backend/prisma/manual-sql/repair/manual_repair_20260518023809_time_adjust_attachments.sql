-- Manual repair for Prisma migration:
-- 20260518023809_phase4_3_time_adjust_attachments
-- Purpose: make the existing database state match the migration safely,
-- then mark the migration as applied with `prisma migrate resolve --applied`.

-- 1) Create table only if it is missing.
CREATE TABLE IF NOT EXISTS "time_adjust_attachments" (
    "id" TEXT NOT NULL,
    "timeAdjustRequestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "bucketName" TEXT,
    "description" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "time_adjust_attachments_pkey" PRIMARY KEY ("id")
);

-- 2) Add missing columns if the table already existed but was incomplete.
ALTER TABLE "time_adjust_attachments"
  ADD COLUMN IF NOT EXISTS "timeAdjustRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "fileName" TEXT,
  ADD COLUMN IF NOT EXISTS "fileSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "bucketName" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedById" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- 3) Backfill defaults before enforcing NOT NULL where possible.
UPDATE "time_adjust_attachments"
SET "storageProvider" = 'LOCAL'
WHERE "storageProvider" IS NULL;

UPDATE "time_adjust_attachments"
SET "createdAt" = CURRENT_TIMESTAMP
WHERE "createdAt" IS NULL;

-- 4) Enforce NOT NULL only for columns that must match Prisma schema.
-- If this fails, existing rows have incomplete data and must be fixed first.
ALTER TABLE "time_adjust_attachments"
  ALTER COLUMN "timeAdjustRequestId" SET NOT NULL,
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "fileName" SET NOT NULL,
  ALTER COLUMN "storageProvider" SET NOT NULL,
  ALTER COLUMN "storageProvider" SET DEFAULT 'LOCAL',
  ALTER COLUMN "storageKey" SET NOT NULL,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- 5) Create indexes safely.
CREATE INDEX IF NOT EXISTS "time_adjust_attachments_timeAdjustRequestId_idx"
  ON "time_adjust_attachments"("timeAdjustRequestId");

CREATE INDEX IF NOT EXISTS "time_adjust_attachments_uploadedById_idx"
  ON "time_adjust_attachments"("uploadedById");

CREATE INDEX IF NOT EXISTS "time_adjust_attachments_deletedAt_idx"
  ON "time_adjust_attachments"("deletedAt");

-- 6) Add foreign keys only if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'time_adjust_attachments_timeAdjustRequestId_fkey'
  ) THEN
    ALTER TABLE "time_adjust_attachments"
    ADD CONSTRAINT "time_adjust_attachments_timeAdjustRequestId_fkey"
    FOREIGN KEY ("timeAdjustRequestId")
    REFERENCES "time_adjust_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'time_adjust_attachments_uploadedById_fkey'
  ) THEN
    ALTER TABLE "time_adjust_attachments"
    ADD CONSTRAINT "time_adjust_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById")
    REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
