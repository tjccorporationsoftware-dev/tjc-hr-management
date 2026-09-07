import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { LeaveBalancesController } from './leave-balances.controller';
import { LeaveBalancesService } from './leave-balances.service';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';
import { LeaveCarryForwardController } from './leave-carry-forward.controller';
import { LeaveCarryForwardService } from './services/leave-carry-forward.service';
import { LeaveCatalogController } from './leave-catalog.controller';
import { LeaveCatalogService } from './leave-catalog.service';
import { LeavePoliciesController } from './leave-policies.controller';
import { LeavePoliciesService } from './leave-policies.service';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveAttachmentService } from './services/leave-attachment.service';
import { LeavePolicyResolverService } from './services/leave-policy-resolver.service';
import { LeaveTypeCatalogBootstrapService } from './services/leave-type-catalog-bootstrap.service';
import { LeaveTypesController } from './leave-types.controller';
import { LeaveTypesService } from './leave-types.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceSummaryQueueModule } from '../attendance/attendance-summary-queue.module';
import { SettingsModule } from '../settings/settings.module';

/**
 * LeavesModule
 * -----------------------------------------------------------------------------
 * รวมทุกส่วนของระบบลาไว้ในโมดูลเดียว ได้แก่
 * - Leave Types: ประเภทการลา
 * - Leave Policies: นโยบายวันลา/สิทธิ์ลา
 * - Leave Requests: การยื่นลาและสายอนุมัติ
 * - Leave Balances: ยอดวันลาคงเหลือ/ใช้ไป/รออนุมัติ
 *
 * หมายเหตุ:
 * รอบ refactor นี้ยังคง provider/export เดิมทั้งหมด
 * เพื่อไม่ให้ module อื่น เช่น Approval Center เรียกใช้งานพัง
 */
@Module({
  imports: [
    PrismaModule,
    ApprovalWorkflowModule,
    NotificationsModule,
    AttendanceSummaryQueueModule,
    // ใช้ปฏิทินวันหยุด/วันหยุดประจำสัปดาห์ ตอนนับจำนวนวันลา
    SettingsModule,
  ],
  controllers: [
    LeaveTypesController,
    LeaveCatalogController,
    LeaveCarryForwardController,
    LeavePoliciesController,
    LeaveRequestsController,
    LeaveBalancesController,
  ],
  providers: [
    LeaveTypesService,
    LeaveCatalogService,
    LeavePoliciesService,
    LeaveRequestsService,
    LeaveBalancesService,
    LeaveBalanceLedgerService,
    LeaveAttachmentService,
    LeavePolicyResolverService,
    LeaveCarryForwardService,
    // ซิงก์ประเภทการลามาตรฐาน (ค่าคงที่ของระบบ) ลงฐานข้อมูลตอนบูต
    LeaveTypeCatalogBootstrapService,
  ],
  exports: [
    LeaveTypesService,
    LeaveCatalogService,
    LeavePoliciesService,
    LeaveRequestsService,
    LeaveBalancesService,
    LeaveBalanceLedgerService,
    LeaveAttachmentService,
    LeavePolicyResolverService,
    LeaveCarryForwardService,
  ],
})
export class LeavesModule {}
