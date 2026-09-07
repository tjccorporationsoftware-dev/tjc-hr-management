-- CreateTable
CREATE TABLE "time_adjust_attachments" (
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

-- CreateIndex
CREATE INDEX "time_adjust_attachments_timeAdjustRequestId_idx" ON "time_adjust_attachments"("timeAdjustRequestId");

-- CreateIndex
CREATE INDEX "time_adjust_attachments_uploadedById_idx" ON "time_adjust_attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "time_adjust_attachments_deletedAt_idx" ON "time_adjust_attachments"("deletedAt");

-- AddForeignKey
ALTER TABLE "time_adjust_attachments" ADD CONSTRAINT "time_adjust_attachments_timeAdjustRequestId_fkey" FOREIGN KEY ("timeAdjustRequestId") REFERENCES "time_adjust_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjust_attachments" ADD CONSTRAINT "time_adjust_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
