import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';

import {
  bindInProcessProcessor,
} from '../../common/queue/queue.module';
import { ATTENDANCE_SUMMARY_QUEUE } from './attendance-summary-queue.constants';

import { AttendanceController } from './attendance.controller';
import { DevicePushController } from './device-push.controller';
import { AttendanceService } from './attendance.service';
import { AttendancePolicyResolverService } from './attendance-policy-resolver.service';
import { AttendanceSessionRuleService } from './attendance-session-rule.service';
import { AttendanceCalculationEngineService } from './attendance-calculation-engine.service';
import { AttendanceSummaryProcessor } from './attendance-summary.processor';
import { AttendanceProgressService } from './attendance-progress.service';
import { AttendanceImportService } from './attendance-import.service';
import { AttendanceNudgeService } from './attendance-nudge.service';
import { OffsiteWorkModule } from '../offsite-work/offsite-work.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceSummaryQueueModule } from './attendance-summary-queue.module';
import { DevicePushGuard } from '../../common/guards/device-push.guard';

@Module({
  imports: [
    OffsiteWorkModule,
    SettingsModule,
    AuditModule,
    AttendanceSummaryQueueModule,
    /* งานเตือนลงเวลาของมือถือยิงผ่าน NotificationsService — ทางเดียว ไม่วน */
    NotificationsModule,
  ],
  controllers: [AttendanceController, DevicePushController],
  providers: [
    AttendanceService,
    AttendancePolicyResolverService,
    AttendanceSessionRuleService,
    AttendanceCalculationEngineService,
    AttendanceSummaryProcessor,
    AttendanceProgressService,
    AttendanceImportService,
    AttendanceNudgeService,
    DevicePushGuard,
  ],
  exports: [
    AttendanceService,
    AttendancePolicyResolverService,
    AttendanceSessionRuleService,
    AttendanceCalculationEngineService,
    AttendanceProgressService,
    AttendanceImportService,
  ],
})
export class AttendanceModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttendanceModule.name);

  constructor(private readonly processor: AttendanceSummaryProcessor) {}

  /**
   * ต่อ processor คำนวณเวลาเข้ากับคิว เมื่อระบบใช้คิวในโปรเซส
   *
   * ถ้าไม่ต่อ งานจะเข้าคิวได้ตามปกติแต่ไม่มีใครหยิบไปทำ — ยอดเวลาไม่ขยับ
   * โดยไม่มีอะไรผิดพลาดให้เห็น เป็นอาการที่ตรวจจับยากที่สุดของระบบนี้
   */
  onApplicationBootstrap() {
    bindInProcessProcessor(
      ATTENDANCE_SUMMARY_QUEUE,
      this.processor,
      this.logger,
    );
  }
}
