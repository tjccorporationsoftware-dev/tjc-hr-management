-- AlterEnum
ALTER TYPE "AttendanceEditAction" ADD VALUE 'UPDATE_STATUS';

-- AlterTable
ALTER TABLE "attendance_edit_logs" ADD COLUMN     "timeAdjustRequestId" TEXT;

-- CreateIndex
CREATE INDEX "attendance_edit_logs_timeAdjustRequestId_idx" ON "attendance_edit_logs"("timeAdjustRequestId");

-- AddForeignKey
ALTER TABLE "attendance_edit_logs" ADD CONSTRAINT "attendance_edit_logs_timeAdjustRequestId_fkey" FOREIGN KEY ("timeAdjustRequestId") REFERENCES "time_adjust_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
