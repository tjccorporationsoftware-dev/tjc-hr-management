-- ---------------------------------------------------------------------------
-- ผู้อนุมัติแทน เมื่อผู้อนุมัติหลักกลายเป็นคนยื่นเอง
--
-- เดิมสายอนุมัติระบุได้อย่างเดียวว่า "ใครอนุมัติ" ตัวหาผู้อนุมัติไม่เคยกันว่า
-- คนที่หาได้ต้องไม่ใช่คนยื่น พอหัวหน้าแผนก (หรือ HR) ยื่นใบของตัวเอง ระบบจะผูก
-- ผู้อนุมัติเป็นตัวเขาเอง แล้วตัวกันอนุมัติงานตัวเองบล็อก = ใบค้างถาวร
--
-- คอลัมน์ชุดนี้ให้ตั้งไว้ล่วงหน้าได้ว่า ถ้าเกิดกรณีนั้นให้ใครอนุมัติแทน
-- ทุกคอลัมน์เป็น nullable สายอนุมัติเดิมจึงใช้งานต่อได้โดยไม่ต้องแก้อะไร
-- ---------------------------------------------------------------------------

ALTER TABLE "approval_matrix_steps"
  ADD COLUMN "fallbackApproverType" "ApprovalStepApproverType",
  ADD COLUMN "fallbackPositionId" TEXT,
  ADD COLUMN "fallbackEmployeeId" TEXT,
  ADD COLUMN "fallbackRoleCode" TEXT;

CREATE INDEX "approval_matrix_steps_fallbackPositionId_idx"
  ON "approval_matrix_steps"("fallbackPositionId");

CREATE INDEX "approval_matrix_steps_fallbackEmployeeId_idx"
  ON "approval_matrix_steps"("fallbackEmployeeId");

ALTER TABLE "approval_matrix_steps"
  ADD CONSTRAINT "approval_matrix_steps_fallbackPositionId_fkey"
  FOREIGN KEY ("fallbackPositionId") REFERENCES "Position"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_matrix_steps"
  ADD CONSTRAINT "approval_matrix_steps_fallbackEmployeeId_fkey"
  FOREIGN KEY ("fallbackEmployeeId") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
