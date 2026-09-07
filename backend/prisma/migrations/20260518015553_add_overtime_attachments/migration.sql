-- CreateTable
CREATE TABLE "overtime_attachments" (
    "id" TEXT NOT NULL,
    "overtimeRequestId" TEXT NOT NULL,
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

    CONSTRAINT "overtime_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_attachments_overtimeRequestId_idx" ON "overtime_attachments"("overtimeRequestId");

-- CreateIndex
CREATE INDEX "overtime_attachments_uploadedById_idx" ON "overtime_attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "overtime_attachments_deletedAt_idx" ON "overtime_attachments"("deletedAt");

-- AddForeignKey
ALTER TABLE "overtime_attachments" ADD CONSTRAINT "overtime_attachments_overtimeRequestId_fkey" FOREIGN KEY ("overtimeRequestId") REFERENCES "overtime_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_attachments" ADD CONSTRAINT "overtime_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
