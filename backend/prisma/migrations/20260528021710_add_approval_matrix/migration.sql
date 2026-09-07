-- CreateEnum
CREATE TYPE "ApprovalMatrixTargetType" AS ENUM ('LEAVE_REQUEST', 'OVERTIME_REQUEST', 'TIME_ADJUST_REQUEST', 'DOCUMENT_REQUEST', 'PAYROLL_RUN', 'EMPLOYEE_CHANGE', 'GENERAL');

-- CreateEnum
CREATE TYPE "ApprovalStepApproverType" AS ENUM ('SUPERVISOR', 'POSITION', 'EMPLOYEE', 'ROLE', 'HR_ADMIN', 'EXECUTIVE');

-- CreateTable
CREATE TABLE "approval_matrices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "targetType" "ApprovalMatrixTargetType" NOT NULL,
    "departmentId" TEXT,
    "employeeTypeId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "approval_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_matrix_steps" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "stepNo" INTEGER NOT NULL,
    "nameTh" TEXT NOT NULL,
    "description" TEXT,
    "approverType" "ApprovalStepApproverType" NOT NULL,
    "positionId" TEXT,
    "employeeId" TEXT,
    "roleCode" TEXT,
    "requireAll" BOOLEAN NOT NULL DEFAULT false,
    "minApproverCount" INTEGER NOT NULL DEFAULT 1,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "approval_matrix_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_matrices_companyId_idx" ON "approval_matrices"("companyId");

-- CreateIndex
CREATE INDEX "approval_matrices_departmentId_idx" ON "approval_matrices"("departmentId");

-- CreateIndex
CREATE INDEX "approval_matrices_employeeTypeId_idx" ON "approval_matrices"("employeeTypeId");

-- CreateIndex
CREATE INDEX "approval_matrices_targetType_idx" ON "approval_matrices"("targetType");

-- CreateIndex
CREATE INDEX "approval_matrices_status_idx" ON "approval_matrices"("status");

-- CreateIndex
CREATE INDEX "approval_matrices_deletedAt_idx" ON "approval_matrices"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "approval_matrices_companyId_code_key" ON "approval_matrices"("companyId", "code");

-- CreateIndex
CREATE INDEX "approval_matrix_steps_matrixId_idx" ON "approval_matrix_steps"("matrixId");

-- CreateIndex
CREATE INDEX "approval_matrix_steps_positionId_idx" ON "approval_matrix_steps"("positionId");

-- CreateIndex
CREATE INDEX "approval_matrix_steps_employeeId_idx" ON "approval_matrix_steps"("employeeId");

-- CreateIndex
CREATE INDEX "approval_matrix_steps_roleCode_idx" ON "approval_matrix_steps"("roleCode");

-- CreateIndex
CREATE INDEX "approval_matrix_steps_approverType_idx" ON "approval_matrix_steps"("approverType");

-- CreateIndex
CREATE INDEX "approval_matrix_steps_status_idx" ON "approval_matrix_steps"("status");

-- CreateIndex
CREATE INDEX "approval_matrix_steps_deletedAt_idx" ON "approval_matrix_steps"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "approval_matrix_steps_matrixId_stepNo_key" ON "approval_matrix_steps"("matrixId", "stepNo");

-- AddForeignKey
ALTER TABLE "approval_matrices" ADD CONSTRAINT "approval_matrices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrices" ADD CONSTRAINT "approval_matrices_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrices" ADD CONSTRAINT "approval_matrices_employeeTypeId_fkey" FOREIGN KEY ("employeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrix_steps" ADD CONSTRAINT "approval_matrix_steps_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "approval_matrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrix_steps" ADD CONSTRAINT "approval_matrix_steps_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrix_steps" ADD CONSTRAINT "approval_matrix_steps_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
