-- CreateEnum
CREATE TYPE "OnboardingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "OnboardingDocumentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "ProbationStatus" AS ENUM ('IN_PROGRESS', 'PASSED', 'FAILED', 'EXTENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "onboarding_checklists" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "onboarding_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_items" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "checklistId" TEXT,
    "checklistItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "OnboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "completedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskId" TEXT,
    "documentName" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "OnboardingDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT,
    "storageKey" TEXT,
    "bucketName" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "submittedById" TEXT,
    "verifiedById" TEXT,
    "rejectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "onboarding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "probation_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reviewDate" TIMESTAMP(3),
    "status" "ProbationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "result" TEXT,
    "summary" TEXT,
    "recommendation" TEXT,
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "extendedUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "probation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_checklists_companyId_idx" ON "onboarding_checklists"("companyId");

-- CreateIndex
CREATE INDEX "onboarding_checklists_code_idx" ON "onboarding_checklists"("code");

-- CreateIndex
CREATE INDEX "onboarding_checklists_status_idx" ON "onboarding_checklists"("status");

-- CreateIndex
CREATE INDEX "onboarding_checklists_createdById_idx" ON "onboarding_checklists"("createdById");

-- CreateIndex
CREATE INDEX "onboarding_checklists_deletedAt_idx" ON "onboarding_checklists"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_checklists_companyId_code_key" ON "onboarding_checklists"("companyId", "code");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_checklistId_idx" ON "onboarding_checklist_items"("checklistId");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_category_idx" ON "onboarding_checklist_items"("category");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_sortOrder_idx" ON "onboarding_checklist_items"("sortOrder");

-- CreateIndex
CREATE INDEX "onboarding_tasks_companyId_idx" ON "onboarding_tasks"("companyId");

-- CreateIndex
CREATE INDEX "onboarding_tasks_employeeId_idx" ON "onboarding_tasks"("employeeId");

-- CreateIndex
CREATE INDEX "onboarding_tasks_checklistId_idx" ON "onboarding_tasks"("checklistId");

-- CreateIndex
CREATE INDEX "onboarding_tasks_checklistItemId_idx" ON "onboarding_tasks"("checklistItemId");

-- CreateIndex
CREATE INDEX "onboarding_tasks_status_idx" ON "onboarding_tasks"("status");

-- CreateIndex
CREATE INDEX "onboarding_tasks_dueDate_idx" ON "onboarding_tasks"("dueDate");

-- CreateIndex
CREATE INDEX "onboarding_tasks_createdById_idx" ON "onboarding_tasks"("createdById");

-- CreateIndex
CREATE INDEX "onboarding_tasks_completedById_idx" ON "onboarding_tasks"("completedById");

-- CreateIndex
CREATE INDEX "onboarding_tasks_cancelledById_idx" ON "onboarding_tasks"("cancelledById");

-- CreateIndex
CREATE INDEX "onboarding_tasks_deletedAt_idx" ON "onboarding_tasks"("deletedAt");

-- CreateIndex
CREATE INDEX "onboarding_documents_companyId_idx" ON "onboarding_documents"("companyId");

-- CreateIndex
CREATE INDEX "onboarding_documents_employeeId_idx" ON "onboarding_documents"("employeeId");

-- CreateIndex
CREATE INDEX "onboarding_documents_taskId_idx" ON "onboarding_documents"("taskId");

-- CreateIndex
CREATE INDEX "onboarding_documents_status_idx" ON "onboarding_documents"("status");

-- CreateIndex
CREATE INDEX "onboarding_documents_createdById_idx" ON "onboarding_documents"("createdById");

-- CreateIndex
CREATE INDEX "onboarding_documents_submittedById_idx" ON "onboarding_documents"("submittedById");

-- CreateIndex
CREATE INDEX "onboarding_documents_verifiedById_idx" ON "onboarding_documents"("verifiedById");

-- CreateIndex
CREATE INDEX "onboarding_documents_rejectedById_idx" ON "onboarding_documents"("rejectedById");

-- CreateIndex
CREATE INDEX "onboarding_documents_deletedAt_idx" ON "onboarding_documents"("deletedAt");

-- CreateIndex
CREATE INDEX "probation_records_companyId_idx" ON "probation_records"("companyId");

-- CreateIndex
CREATE INDEX "probation_records_employeeId_idx" ON "probation_records"("employeeId");

-- CreateIndex
CREATE INDEX "probation_records_status_idx" ON "probation_records"("status");

-- CreateIndex
CREATE INDEX "probation_records_startDate_idx" ON "probation_records"("startDate");

-- CreateIndex
CREATE INDEX "probation_records_endDate_idx" ON "probation_records"("endDate");

-- CreateIndex
CREATE INDEX "probation_records_reviewDate_idx" ON "probation_records"("reviewDate");

-- CreateIndex
CREATE INDEX "probation_records_createdById_idx" ON "probation_records"("createdById");

-- CreateIndex
CREATE INDEX "probation_records_reviewedById_idx" ON "probation_records"("reviewedById");

-- CreateIndex
CREATE INDEX "probation_records_deletedAt_idx" ON "probation_records"("deletedAt");

-- AddForeignKey
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "onboarding_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "onboarding_checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "onboarding_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "onboarding_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_records" ADD CONSTRAINT "probation_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_records" ADD CONSTRAINT "probation_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_records" ADD CONSTRAINT "probation_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_records" ADD CONSTRAINT "probation_records_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
