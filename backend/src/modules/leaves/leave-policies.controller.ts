import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateLeavePolicyDto } from './dto/create-leave-policy.dto';
import { ListLeavePoliciesQueryDto } from './dto/list-leave-policies-query.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';
import { LeavePoliciesService } from './leave-policies.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

@Auth()
@Controller('leaves/policies')
export class LeavePoliciesController {
  constructor(private readonly leavePoliciesService: LeavePoliciesService) {}

  @Get()
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeavePolicy',
    description: 'ดูรายการนโยบายวันลา',
  })
  findAll(
    @Query() query: ListLeavePoliciesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leavePoliciesService.findAll(query, currentUser.scope);
  }

  @Get('summary')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeavePolicy',
    description: 'ดูสรุปนโยบายวันลา',
  })
  findSummary(
    @Query() query: ListLeavePoliciesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leavePoliciesService.findSummary(query, currentUser.scope);
  }

  @Get(':id')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeavePolicy',
    description: 'ดูรายละเอียดนโยบายวันลา',
  })
  findOne(@Param('id') id: string) {
    return this.leavePoliciesService.findOne(id);
  }

  @Post()
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'LeavePolicy',
    description: 'เพิ่มนโยบายวันลา',
  })
  create(
    @Body() dto: CreateLeavePolicyDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leavePoliciesService.create(dto, currentUser.scope);
  }

  @Patch(':id')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeavePolicy',
    description: 'แก้ไขนโยบายวันลา',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeavePolicyDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leavePoliciesService.update(id, dto, currentUser.scope);
  }

  @Delete(':id')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'LeavePolicy',
    description: 'ปิดใช้งานนโยบายวันลา',
  })
  remove(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.leavePoliciesService.remove(id, currentUser.scope);
  }
}