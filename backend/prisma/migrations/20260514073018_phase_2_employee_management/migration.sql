-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('ID_CARD', 'HOUSE_REGISTRATION', 'EMPLOYMENT_CONTRACT', 'EDUCATION_CERTIFICATE', 'BANK_BOOK', 'MEDICAL_CERTIFICATE', 'WORK_PERMIT', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeDocumentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REPLACED', 'DELETED');

-- CreateEnum
CREATE TYPE "WorkHistoryType" AS ENUM ('JOINED', 'POSITION_CHANGE', 'DEPARTMENT_TRANSFER', 'BRANCH_TRANSFER', 'DIVISION_TRANSFER', 'EMPLOYEE_TYPE_CHANGE', 'SALARY_ADJUSTMENT', 'STATUS_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ResignationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nickname" TEXT,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "probationEndDate" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "departmentId" TEXT,
    "divisionId" TEXT,
    "employeeTypeId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_profiles" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "birthDate" TIMESTAMP(3),
    "nationalId" TEXT,
    "passportNo" TEXT,
    "maritalStatus" "MaritalStatus" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "nationality" TEXT,
    "religion" TEXT,
    "currentAddress" TEXT,
    "registeredAddress" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "educationLevel" TEXT,
    "educationInstitute" TEXT,
    "educationMajor" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "bankAccountName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "bucketName" TEXT,
    "issuedDate" TIMESTAMP(3),
    "expiredDate" TIMESTAMP(3),
    "status" "EmployeeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_work_histories" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "WorkHistoryType" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "oldCompanyId" TEXT,
    "newCompanyId" TEXT,
    "oldBranchId" TEXT,
    "newBranchId" TEXT,
    "oldDepartmentId" TEXT,
    "newDepartmentId" TEXT,
    "oldDivisionId" TEXT,
    "newDivisionId" TEXT,
    "oldEmployeeTypeId" TEXT,
    "newEmployeeTypeId" TEXT,
    "oldPosition" TEXT,
    "newPosition" TEXT,
    "oldStatus" "EmployeeStatus",
    "newStatus" "EmployeeStatus",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_work_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_resignations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "resignationDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "ResignationStatus" NOT NULL DEFAULT 'DRAFT',
    "documentId" TEXT,
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

    CONSTRAINT "employee_resignations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeCode_key" ON "employees"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_employeeCode_idx" ON "employees"("employeeCode");

-- CreateIndex
CREATE INDEX "employees_firstName_lastName_idx" ON "employees"("firstName", "lastName");

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE INDEX "employees_branchId_idx" ON "employees"("branchId");

-- CreateIndex
CREATE INDEX "employees_departmentId_idx" ON "employees"("departmentId");

-- CreateIndex
CREATE INDEX "employees_divisionId_idx" ON "employees"("divisionId");

-- CreateIndex
CREATE INDEX "employees_employeeTypeId_idx" ON "employees"("employeeTypeId");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_deletedAt_idx" ON "employees"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_employeeId_key" ON "employee_profiles"("employeeId");

-- CreateIndex
CREATE INDEX "employee_profiles_nationalId_idx" ON "employee_profiles"("nationalId");

-- CreateIndex
CREATE INDEX "employee_documents_employeeId_idx" ON "employee_documents"("employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_type_idx" ON "employee_documents"("type");

-- CreateIndex
CREATE INDEX "employee_documents_status_idx" ON "employee_documents"("status");

-- CreateIndex
CREATE INDEX "employee_documents_uploadedById_idx" ON "employee_documents"("uploadedById");

-- CreateIndex
CREATE INDEX "employee_documents_deletedAt_idx" ON "employee_documents"("deletedAt");

-- CreateIndex
CREATE INDEX "employee_work_histories_employeeId_idx" ON "employee_work_histories"("employeeId");

-- CreateIndex
CREATE INDEX "employee_work_histories_type_idx" ON "employee_work_histories"("type");

-- CreateIndex
CREATE INDEX "employee_work_histories_effectiveDate_idx" ON "employee_work_histories"("effectiveDate");

-- CreateIndex
CREATE INDEX "employee_work_histories_createdById_idx" ON "employee_work_histories"("createdById");

-- CreateIndex
CREATE INDEX "employee_resignations_employeeId_idx" ON "employee_resignations"("employeeId");

-- CreateIndex
CREATE INDEX "employee_resignations_status_idx" ON "employee_resignations"("status");

-- CreateIndex
CREATE INDEX "employee_resignations_effectiveDate_idx" ON "employee_resignations"("effectiveDate");

-- CreateIndex
CREATE INDEX "employee_resignations_documentId_idx" ON "employee_resignations"("documentId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employeeTypeId_fkey" FOREIGN KEY ("employeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_oldCompanyId_fkey" FOREIGN KEY ("oldCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_newCompanyId_fkey" FOREIGN KEY ("newCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_oldBranchId_fkey" FOREIGN KEY ("oldBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_newBranchId_fkey" FOREIGN KEY ("newBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_oldDepartmentId_fkey" FOREIGN KEY ("oldDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_newDepartmentId_fkey" FOREIGN KEY ("newDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_oldDivisionId_fkey" FOREIGN KEY ("oldDivisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_newDivisionId_fkey" FOREIGN KEY ("newDivisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_oldEmployeeTypeId_fkey" FOREIGN KEY ("oldEmployeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_histories" ADD CONSTRAINT "employee_work_histories_newEmployeeTypeId_fkey" FOREIGN KEY ("newEmployeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
