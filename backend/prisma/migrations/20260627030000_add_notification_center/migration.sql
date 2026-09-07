-- Phase 1B: in-app notification center with read/unread state.
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "entityType" TEXT,
  "entityId" TEXT,
  "link" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_sourceKey_key"
  ON "Notification"("userId", "sourceKey");

CREATE INDEX IF NOT EXISTS "Notification_userId_idx"
  ON "Notification"("userId");

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx"
  ON "Notification"("userId", "readAt");

CREATE INDEX IF NOT EXISTS "Notification_type_idx"
  ON "Notification"("type");

CREATE INDEX IF NOT EXISTS "Notification_severity_idx"
  ON "Notification"("severity");

CREATE INDEX IF NOT EXISTS "Notification_entityType_entityId_idx"
  ON "Notification"("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"
  ON "Notification"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
