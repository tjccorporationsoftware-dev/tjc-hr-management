import { Module } from '@nestjs/common';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { OffsiteWorkController } from './offsite-work.controller';
import { OffsiteLocationVerificationService } from './offsite-location-verification.service';
import { OffsiteWorkService } from './offsite-work.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceSummaryQueueModule } from '../attendance/attendance-summary-queue.module';

@Module({
  imports: [ApprovalWorkflowModule, NotificationsModule, AttendanceSummaryQueueModule],
  controllers: [OffsiteWorkController],
  providers: [OffsiteWorkService, OffsiteLocationVerificationService],
  exports: [OffsiteWorkService, OffsiteLocationVerificationService],
})
export class OffsiteWorkModule {}
