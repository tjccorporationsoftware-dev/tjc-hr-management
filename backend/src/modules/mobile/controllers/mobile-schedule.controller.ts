import { Controller, Get, Query } from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { MobileScheduleOrchestrator } from '../application/mobile-schedule.orchestrator';
import { MobileScheduleQueryDto } from '../dto/mobile-schedule.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';

/**
 * ตารางงานและปฏิทินของพนักงาน
 *
 * เป็น aggregate read-only สำหรับมือถือเท่านั้น ไม่เปลี่ยน contract ของ /ess/schedule
 * และ identity มาจาก token เสมอ — ไม่มี employeeId/companyId จาก client
 */
@Controller(`${MOBILE_API_PREFIX}/schedule`)
export class MobileScheduleController {
  constructor(private readonly schedule: MobileScheduleOrchestrator) {}

  @Get()
  @Auth('ESS_ACCESS')
  getMySchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileScheduleQueryDto,
  ) {
    return this.schedule.getMySchedule(user, query);
  }
}
