-- CreateEnum
CREATE TYPE "EvaluationFormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EvaluationQuestionType" AS ENUM ('SCORE', 'TEXT', 'YES_NO');

-- CreateEnum
CREATE TYPE "EvaluationResultStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FINALIZED', 'CANCELLED');

-- CreateTable
CREATE TABLE "evaluation_forms" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "periodType" TEXT,
    "totalScore" DECIMAL(10,2),
    "passScore" DECIMAL(10,2),
    "status" "EvaluationFormStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "evaluation_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_questions" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "EvaluationQuestionType" NOT NULL DEFAULT 'SCORE',
    "maxScore" DECIMAL(10,2) NOT NULL DEFAULT 5,
    "weight" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluators" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "employeeId" TEXT,
    "evaluatorUserId" TEXT,
    "evaluatorEmployeeId" TEXT,
    "note" TEXT,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "evaluators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_results" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "evaluatorUserId" TEXT,
    "periodName" TEXT,
    "evaluationDate" TIMESTAMP(3) NOT NULL,
    "scoreItems" JSONB,
    "totalScore" DECIMAL(10,2),
    "maxScore" DECIMAL(10,2),
    "percent" DECIMAL(10,2),
    "summary" TEXT,
    "recommendation" TEXT,
    "note" TEXT,
    "status" "EvaluationResultStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "submittedById" TEXT,
    "finalizedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "evaluation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_attachments" (
    "id" TEXT NOT NULL,
    "evaluationResultId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "bucketName" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "evaluation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluation_forms_companyId_idx" ON "evaluation_forms"("companyId");

-- CreateIndex
CREATE INDEX "evaluation_forms_code_idx" ON "evaluation_forms"("code");

-- CreateIndex
CREATE INDEX "evaluation_forms_status_idx" ON "evaluation_forms"("status");

-- CreateIndex
CREATE INDEX "evaluation_forms_createdById_idx" ON "evaluation_forms"("createdById");

-- CreateIndex
CREATE INDEX "evaluation_forms_deletedAt_idx" ON "evaluation_forms"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_forms_companyId_code_key" ON "evaluation_forms"("companyId", "code");

-- CreateIndex
CREATE INDEX "evaluation_questions_formId_idx" ON "evaluation_questions"("formId");

-- CreateIndex
CREATE INDEX "evaluation_questions_type_idx" ON "evaluation_questions"("type");

-- CreateIndex
CREATE INDEX "evaluation_questions_sortOrder_idx" ON "evaluation_questions"("sortOrder");

-- CreateIndex
CREATE INDEX "evaluators_formId_idx" ON "evaluators"("formId");

-- CreateIndex
CREATE INDEX "evaluators_employeeId_idx" ON "evaluators"("employeeId");

-- CreateIndex
CREATE INDEX "evaluators_evaluatorUserId_idx" ON "evaluators"("evaluatorUserId");

-- CreateIndex
CREATE INDEX "evaluators_evaluatorEmployeeId_idx" ON "evaluators"("evaluatorEmployeeId");

-- CreateIndex
CREATE INDEX "evaluators_status_idx" ON "evaluators"("status");

-- CreateIndex
CREATE INDEX "evaluators_createdById_idx" ON "evaluators"("createdById");

-- CreateIndex
CREATE INDEX "evaluators_deletedAt_idx" ON "evaluators"("deletedAt");

-- CreateIndex
CREATE INDEX "evaluation_results_companyId_idx" ON "evaluation_results"("companyId");

-- CreateIndex
CREATE INDEX "evaluation_results_formId_idx" ON "evaluation_results"("formId");

-- CreateIndex
CREATE INDEX "evaluation_results_employeeId_idx" ON "evaluation_results"("employeeId");

-- CreateIndex
CREATE INDEX "evaluation_results_evaluatorUserId_idx" ON "evaluation_results"("evaluatorUserId");

-- CreateIndex
CREATE INDEX "evaluation_results_evaluationDate_idx" ON "evaluation_results"("evaluationDate");

-- CreateIndex
CREATE INDEX "evaluation_results_status_idx" ON "evaluation_results"("status");

-- CreateIndex
CREATE INDEX "evaluation_results_createdById_idx" ON "evaluation_results"("createdById");

-- CreateIndex
CREATE INDEX "evaluation_results_submittedById_idx" ON "evaluation_results"("submittedById");

-- CreateIndex
CREATE INDEX "evaluation_results_finalizedById_idx" ON "evaluation_results"("finalizedById");

-- CreateIndex
CREATE INDEX "evaluation_results_deletedAt_idx" ON "evaluation_results"("deletedAt");

-- CreateIndex
CREATE INDEX "evaluation_attachments_evaluationResultId_idx" ON "evaluation_attachments"("evaluationResultId");

-- CreateIndex
CREATE INDEX "evaluation_attachments_uploadedById_idx" ON "evaluation_attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "evaluation_attachments_deletedAt_idx" ON "evaluation_attachments"("deletedAt");

-- AddForeignKey
ALTER TABLE "evaluation_forms" ADD CONSTRAINT "evaluation_forms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_forms" ADD CONSTRAINT "evaluation_forms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_questions" ADD CONSTRAINT "evaluation_questions_formId_fkey" FOREIGN KEY ("formId") REFERENCES "evaluation_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_formId_fkey" FOREIGN KEY ("formId") REFERENCES "evaluation_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_evaluatorEmployeeId_fkey" FOREIGN KEY ("evaluatorEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_formId_fkey" FOREIGN KEY ("formId") REFERENCES "evaluation_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_attachments" ADD CONSTRAINT "evaluation_attachments_evaluationResultId_fkey" FOREIGN KEY ("evaluationResultId") REFERENCES "evaluation_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_attachments" ADD CONSTRAINT "evaluation_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
