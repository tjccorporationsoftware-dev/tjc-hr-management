import { Controller, Get, Query } from '@nestjs/common';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

import { ManpowerService } from './manpower.service';
import { ManpowerQueryDto } from './dto/manpower-query.dto';

type CurrentUserPayload = Pick<AuthenticatedUser, 'scope'>;

@Controller('manpower')
@Auth()
export class ManpowerController {
  constructor(private readonly manpowerService: ManpowerService) {}

  @Get('overview')
  @RequirePermissions('MANPOWER_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Manpower',
    description: 'ดูภาพรวมผังกำลังพล',
  })
  async getOverview(
    @Query() query: ManpowerQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.manpowerService.getOverview(query, currentUser.scope);
  }

  @Get('by-department')
  @RequirePermissions('MANPOWER_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Manpower',
    description: 'ดูผังกำลังพลแยกตามแผนก',
  })
  async getByDepartment(
    @Query() query: ManpowerQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.manpowerService.getByDepartment(query, currentUser.scope);
  }

  @Get('by-branch')
  @RequirePermissions('MANPOWER_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Manpower',
    description: 'ดูผังกำลังพลแยกตามสาขา',
  })
  async getByBranch(
    @Query() query: ManpowerQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.manpowerService.getByBranch(query, currentUser.scope);
  }

  @Get('by-position')
  @RequirePermissions('MANPOWER_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Manpower',
    description: 'ดูผังกำลังพลแยกตามตำแหน่ง',
  })
  async getByPosition(
    @Query() query: ManpowerQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.manpowerService.getByPosition(query, currentUser.scope);
  }

  @Get('by-status')
  @RequirePermissions('MANPOWER_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Manpower',
    description: 'ดูผังกำลังพลแยกตามสถานะพนักงาน',
  })
  async getByStatus(
    @Query() query: ManpowerQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.manpowerService.getByStatus(query, currentUser.scope);
  }
}