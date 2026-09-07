import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { OvertimePoliciesController } from './overtime-policies.controller';
import { OvertimePoliciesService } from './overtime-policies.service';
import { OvertimeRequestsController } from './overtime-requests.controller';
import { OvertimeRequestsService } from './overtime-requests.service';
import { OvertimeApprovalService } from './services/overtime-approval.service';
import { OvertimeDayTypeService } from './services/overtime-day-type.service';
import { OvertimeAttachmentService } from './services/overtime-attachment.service';
import { OvertimePolicyResolverService } from './services/overtime-policy-resolver.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceSummaryQueueModule } from '../attendance/attendance-summary-queue.module';
import { SettingsModule } from '../settings/settings.module';

/*
 * OvertimeModule
 * ---------------------------------------------------------
 * Wires the OT controllers and services together.
 *
 * OvertimeRequestsService remains the public facade used by controllers and
 * Approval Center, while the smaller services below handle policy resolution,
 * approval steps, and attachments.
 */
@Module({
  imports: [
    PrismaModule,
    ApprovalWorkflowModule,
    NotificationsModule,
    AttendanceSummaryQueueModule,
    // ประเภทวันของใบ OT อ่านจากปฏิทินวันหยุดในตั้งค่าระบบ
    SettingsModule,
  ],
  controllers: [OvertimePoliciesController, OvertimeRequestsController],
  providers: [
    OvertimePoliciesService,
    OvertimeRequestsService,
    OvertimeApprovalService,
    OvertimeAttachmentService,
    OvertimePolicyResolverService,
    OvertimeDayTypeService,
  ],
  exports: [
    OvertimePoliciesService,
    OvertimeRequestsService,
    OvertimeApprovalService,
    OvertimeAttachmentService,
    OvertimePolicyResolverService,
    OvertimeDayTypeService,
  ],
})
export class OvertimeModule {}