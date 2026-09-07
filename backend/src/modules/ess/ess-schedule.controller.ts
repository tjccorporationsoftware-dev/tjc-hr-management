import { Controller, Get, Query } from '@nestjs/common';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

import { EssScheduleService } from './ess-schedule.service';
import { EssScheduleQueryDto } from './dto/ess-schedule-query.dto';

type CurrentUserPayload = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

@Controller('ess/schedule')
@Auth()
@RequirePermissions('ESS_ACCESS')
export class EssScheduleController {
  constructor(private readonly scheduleService: EssScheduleService) {}

  @Get()
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSSchedule',
    description: 'พนักงานดูตารางงานของตนเอง',
  })
  getMySchedule(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: EssScheduleQueryDto,
  ) {
    return this.scheduleService.getMySchedule(currentUser, query);
  }
}