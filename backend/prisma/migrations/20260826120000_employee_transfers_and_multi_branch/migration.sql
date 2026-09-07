-- ใบโยกย้าย/ปรับตำแหน่ง + การมีชื่ออยู่หลายสาขา
--
-- สามตารางนี้แก้ปัญหาคนละข้อแต่มาด้วยกันเพราะเรื่องเดียวกัน:
--   1) employee_branch_assignments — ผู้บริหารหนึ่งคนมีชื่ออยู่ได้หลายสาขา
--      (employees.branchId เก็บได้สาขาเดียว และยังเป็นสาขาหลักที่ใช้คิดเงิน/เวลาเสมอ)
--   2) user_branch_scopes        — บัญชีผู้ใช้ใบเดียวมองเห็นได้หลายสาขา
--      (แทนการแจกบัญชีคนละใบต่อสาขา ซึ่งทำให้ประวัติการใช้งานกระจัดกระจาย)
--   3) employee_transfers        — คำสั่งย้ายที่ตั้งวันมีผลล่วงหน้าได้ แล้วระบบอัปเดต
--      ทะเบียนพนักงานให้เองเมื่อถึงวัน แทนที่ HR ต้องจำแล้วกลับมาแก้เอง

CREATE TYPE "EmployeeTransferStatus" AS ENUM ('SCHEDULED', 'APPLIED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- สาขารองของพนักงาน
-- ---------------------------------------------------------------------------
CREATE TABLE "employee_branch_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    -- บทบาทที่สาขานี้ เช่น "ผู้จัดการเขต" ไว้อธิบายว่าทำไมถึงมีชื่ออยู่
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_branch_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_branch_assignments_employeeId_branchId_key"
    ON "employee_branch_assignments"("employeeId", "branchId");

CREATE INDEX "employee_branch_assignments_branchId_idx"
    ON "employee_branch_assignments"("branchId");

ALTER TABLE "employee_branch_assignments"
    ADD CONSTRAINT "employee_branch_assignments_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_branch_assignments"
    ADD CONSTRAINT "employee_branch_assignments_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_branch_assignments"
    ADD CONSTRAINT "employee_branch_assignments_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- สาขาเพิ่มเติมของบัญชีผู้ใช้
-- ---------------------------------------------------------------------------
CREATE TABLE "user_branch_scopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branch_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_branch_scopes_userId_branchId_key"
    ON "user_branch_scopes"("userId", "branchId");

CREATE INDEX "user_branch_scopes_branchId_idx"
    ON "user_branch_scopes"("branchId");

ALTER TABLE "user_branch_scopes"
    ADD CONSTRAINT "user_branch_scopes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_branch_scopes"
    ADD CONSTRAINT "user_branch_scopes_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ใบโยกย้าย/ปรับตำแหน่ง
-- ---------------------------------------------------------------------------
CREATE TABLE "employee_transfers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "EmployeeTransferStatus" NOT NULL DEFAULT 'SCHEDULED',
    -- ชนิดของการเปลี่ยนแปลงหลัก ใช้เป็นชนิดของประวัติการทำงานที่สร้างตอนมีผล
    "type" "WorkHistoryType" NOT NULL DEFAULT 'OTHER',
    -- วันแรกที่ให้ถือว่าอยู่สังกัดใหม่ (เทียบแบบทั้งวันตามเวลาไทย)
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    -- เลขที่คำสั่ง/บันทึกข้อความ ไว้อ้างอิงกับเอกสารตัวจริง
    "documentNo" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "fromBranchId" TEXT,
    "toBranchId" TEXT,
    "fromDepartmentId" TEXT,
    "toDepartmentId" TEXT,
    "fromDivisionId" TEXT,
    "toDivisionId" TEXT,
    "fromPositionId" TEXT,
    "toPositionId" TEXT,
    -- ชื่อตำแหน่งแบบข้อความ สำหรับบริษัทที่ยังไม่ได้ผูกตำแหน่งกับทะเบียนตำแหน่ง
    "fromPositionTitle" TEXT,
    "toPositionTitle" TEXT,
    "fromEmployeeTypeId" TEXT,
    "toEmployeeTypeId" TEXT,
    "fromSupervisorId" TEXT,
    "toSupervisorId" TEXT,
    -- true = ย้ายสาขาหลักแล้วยังให้มีชื่อค้างที่สาขาเดิมด้วย
    "keepPreviousBranch" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "workHistoryId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_transfers_workHistoryId_key"
    ON "employee_transfers"("workHistoryId");

CREATE INDEX "employee_transfers_companyId_status_effectiveDate_idx"
    ON "employee_transfers"("companyId", "status", "effectiveDate");

CREATE INDEX "employee_transfers_employeeId_effectiveDate_idx"
    ON "employee_transfers"("employeeId", "effectiveDate");

CREATE INDEX "employee_transfers_status_effectiveDate_idx"
    ON "employee_transfers"("status", "effectiveDate");

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_fromBranchId_fkey"
    FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_toBranchId_fkey"
    FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_fromDepartmentId_fkey"
    FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_toDepartmentId_fkey"
    FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_fromDivisionId_fkey"
    FOREIGN KEY ("fromDivisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_toDivisionId_fkey"
    FOREIGN KEY ("toDivisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_fromPositionId_fkey"
    FOREIGN KEY ("fromPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_toPositionId_fkey"
    FOREIGN KEY ("toPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_fromEmployeeTypeId_fkey"
    FOREIGN KEY ("fromEmployeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_toEmployeeTypeId_fkey"
    FOREIGN KEY ("toEmployeeTypeId") REFERENCES "EmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_fromSupervisorId_fkey"
    FOREIGN KEY ("fromSupervisorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_transfers"
    ADD CONSTRAINT "employee_transfers_toSupervisorId_fkey"
    FOREIGN KEY ("toSupervisorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
