-- CreateEnum
CREATE TYPE "OffboardingStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "OffboardingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'WAIVED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "OffboardingReasonType" AS ENUM ('RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'LAYOFF', 'OTHER');
-- CreateTable
CREATE TABLE "offboarding_checklists" (
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

    CONSTRAINT "offboarding_checklists_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "offboarding_checklist_items" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "ownerRole" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offboarding_checklist_items_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "offboarding_cases" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "resignationId" TEXT,
    "checklistId" TEXT,
    "reasonType" "OffboardingReasonType" NOT NULL DEFAULT 'RESIGNATION',
    "lastWorkingDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "status" "OffboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "accessRevokedAt" TIMESTAMP(3),
    "payrollStoppedAt" TIMESTAMP(3),
    "socialSecurityNotifiedAt" TIMESTAMP(3),
    "unusedLeaveDays" DECIMAL(10,2),
    "severancePay" DECIMAL(14,2),
    "finalPayNote" TEXT,
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offboarding_cases_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "offboarding_tasks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "ownerRole" TEXT,
    "status" "OffboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "note" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offboarding_tasks_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "exit_interviews" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "interviewDate" TIMESTAMP(3),
    "interviewerId" TEXT,
    "primaryReason" TEXT,
    "recommendScore" INTEGER,
    "wouldRehire" BOOLEAN,
    "whatWorkedWell" TEXT,
    "whatToImprove" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exit_interviews_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "offboarding_checklists_companyId_idx" ON "offboarding_checklists"("companyId");
-- CreateIndex
CREATE INDEX "offboarding_checklists_status_idx" ON "offboarding_checklists"("status");
-- CreateIndex
CREATE INDEX "offboarding_checklists_deletedAt_idx" ON "offboarding_checklists"("deletedAt");
-- CreateIndex
CREATE UNIQUE INDEX "offboarding_checklists_companyId_code_key" ON "offboarding_checklists"("companyId", "code");
-- CreateIndex
CREATE INDEX "offboarding_checklist_items_checklistId_idx" ON "offboarding_checklist_items"("checklistId");
-- CreateIndex
CREATE INDEX "offboarding_checklist_items_sortOrder_idx" ON "offboarding_checklist_items"("sortOrder");
-- CreateIndex
CREATE UNIQUE INDEX "offboarding_cases_resignationId_key" ON "offboarding_cases"("resignationId");
-- CreateIndex
CREATE INDEX "offboarding_cases_companyId_idx" ON "offboarding_cases"("companyId");
-- CreateIndex
CREATE INDEX "offboarding_cases_employeeId_idx" ON "offboarding_cases"("employeeId");
-- CreateIndex
CREATE INDEX "offboarding_cases_status_idx" ON "offboarding_cases"("status");
-- CreateIndex
CREATE INDEX "offboarding_cases_effectiveDate_idx" ON "offboarding_cases"("effectiveDate");
-- CreateIndex
CREATE INDEX "offboarding_cases_deletedAt_idx" ON "offboarding_cases"("deletedAt");
-- CreateIndex
CREATE INDEX "offboarding_tasks_companyId_idx" ON "offboarding_tasks"("companyId");
-- CreateIndex
CREATE INDEX "offboarding_tasks_employeeId_idx" ON "offboarding_tasks"("employeeId");
-- CreateIndex
CREATE INDEX "offboarding_tasks_caseId_idx" ON "offboarding_tasks"("caseId");
-- CreateIndex
CREATE INDEX "offboarding_tasks_status_idx" ON "offboarding_tasks"("status");
-- CreateIndex
CREATE INDEX "offboarding_tasks_deletedAt_idx" ON "offboarding_tasks"("deletedAt");
-- CreateIndex
CREATE UNIQUE INDEX "exit_interviews_caseId_key" ON "exit_interviews"("caseId");
-- CreateIndex
CREATE INDEX "exit_interviews_interviewDate_idx" ON "exit_interviews"("interviewDate");
-- CreateIndex
CREATE INDEX "exit_interviews_deletedAt_idx" ON "exit_interviews"("deletedAt");
-- AddForeignKey
ALTER TABLE "offboarding_checklists" ADD CONSTRAINT "offboarding_checklists_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_checklists" ADD CONSTRAINT "offboarding_checklists_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_checklist_items" ADD CONSTRAINT "offboarding_checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "offboarding_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_resignationId_fkey" FOREIGN KEY ("resignationId") REFERENCES "employee_resignations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "offboarding_checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_tasks" ADD CONSTRAINT "offboarding_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_tasks" ADD CONSTRAINT "offboarding_tasks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_tasks" ADD CONSTRAINT "offboarding_tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "offboarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_tasks" ADD CONSTRAINT "offboarding_tasks_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "offboarding_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "offboarding_tasks" ADD CONSTRAINT "offboarding_tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "exit_interviews" ADD CONSTRAINT "exit_interviews_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "offboarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "exit_interviews" ADD CONSTRAINT "exit_interviews_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
