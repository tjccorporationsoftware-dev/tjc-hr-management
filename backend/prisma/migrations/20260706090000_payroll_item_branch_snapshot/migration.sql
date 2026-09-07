-- Add organization snapshot fields to payroll_items so one company-level Payroll Run
-- can still be summarized and opened by branch/department historically.
ALTER TABLE "payroll_items"
  ADD COLUMN "branchId" TEXT,
  ADD COLUMN "branchCode" TEXT,
  ADD COLUMN "branchName" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "departmentCode" TEXT,
  ADD COLUMN "departmentName" TEXT;

-- Best-effort backfill for existing calculated payroll items from current employee master data.
-- New calculations will write the exact snapshot at calculation time from PayrollService.
UPDATE "payroll_items" pi
SET
  "branchId" = e."branchId",
  "branchCode" = b."code",
  "branchName" = b."nameTh",
  "departmentId" = e."departmentId",
  "departmentCode" = d."code",
  "departmentName" = d."nameTh"
FROM "employees" e
LEFT JOIN "Branch" b ON b."id" = e."branchId"
LEFT JOIN "Department" d ON d."id" = e."departmentId"
WHERE pi."employeeId" = e."id";

CREATE INDEX "payroll_items_branchId_idx" ON "payroll_items"("branchId");
CREATE INDEX "payroll_items_departmentId_idx" ON "payroll_items"("departmentId");
