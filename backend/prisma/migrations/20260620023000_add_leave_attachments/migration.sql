-- Add leave attachment storage for ESS leave evidence images
CREATE TABLE IF NOT EXISTS "leave_attachments" (
  "id" TEXT NOT NULL,
  "leaveRequestId" TEXT NOT NULL,
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

  CONSTRAINT "leave_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leave_attachments_leaveRequestId_idx" ON "leave_attachments"("leaveRequestId");
CREATE INDEX IF NOT EXISTS "leave_attachments_uploadedById_idx" ON "leave_attachments"("uploadedById");
CREATE INDEX IF NOT EXISTS "leave_attachments_deletedAt_idx" ON "leave_attachments"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_attachments_leaveRequestId_fkey'
  ) THEN
    ALTER TABLE "leave_attachments"
      ADD CONSTRAINT "leave_attachments_leaveRequestId_fkey"
      FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_attachments_uploadedById_fkey'
  ) THEN
    ALTER TABLE "leave_attachments"
      ADD CONSTRAINT "leave_attachments_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
