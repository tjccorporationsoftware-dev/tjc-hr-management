import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { AttendanceSummaryQueueModule } from '../attendance/attendance-summary-queue.module';
import { TimeAdjustRequestsController } from './time-adjust-requests.controller';
import { TimeAdjustRequestsService } from './time-adjust-requests.service';
import { TimeAdjustApprovalService } from './services/time-adjust-approval.service';
import { TimeAdjustAttachmentService } from './services/time-adjust-attachment.service';
import { TimeAdjustAttendanceApplyService } from './services/time-adjust-attendance-apply.service';
import { NotificationsModule } from '../notifications/notifications.module';

/*
 * TimeAdjustModule
 * ---------------------------------------------------------
 * โมดูลคำขอแก้เวลา
 *
 * หลัง refactor รอบนี้ TimeAdjustRequestsService ยังเป็น service หลักที่
 * controller เรียกเหมือนเดิม เพื่อไม่ให้ route/frontend เดิมพัง
 *
 * แต่ logic เฉพาะทางถูกแยกออกเป็น service ย่อย:
 * - TimeAdjustApprovalService: จัดการ Approval Matrix / Approval Step
 * - TimeAdjustAttachmentService: จัดการไฟล์แนบ
 * - TimeAdjustAttendanceApplyService: apply ผลอนุมัติไปที่ AttendanceLog จริง
 */
@Module({
  imports: [PrismaModule, ApprovalWorkflowModule, AttendanceSummaryQueueModule, NotificationsModule],
  controllers: [TimeAdjustRequestsController],
  providers: [
    TimeAdjustRequestsService,
    TimeAdjustApprovalService,
    TimeAdjustAttachmentService,
    TimeAdjustAttendanceApplyService,
  ],
  exports: [
    TimeAdjustRequestsService,
    TimeAdjustApprovalService,
    TimeAdjustAttachmentService,
    TimeAdjustAttendanceApplyService,
  ],
})
export class TimeAdjustModule {}
