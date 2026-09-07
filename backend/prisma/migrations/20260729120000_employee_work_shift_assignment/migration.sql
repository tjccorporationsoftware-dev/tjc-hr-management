-- ผูกพนักงานเข้ากะการทำงานรายคน
-- เดิมพนักงานได้กะจากการจับคู่ สาขา/ประเภทพนักงาน อัตโนมัติเท่านั้น
-- ทำให้คนที่อยู่สาขาเดียวกันแต่คนละกะ (เช่น รปภ.กะดึก กับ ออฟฟิศ 8 โมง) แยกกันไม่ได้
--
-- ลำดับการหากะหลังจากนี้: ผูกรายคน -> กะเริ่มต้นของสาขา -> กะเริ่มต้นของบริษัท
-- ตารางนี้ว่างตอนสร้าง ทุกคนจึงยังใช้กะเดิมเป๊ะจนกว่าจะเริ่มผูกรายคน

CREATE TABLE IF NOT EXISTS "employee_work_shifts" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "note" TEXT,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "employee_work_shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_work_shifts_employeeId_idx"
  ON "employee_work_shifts" ("employeeId");
CREATE INDEX IF NOT EXISTS "employee_work_shifts_policyId_idx"
  ON "employee_work_shifts" ("policyId");
CREATE INDEX IF NOT EXISTS "employee_work_shifts_effectiveFrom_idx"
  ON "employee_work_shifts" ("effectiveFrom");
CREATE INDEX IF NOT EXISTS "employee_work_shifts_effectiveTo_idx"
  ON "employee_work_shifts" ("effectiveTo");
CREATE INDEX IF NOT EXISTS "employee_work_shifts_status_idx"
  ON "employee_work_shifts" ("status");
CREATE INDEX IF NOT EXISTS "employee_work_shifts_deletedAt_idx"
  ON "employee_work_shifts" ("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_work_shifts_employeeId_fkey'
  ) THEN
    ALTER TABLE "employee_work_shifts"
      ADD CONSTRAINT "employee_work_shifts_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_work_shifts_policyId_fkey'
  ) THEN
    ALTER TABLE "employee_work_shifts"
      ADD CONSTRAINT "employee_work_shifts_policyId_fkey"
      FOREIGN KEY ("policyId") REFERENCES "attendance_policies" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
