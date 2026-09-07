-- สมาชิกครอบครัวของพนักงาน (บิดา มารดา คู่สมรส พี่น้อง ผู้ติดต่อฉุกเฉิน)
CREATE TABLE IF NOT EXISTS "employee_family_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "birthDate" TIMESTAMP(3),
    "phone" TEXT,
    "address" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "employee_family_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_family_members_employeeId_idx" ON "employee_family_members"("employeeId");
CREATE INDEX IF NOT EXISTS "employee_family_members_companyId_idx" ON "employee_family_members"("companyId");
CREATE INDEX IF NOT EXISTS "employee_family_members_deletedAt_idx" ON "employee_family_members"("deletedAt");

ALTER TABLE "employee_family_members"
  ADD CONSTRAINT "employee_family_members_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_family_members"
  ADD CONSTRAINT "employee_family_members_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
