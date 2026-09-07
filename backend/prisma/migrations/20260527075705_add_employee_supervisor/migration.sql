-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "supervisorId" TEXT;

-- CreateIndex
CREATE INDEX "employees_positionId_idx" ON "employees"("positionId");

-- CreateIndex
CREATE INDEX "employees_supervisorId_idx" ON "employees"("supervisorId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
