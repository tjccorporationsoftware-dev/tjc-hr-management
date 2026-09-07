-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "EmploymentTypeTag" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY');
-- CreateEnum
CREATE TYPE "JobApplicationStage" AS ENUM ('NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');
-- CreateEnum
CREATE TYPE "InterviewResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'NO_SHOW');
-- CreateEnum
CREATE TYPE "JobOfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "departmentId" TEXT,
    "positionId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employmentType" "EmploymentTypeTag" NOT NULL DEFAULT 'FULL_TIME',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "requirement" TEXT,
    "salaryMin" DECIMAL(14,2),
    "salaryMax" DECIMAL(14,2),
    "workLocation" TEXT,
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "currentPosition" TEXT,
    "expectedSalary" DECIMAL(14,2),
    "availableFrom" TIMESTAMP(3),
    "source" TEXT,
    "note" TEXT,
    "stage" "JobApplicationStage" NOT NULL DEFAULT 'NEW',
    "rejectReason" TEXT,
    "screeningScore" INTEGER,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiredEmployeeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "job_application_attachments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "storageBucket" TEXT,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_application_attachments_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "job_interviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "interviewerId" TEXT,
    "interviewerName" TEXT,
    "result" "InterviewResult" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "strength" TEXT,
    "weakness" TEXT,
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_interviews_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "job_offers" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "offeredSalary" DECIMAL(14,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "probationDays" INTEGER NOT NULL DEFAULT 119,
    "expiresAt" TIMESTAMP(3),
    "benefitNote" TEXT,
    "note" TEXT,
    "status" "JobOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "job_postings_companyId_idx" ON "job_postings"("companyId");
-- CreateIndex
CREATE INDEX "job_postings_status_idx" ON "job_postings"("status");
-- CreateIndex
CREATE INDEX "job_postings_departmentId_idx" ON "job_postings"("departmentId");
-- CreateIndex
CREATE INDEX "job_postings_deletedAt_idx" ON "job_postings"("deletedAt");
-- CreateIndex
CREATE UNIQUE INDEX "job_postings_companyId_code_key" ON "job_postings"("companyId", "code");
-- CreateIndex
CREATE UNIQUE INDEX "job_applications_hiredEmployeeId_key" ON "job_applications"("hiredEmployeeId");
-- CreateIndex
CREATE INDEX "job_applications_companyId_idx" ON "job_applications"("companyId");
-- CreateIndex
CREATE INDEX "job_applications_postingId_idx" ON "job_applications"("postingId");
-- CreateIndex
CREATE INDEX "job_applications_stage_idx" ON "job_applications"("stage");
-- CreateIndex
CREATE INDEX "job_applications_email_idx" ON "job_applications"("email");
-- CreateIndex
CREATE INDEX "job_applications_deletedAt_idx" ON "job_applications"("deletedAt");
-- CreateIndex
CREATE INDEX "job_application_attachments_applicationId_idx" ON "job_application_attachments"("applicationId");
-- CreateIndex
CREATE INDEX "job_application_attachments_deletedAt_idx" ON "job_application_attachments"("deletedAt");
-- CreateIndex
CREATE INDEX "job_interviews_applicationId_idx" ON "job_interviews"("applicationId");
-- CreateIndex
CREATE INDEX "job_interviews_scheduledAt_idx" ON "job_interviews"("scheduledAt");
-- CreateIndex
CREATE INDEX "job_interviews_result_idx" ON "job_interviews"("result");
-- CreateIndex
CREATE INDEX "job_interviews_deletedAt_idx" ON "job_interviews"("deletedAt");
-- CreateIndex
CREATE INDEX "job_offers_applicationId_idx" ON "job_offers"("applicationId");
-- CreateIndex
CREATE INDEX "job_offers_status_idx" ON "job_offers"("status");
-- CreateIndex
CREATE INDEX "job_offers_deletedAt_idx" ON "job_offers"("deletedAt");
-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_hiredEmployeeId_fkey" FOREIGN KEY ("hiredEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_application_attachments" ADD CONSTRAINT "job_application_attachments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_application_attachments" ADD CONSTRAINT "job_application_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_interviews" ADD CONSTRAINT "job_interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_interviews" ADD CONSTRAINT "job_interviews_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_interviews" ADD CONSTRAINT "job_interviews_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
