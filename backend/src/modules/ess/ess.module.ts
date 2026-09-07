import { PayrollModule } from '../payroll/payroll.module';
import { Module } from '@nestjs/common';

import { LeavesModule } from '../leaves/leaves.module';
import { OvertimeModule } from '../overtime/overtime.module';
import { TimeAdjustModule } from '../time-adjust/time-adjust.module';
import { SettingsModule } from '../settings/settings.module';

import { EssController } from './ess.controller';
import { EssService } from './ess.service';

import { EssSalarySlipController } from './ess-salary-slip.controller';
import { EssSalarySlipService } from './ess-salary-slip.service';

import { EssScheduleController } from './ess-schedule.controller';
import { EssScheduleService } from './ess-schedule.service';

@Module({
  imports: [LeavesModule, OvertimeModule, TimeAdjustModule, SettingsModule, PayrollModule],
  controllers: [
    EssController,
    EssSalarySlipController,
    EssScheduleController,
  ],
  providers: [EssService, EssSalarySlipService, EssScheduleService],
  // MobileModule เรียกใช้ต่อผ่าน Bootstrap/Today orchestrator (ADR-001: reuse ไม่เขียนใหม่)
  exports: [EssService, EssSalarySlipService, EssScheduleService],
})
export class EssModule {}