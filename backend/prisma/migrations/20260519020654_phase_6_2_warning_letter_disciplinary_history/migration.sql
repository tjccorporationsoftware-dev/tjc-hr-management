-- CreateEnum
CREATE TYPE "WarningLetterStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarningSeverity" AS ENUM ('INFO', 'MINOR', 'MAJOR', 'SERIOUS');

-- CreateEnum
CREATE TYPE "DisciplinaryHistoryType" AS ENUM ('WARNING', 'ACKNOWLEDGEMENT', 'INCIDENT', 'NOTE');

-- CreateTable
CREATE TABLE "warning_letters" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "letterNo" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "severity" "WarningSeverity" NOT NULL DEFAULT 'MINOR',
    "status" "WarningLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "incidentDate" TIMESTAMP(3),
    "issuedDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "correctiveAction" TEXT,
    "employeeResponse" TEXT,
    "note" TEXT,
    "issuedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "issuedById" TEXT,
    "acknowledgedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "warning_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_histories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "warningLetterId" TEXT,
    "type" "DisciplinaryHistoryType" NOT NULL DEFAULT 'WARNING',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actionTaken" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "disciplinary_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warning_letters_companyId_idx" ON "warning_letters"("companyId");

-- CreateIndex
CREATE INDEX "warning_letters_employeeId_idx" ON "warning_letters"("employeeId");

-- CreateIndex
CREATE INDEX "warning_letters_severity_idx" ON "warning_letters"("severity");

-- CreateIndex
CREATE INDEX "warning_letters_status_idx" ON "warning_letters"("status");

-- CreateIndex
CREATE INDEX "warning_letters_incidentDate_idx" ON "warning_letters"("incidentDate");

-- CreateIndex
CREATE INDEX "warning_letters_issuedDate_idx" ON "warning_letters"("issuedDate");

-- CreateIndex
CREATE INDEX "warning_letters_createdById_idx" ON "warning_letters"("createdById");

-- CreateIndex
CREATE INDEX "warning_letters_issuedById_idx" ON "warning_letters"("issuedById");

-- CreateIndex
CREATE INDEX "warning_letters_acknowledgedById_idx" ON "warning_letters"("acknowledgedById");

-- CreateIndex
CREATE INDEX "warning_letters_cancelledById_idx" ON "warning_letters"("cancelledById");

-- CreateIndex
CREATE INDEX "warning_letters_deletedAt_idx" ON "warning_letters"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "warning_letters_companyId_letterNo_key" ON "warning_letters"("companyId", "letterNo");

-- CreateIndex
CREATE INDEX "disciplinary_histories_companyId_idx" ON "disciplinary_histories"("companyId");

-- CreateIndex
CREATE INDEX "disciplinary_histories_employeeId_idx" ON "disciplinary_histories"("employeeId");

-- CreateIndex
CREATE INDEX "disciplinary_histories_warningLetterId_idx" ON "disciplinary_histories"("warningLetterId");

-- CreateIndex
CREATE INDEX "disciplinary_histories_type_idx" ON "disciplinary_histories"("type");

-- CreateIndex
CREATE INDEX "disciplinary_histories_eventDate_idx" ON "disciplinary_histories"("eventDate");

-- CreateIndex
CREATE INDEX "disciplinary_histories_createdById_idx" ON "disciplinary_histories"("createdById");

-- CreateIndex
CREATE INDEX "disciplinary_histories_deletedAt_idx" ON "disciplinary_histories"("deletedAt");

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_histories" ADD CONSTRAINT "disciplinary_histories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_histories" ADD CONSTRAINT "disciplinary_histories_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_histories" ADD CONSTRAINT "disciplinary_histories_warningLetterId_fkey" FOREIGN KEY ("warningLetterId") REFERENCES "warning_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_histories" ADD CONSTRAINT "disciplinary_histories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
