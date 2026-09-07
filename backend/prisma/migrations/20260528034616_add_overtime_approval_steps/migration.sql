-- CreateEnum
CREATE TYPE "OvertimeApprovalStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'SKIPPED');

-- CreateTable
CREATE TABLE "overtime_approval_steps" (
    "id" TEXT NOT NULL,
    "overtimeRequestId" TEXT NOT NULL,
    "matrixId" TEXT,
    "matrixStepId" TEXT,
    "stepNo" INTEGER NOT NULL,
    "nameTh" TEXT NOT NULL,
    "description" TEXT,
    "approverType" "ApprovalStepApproverType" NOT NULL,
    "expectedApproverId" TEXT,
    "expectedEmployeeId" TEXT,
    "positionId" TEXT,
    "roleCode" TEXT,
    "minApproverCount" INTEGER NOT NULL DEFAULT 1,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "OvertimeApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3),
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_approval_steps_overtimeRequestId_idx" ON "overtime_approval_steps"("overtimeRequestId");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_matrixId_idx" ON "overtime_approval_steps"("matrixId");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_matrixStepId_idx" ON "overtime_approval_steps"("matrixStepId");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_expectedApproverId_idx" ON "overtime_approval_steps"("expectedApproverId");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_expectedEmployeeId_idx" ON "overtime_approval_steps"("expectedEmployeeId");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_positionId_idx" ON "overtime_approval_steps"("positionId");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_roleCode_idx" ON "overtime_approval_steps"("roleCode");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_status_idx" ON "overtime_approval_steps"("status");

-- CreateIndex
CREATE INDEX "overtime_approval_steps_createdAt_idx" ON "overtime_approval_steps"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_approval_steps_overtimeRequestId_stepNo_key" ON "overtime_approval_steps"("overtimeRequestId", "stepNo");

-- AddForeignKey
ALTER TABLE "overtime_approval_steps" ADD CONSTRAINT "overtime_approval_steps_overtimeRequestId_fkey" FOREIGN KEY ("overtimeRequestId") REFERENCES "overtime_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_steps" ADD CONSTRAINT "overtime_approval_steps_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "approval_matrices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_steps" ADD CONSTRAINT "overtime_approval_steps_matrixStepId_fkey" FOREIGN KEY ("matrixStepId") REFERENCES "approval_matrix_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_steps" ADD CONSTRAINT "overtime_approval_steps_expectedApproverId_fkey" FOREIGN KEY ("expectedApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_steps" ADD CONSTRAINT "overtime_approval_steps_expectedEmployeeId_fkey" FOREIGN KEY ("expectedEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_steps" ADD CONSTRAINT "overtime_approval_steps_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approval_steps" ADD CONSTRAINT "overtime_approval_steps_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
