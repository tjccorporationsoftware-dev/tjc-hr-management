-- CreateEnum
CREATE TYPE "HrReviewSourceType" AS ENUM ('LEAVE', 'OVERTIME', 'TIME_ADJUST');

-- CreateEnum
CREATE TYPE "HrReviewStatus" AS ENUM ('REVIEWED', 'PAYROLL_READY', 'ON_HOLD', 'SENT_TO_PAYROLL', 'CANCELLED');

-- CreateTable
CREATE TABLE "hr_review_items" (
    "id" TEXT NOT NULL,
    "sourceType" "HrReviewSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT,
    "payrollRunId" TEXT,
    "status" "HrReviewStatus" NOT NULL DEFAULT 'REVIEWED',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "payrollReadyAt" TIMESTAMP(3),
    "payrollReadyById" TEXT,
    "sentToPayrollAt" TIMESTAMP(3),
    "sentToPayrollById" TEXT,
    "heldAt" TIMESTAMP(3),
    "heldById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hr_review_items_sourceType_idx" ON "hr_review_items"("sourceType");

-- CreateIndex
CREATE INDEX "hr_review_items_sourceId_idx" ON "hr_review_items"("sourceId");

-- CreateIndex
CREATE INDEX "hr_review_items_companyId_idx" ON "hr_review_items"("companyId");

-- CreateIndex
CREATE INDEX "hr_review_items_employeeId_idx" ON "hr_review_items"("employeeId");

-- CreateIndex
CREATE INDEX "hr_review_items_periodId_idx" ON "hr_review_items"("periodId");

-- CreateIndex
CREATE INDEX "hr_review_items_payrollRunId_idx" ON "hr_review_items"("payrollRunId");

-- CreateIndex
CREATE INDEX "hr_review_items_status_idx" ON "hr_review_items"("status");

-- CreateIndex
CREATE INDEX "hr_review_items_reviewedById_idx" ON "hr_review_items"("reviewedById");

-- CreateIndex
CREATE INDEX "hr_review_items_payrollReadyById_idx" ON "hr_review_items"("payrollReadyById");

-- CreateIndex
CREATE INDEX "hr_review_items_sentToPayrollById_idx" ON "hr_review_items"("sentToPayrollById");

-- CreateIndex
CREATE INDEX "hr_review_items_createdAt_idx" ON "hr_review_items"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "hr_review_items_sourceType_sourceId_key" ON "hr_review_items"("sourceType", "sourceId");
