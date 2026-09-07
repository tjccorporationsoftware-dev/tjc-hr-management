-- ประวัติการศึกษาของพนักงาน (หนึ่งคนมีได้หลายวุฒิ)
CREATE TABLE IF NOT EXISTS "employee_educations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "institute" TEXT,
    "major" TEXT,
    "gradYear" INTEGER,
    "gpa" DECIMAL(4,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "employee_educations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_educations_employeeId_idx" ON "employee_educations"("employeeId");
CREATE INDEX IF NOT EXISTS "employee_educations_companyId_idx" ON "employee_educations"("companyId");
CREATE INDEX IF NOT EXISTS "employee_educations_deletedAt_idx" ON "employee_educations"("deletedAt");

ALTER TABLE "employee_educations"
  ADD CONSTRAINT "employee_educations_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_educations"
  ADD CONSTRAINT "employee_educations_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
