import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';

import {
  bindInProcessProcessor,
  registerQueue,
} from '../../common/queue/queue.module';

import { PrismaModule } from '../../database/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DocumentWorkflowModule } from '../document-workflow/document-workflow.module';
import { EssModule } from '../ess/ess.module';
import { LeavesModule } from '../leaves/leaves.module';
import { ManagerModule } from '../manager/manager.module';
import { ManpowerModule } from '../manpower/manpower.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OffsiteWorkModule } from '../offsite-work/offsite-work.module';
import { OrganizationModule } from '../organization/organization.module';
import { OvertimeModule } from '../overtime/overtime.module';
import { ProfileModule } from '../profile/profile.module';
import { ReportsModule } from '../reports/reports.module';
import { SettingsModule } from '../settings/settings.module';
import { TimeAdjustModule } from '../time-adjust/time-adjust.module';

import { MobileAttendanceService } from './application/mobile-attendance.service';
import { MobileAuthAdapter } from './application/mobile-auth.adapter';
import { MobileBootstrapOrchestrator } from './application/mobile-bootstrap.orchestrator';
import { MobileCompatibilityService } from './application/mobile-compatibility.service';
import { MobileDeviceService } from './application/mobile-device.service';
import { MobileComplaintsOrchestrator } from './application/mobile-complaints.orchestrator';
import { MobileDocumentsOrchestrator } from './application/mobile-documents.orchestrator';
import { MobileExecutiveOrchestrator } from './application/mobile-executive.orchestrator';
import { MobileFeatureFlagService } from './application/mobile-feature-flag.service';
import { MobileIdempotencyService } from './application/mobile-idempotency.service';
import { MobileMaintenanceProcessor } from './application/mobile-maintenance.processor';
import { MobileMaintenanceService } from './application/mobile-maintenance.service';
import { MobilePushPreferenceService } from './application/mobile-push-preference.service';
import { MobilePushService } from './application/mobile-push.service';
import { MobileProfileOrchestrator } from './application/mobile-profile.orchestrator';
import { MobileRequestsOrchestrator } from './application/mobile-requests.orchestrator';
import { MobileScheduleOrchestrator } from './application/mobile-schedule.orchestrator';
import { MobileTeamOrchestrator } from './application/mobile-team.orchestrator';
import { MobileTelemetryService } from './application/mobile-telemetry.service';
import { MobileTodayOrchestrator } from './application/mobile-today.orchestrator';
import { MobileAttendanceController } from './controllers/mobile-attendance.controller';
import { MobileAuthController } from './controllers/mobile-auth.controller';
import { MobileBootstrapController } from './controllers/mobile-bootstrap.controller';
import { MobileComplaintsController } from './controllers/mobile-complaints.controller';
import { MobileDevicesController } from './controllers/mobile-devices.controller';
import { MobileDocumentsController } from './controllers/mobile-documents.controller';
import { MobileApprovalsController } from './controllers/mobile-approvals.controller';
import { MobileExecutiveController } from './controllers/mobile-executive.controller';
import { MobileNotificationsController } from './controllers/mobile-notifications.controller';
import { MobilePayrollController } from './controllers/mobile-payroll.controller';
import { MobileProfileController } from './controllers/mobile-profile.controller';
import { MobileRequestAttachmentsController } from './controllers/mobile-request-attachments.controller';
import { MobileScheduleController } from './controllers/mobile-schedule.controller';
import { MobileRequestsController } from './controllers/mobile-requests.controller';
import { MobileTeamController } from './controllers/mobile-team.controller';
import { MobileTelemetryController } from './controllers/mobile-telemetry.controller';
import { MobileClientGuard } from './guards/mobile-client.guard';
import { MOBILE_MAINTENANCE_QUEUE } from './mobile.constants';

/**
 * MobileModule — Native API façade ภายใน backend เดิม (ADR-001)
 *
 * กติกาที่ห้ามละเมิด:
 *   - ไม่มีสูตรคำนวณธุรกิจในโมดูลนี้
 *   - ไม่ query Prisma เข้าถึงข้อมูลธุรกิจโดยตรง (ยกเว้นตาราง mobile_* ที่เป็นของตัวเอง)
 *   - ไม่แก้ response contract ของเว็บ
 *   - ไม่เชื่อ employeeId/companyId/branchId ที่ client ส่งมา
 *
 * ทุก endpoint มีคู่ mapping อยู่ใน docs/mobile/API_MAPPING_MATRIX.md
 */
@Module({
  imports: [
    PrismaModule,
    ApprovalsModule,
    AttendanceModule,
    DashboardModule,
    DocumentWorkflowModule,
    EssModule,
    LeavesModule,
    ManagerModule,
    ManpowerModule,
    NotificationsModule,
    OffsiteWorkModule,
    OrganizationModule,
    OvertimeModule,
    ProfileModule,
    ReportsModule,
    SettingsModule,
    TimeAdjustModule,
    registerQueue(MOBILE_MAINTENANCE_QUEUE),
  ],
  controllers: [
    MobileAuthController,
    MobileBootstrapController,
    MobileApprovalsController,
    MobileAttendanceController,
    MobileComplaintsController,
    MobileDevicesController,
    MobileDocumentsController,
    MobileExecutiveController,
    MobileNotificationsController,
    MobilePayrollController,
    MobileProfileController,
    MobileRequestAttachmentsController,
    MobileRequestsController,
    MobileScheduleController,
    MobileTeamController,
    MobileTelemetryController,
  ],
  providers: [
    MobileAttendanceService,
    MobileAuthAdapter,
    MobileBootstrapOrchestrator,
    MobileClientGuard,
    MobileCompatibilityService,
    MobileDeviceService,
    MobileComplaintsOrchestrator,
    MobileDocumentsOrchestrator,
    MobileExecutiveOrchestrator,
    MobileFeatureFlagService,
    MobileIdempotencyService,
    MobileMaintenanceProcessor,
    MobileMaintenanceService,
    MobilePushPreferenceService,
    MobilePushService,
    MobileProfileOrchestrator,
    MobileRequestsOrchestrator,
    MobileScheduleOrchestrator,
    MobileTeamOrchestrator,
    MobileTelemetryService,
    MobileTodayOrchestrator,
  ],
})
export class MobileModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(MobileModule.name);

  constructor(private readonly processor: MobileMaintenanceProcessor) {}

  /**
   * ต่อ processor เข้ากับคิว เมื่อระบบใช้คิวในโปรเซส
   * ตอนใช้ Redis, @nestjs/bullmq สร้าง Worker ให้เองจาก `@Processor()` อยู่แล้ว
   * ตัวช่วยจึงคืน false แล้วไม่ทำอะไร
   */
  onApplicationBootstrap() {
    bindInProcessProcessor(
      MOBILE_MAINTENANCE_QUEUE,
      this.processor,
      this.logger,
    );
  }
}
