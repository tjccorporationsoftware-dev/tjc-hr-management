-- CreateEnum
CREATE TYPE "ReportCode" AS ENUM ('ATTENDANCE', 'PAYROLL_BASIC', 'SOCIAL_SECURITY', 'LEAVE_QUOTA');

-- CreateEnum
CREATE TYPE "ReportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExportFileFormat" AS ENUM ('CSV', 'XLSX', 'PDF', 'JSON');

-- CreateEnum
CREATE TYPE "ReportLogAction" AS ENUM ('VIEW', 'CREATE_EXPORT', 'DOWNLOAD', 'CANCEL', 'ERROR');

-- CreateTable
CREATE TABLE "report_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "reportCode" "ReportCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReportJobStatus" NOT NULL DEFAULT 'PENDING',
    "params" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_files" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "reportJobId" TEXT,
    "reportCode" "ReportCode" NOT NULL,
    "format" "ExportFileFormat" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "bucketName" TEXT,
    "downloadedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "downloadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "export_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "reportJobId" TEXT,
    "exportFileId" TEXT,
    "reportCode" "ReportCode",
    "action" "ReportLogAction" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_jobs_companyId_idx" ON "report_jobs"("companyId");

-- CreateIndex
CREATE INDEX "report_jobs_reportCode_idx" ON "report_jobs"("reportCode");

-- CreateIndex
CREATE INDEX "report_jobs_status_idx" ON "report_jobs"("status");

-- CreateIndex
CREATE INDEX "report_jobs_createdById_idx" ON "report_jobs"("createdById");

-- CreateIndex
CREATE INDEX "report_jobs_cancelledById_idx" ON "report_jobs"("cancelledById");

-- CreateIndex
CREATE INDEX "report_jobs_createdAt_idx" ON "report_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "report_jobs_deletedAt_idx" ON "report_jobs"("deletedAt");

-- CreateIndex
CREATE INDEX "export_files_companyId_idx" ON "export_files"("companyId");

-- CreateIndex
CREATE INDEX "export_files_reportJobId_idx" ON "export_files"("reportJobId");

-- CreateIndex
CREATE INDEX "export_files_reportCode_idx" ON "export_files"("reportCode");

-- CreateIndex
CREATE INDEX "export_files_format_idx" ON "export_files"("format");

-- CreateIndex
CREATE INDEX "export_files_createdById_idx" ON "export_files"("createdById");

-- CreateIndex
CREATE INDEX "export_files_downloadedById_idx" ON "export_files"("downloadedById");

-- CreateIndex
CREATE INDEX "export_files_createdAt_idx" ON "export_files"("createdAt");

-- CreateIndex
CREATE INDEX "export_files_deletedAt_idx" ON "export_files"("deletedAt");

-- CreateIndex
CREATE INDEX "report_logs_companyId_idx" ON "report_logs"("companyId");

-- CreateIndex
CREATE INDEX "report_logs_reportJobId_idx" ON "report_logs"("reportJobId");

-- CreateIndex
CREATE INDEX "report_logs_exportFileId_idx" ON "report_logs"("exportFileId");

-- CreateIndex
CREATE INDEX "report_logs_reportCode_idx" ON "report_logs"("reportCode");

-- CreateIndex
CREATE INDEX "report_logs_action_idx" ON "report_logs"("action");

-- CreateIndex
CREATE INDEX "report_logs_createdById_idx" ON "report_logs"("createdById");

-- CreateIndex
CREATE INDEX "report_logs_createdAt_idx" ON "report_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_reportJobId_fkey" FOREIGN KEY ("reportJobId") REFERENCES "report_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_downloadedById_fkey" FOREIGN KEY ("downloadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_logs" ADD CONSTRAINT "report_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_logs" ADD CONSTRAINT "report_logs_reportJobId_fkey" FOREIGN KEY ("reportJobId") REFERENCES "report_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_logs" ADD CONSTRAINT "report_logs_exportFileId_fkey" FOREIGN KEY ("exportFileId") REFERENCES "export_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_logs" ADD CONSTRAINT "report_logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
