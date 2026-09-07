import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module';
import { CompanyPayrollSettingsController } from './company-payroll-settings.controller';
import { CompanyPayrollSettingsService } from './company-payroll-settings.service';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { AttendanceSummaryQueueModule } from '../attendance/attendance-summary-queue.module';

@Module({
  imports: [PrismaModule, AttendanceSummaryQueueModule],
  controllers: [SystemSettingsController, CompanyPayrollSettingsController],
  providers: [SystemSettingsService, CompanyPayrollSettingsService],
  exports: [SystemSettingsService, CompanyPayrollSettingsService],
})
export class SettingsModule {}
