import { Module } from '@nestjs/common';

import { registerQueue } from '../../common/queue/queue.module';

import { AuditModule } from '../audit/audit.module';
import { ATTENDANCE_SUMMARY_QUEUE } from './attendance-summary-queue.constants';
import { AttendanceSummaryQueueService } from './attendance-summary-queue.service';
import { AttendanceRecalculationTriggerService } from './attendance-recalculation-trigger.service';
import { AttendanceRecalculationScopeService } from './attendance-recalculation-scope.service';
import { AttendanceRecalculationRecoveryService } from './attendance-recalculation-recovery.service';

/**
 * Shared queue module for attendance summary recalculation.
 *
 * Kept separate from AttendanceModule so source modules such as Leave, OT,
 * Offsite and Time Adjust can enqueue recalculation jobs without importing the
 * full AttendanceModule and creating circular module dependencies.
 */
@Module({
  imports: [
    AuditModule,
    registerQueue(ATTENDANCE_SUMMARY_QUEUE),
  ],
  providers: [
    AttendanceSummaryQueueService,
    AttendanceRecalculationRecoveryService,
    AttendanceRecalculationTriggerService,
    AttendanceRecalculationScopeService,
  ],
  exports: [
    AttendanceSummaryQueueService,
    AttendanceRecalculationRecoveryService,
    AttendanceRecalculationTriggerService,
    AttendanceRecalculationScopeService,
  ],
})
export class AttendanceSummaryQueueModule {}
