-- กู้โครงสร้างที่หายไปเพราะ migration กำพร้า
--
-- ฐานข้อมูลที่ใช้งานอยู่มี migration 12 ตัวที่ถูก apply ไปแล้วแต่โฟลเดอร์หายไปจากโปรเจค
-- ผลคือถ้า deploy ขึ้นเครื่องใหม่ด้วย `prisma migrate deploy` จะได้ฐานข้อมูลที่
-- **ขาดคอลัมน์สำคัญของระบบหลายบริษัท** และแอปจะทำงานไม่ได้:
--
--   Role.companyId · EmployeeType.companyId · Position.companyId
--       → ข้อมูลตั้งต้นไม่ถูกแยกตามบริษัท และ unique เดิมเป็นระดับทั้งระบบ
--   holiday_calendars.companyId (+ unique ต่อบริษัท)
--       → เดิม unique ที่ "วันที่" ทั้งระบบ บริษัทที่สองตั้งวันหยุดวันเดียวกันไม่ได้
--   holiday_work_assignments / holiday_swaps / substitute_holiday_credits .companyId
--   employees.allowedAttendanceMethods · attendanceGeofenceRequired (+ enum AttendanceMethod)
--       → ฟีเจอร์ "วิธีลงเวลารายพนักงาน" ทั้งฟีเจอร์
--   payroll_runs.reviewedAt · reviewedById
--       → ขั้นตอนตรวจสอบก่อนอนุมัติงวดเงินเดือน
--
-- ไฟล์นี้สร้างจาก `prisma migrate diff` ระหว่าง "ฐานข้อมูลที่ deploy จาก migration ที่มีอยู่"
-- กับ "สคีมาปัจจุบัน" จึงเป็นส่วนต่างที่หายไปพอดี ไม่มากไม่น้อยกว่านั้น
--
-- หมายเหตุ: ADD COLUMN ... NOT NULL ที่ไม่มีค่าตั้งต้น ใช้ได้กับตารางว่างเท่านั้น
-- ซึ่งเป็นกรณีของการ deploy เครื่องใหม่ ส่วนฐานข้อมูลที่ใช้งานอยู่มีคอลัมน์เหล่านี้แล้ว
-- จึงถูก mark ว่า applied ไปโดยไม่ต้องรัน

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('WEB', 'MOBILE', 'DEVICE');

-- DropIndex
DROP INDEX "EmployeeType_code_idx";

-- DropIndex
DROP INDEX "EmployeeType_code_key";

-- DropIndex
DROP INDEX "Position_code_key";

-- DropIndex
DROP INDEX "Role_code_key";

-- DropIndex
DROP INDEX "holiday_calendars_date_key";

-- AlterTable
ALTER TABLE "EmployeeType" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "allowedAttendanceMethods" "AttendanceMethod"[] DEFAULT ARRAY['WEB', 'MOBILE', 'DEVICE']::"AttendanceMethod"[],
ADD COLUMN     "attendanceGeofenceRequired" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "holiday_calendars" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "holiday_swaps" ADD COLUMN     "companyId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "holiday_work_assignments" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "substitute_holiday_credits" ADD COLUMN     "companyId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeType_companyId_code_key" ON "EmployeeType"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Position_companyId_code_key" ON "Position"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_code_key" ON "Role"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendars_companyId_date_key" ON "holiday_calendars"("companyId", "date");

-- CreateIndex
CREATE INDEX "holiday_swaps_companyId_idx" ON "holiday_swaps"("companyId");

-- CreateIndex
CREATE INDEX "holiday_work_assignments_companyId_idx" ON "holiday_work_assignments"("companyId");

-- CreateIndex
CREATE INDEX "substitute_holiday_credits_companyId_idx" ON "substitute_holiday_credits"("companyId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeType" ADD CONSTRAINT "EmployeeType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_work_assignments" ADD CONSTRAINT "holiday_work_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_swaps" ADD CONSTRAINT "holiday_swaps_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_holiday_credits" ADD CONSTRAINT "substitute_holiday_credits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "leave_policies_companyId_branchId_leaveTypeId_employeeTypeId_id" RENAME TO "leave_policies_companyId_branchId_leaveTypeId_employeeTypeI_idx";

-- RenameIndex
ALTER INDEX "overtime_policies_companyId_branchId_workType_employeeTypeId_id" RENAME TO "overtime_policies_companyId_branchId_workType_employeeTypeI_idx";

