-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentApprovalAction" AS ENUM ('SUBMIT', 'APPROVE_LEVEL_1', 'APPROVE_LEVEL_2', 'APPROVE', 'REJECT', 'CANCEL');

-- CreateEnum
CREATE TYPE "DocumentFileType" AS ENUM ('ATTACHMENT', 'GENERATED_PDF');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "category" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "approvalLevels" INTEGER NOT NULL DEFAULT 2,
    "allowEmployeeRequest" BOOLEAN NOT NULL DEFAULT true,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "documentTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "requestData" JSONB,
    "note" TEXT,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_approvals" (
    "id" TEXT NOT NULL,
    "documentRequestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "action" "DocumentApprovalAction" NOT NULL,
    "oldStatus" "DocumentRequestStatus",
    "newStatus" "DocumentRequestStatus",
    "reason" TEXT,
    "note" TEXT,
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" TEXT NOT NULL,
    "documentRequestId" TEXT NOT NULL,
    "fileType" "DocumentFileType" NOT NULL DEFAULT 'ATTACHMENT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bucketName" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "documentTypeId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "htmlContent" TEXT,
    "config" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "complaintNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "expectation" TEXT,
    "note" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_types_companyId_idx" ON "document_types"("companyId");

-- CreateIndex
CREATE INDEX "document_types_code_idx" ON "document_types"("code");

-- CreateIndex
CREATE INDEX "document_types_status_idx" ON "document_types"("status");

-- CreateIndex
CREATE INDEX "document_types_deletedAt_idx" ON "document_types"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_companyId_code_key" ON "document_types"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "document_requests_requestNo_key" ON "document_requests"("requestNo");

-- CreateIndex
CREATE INDEX "document_requests_requestNo_idx" ON "document_requests"("requestNo");

-- CreateIndex
CREATE INDEX "document_requests_companyId_idx" ON "document_requests"("companyId");

-- CreateIndex
CREATE INDEX "document_requests_employeeId_idx" ON "document_requests"("employeeId");

-- CreateIndex
CREATE INDEX "document_requests_documentTypeId_idx" ON "document_requests"("documentTypeId");

-- CreateIndex
CREATE INDEX "document_requests_status_idx" ON "document_requests"("status");

-- CreateIndex
CREATE INDEX "document_requests_submittedAt_idx" ON "document_requests"("submittedAt");

-- CreateIndex
CREATE INDEX "document_requests_deletedAt_idx" ON "document_requests"("deletedAt");

-- CreateIndex
CREATE INDEX "document_approvals_documentRequestId_idx" ON "document_approvals"("documentRequestId");

-- CreateIndex
CREATE INDEX "document_approvals_level_idx" ON "document_approvals"("level");

-- CreateIndex
CREATE INDEX "document_approvals_action_idx" ON "document_approvals"("action");

-- CreateIndex
CREATE INDEX "document_approvals_actedById_idx" ON "document_approvals"("actedById");

-- CreateIndex
CREATE INDEX "document_approvals_createdAt_idx" ON "document_approvals"("createdAt");

-- CreateIndex
CREATE INDEX "document_files_documentRequestId_idx" ON "document_files"("documentRequestId");

-- CreateIndex
CREATE INDEX "document_files_fileType_idx" ON "document_files"("fileType");

-- CreateIndex
CREATE INDEX "document_files_uploadedById_idx" ON "document_files"("uploadedById");

-- CreateIndex
CREATE INDEX "document_files_deletedAt_idx" ON "document_files"("deletedAt");

-- CreateIndex
CREATE INDEX "document_templates_companyId_idx" ON "document_templates"("companyId");

-- CreateIndex
CREATE INDEX "document_templates_documentTypeId_idx" ON "document_templates"("documentTypeId");

-- CreateIndex
CREATE INDEX "document_templates_status_idx" ON "document_templates"("status");

-- CreateIndex
CREATE INDEX "document_templates_deletedAt_idx" ON "document_templates"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_companyId_code_key" ON "document_templates"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_complaintNo_key" ON "complaints"("complaintNo");

-- CreateIndex
CREATE INDEX "complaints_complaintNo_idx" ON "complaints"("complaintNo");

-- CreateIndex
CREATE INDEX "complaints_companyId_idx" ON "complaints"("companyId");

-- CreateIndex
CREATE INDEX "complaints_employeeId_idx" ON "complaints"("employeeId");

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status");

-- CreateIndex
CREATE INDEX "complaints_submittedAt_idx" ON "complaints"("submittedAt");

-- CreateIndex
CREATE INDEX "complaints_deletedAt_idx" ON "complaints"("deletedAt");

-- AddForeignKey
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_documentRequestId_fkey" FOREIGN KEY ("documentRequestId") REFERENCES "document_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_documentRequestId_fkey" FOREIGN KEY ("documentRequestId") REFERENCES "document_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
