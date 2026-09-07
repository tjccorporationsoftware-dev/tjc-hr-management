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
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { ListLeaveTypesQueryDto } from './dto/list-leave-types-query.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveTypesService } from './leave-types.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

@Auth()
@Controller('leaves/types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  @Get()
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveType',
    description: 'ดูรายการประเภทการลา',
  })
  findAll(
    @Query() query: ListLeaveTypesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveTypesService.findAll(query, currentUser.scope);
  }


  @Get('requestable')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveType',
    description: 'ดูประเภทการลาที่พนักงานใช้ยื่นคำขอได้',
  })
  findRequestable(
    @Query() query: ListLeaveTypesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveTypesService.findAll(
      {
        ...query,
        status: 'ACTIVE',
      },
      currentUser.scope,
    );
  }

  @Get('summary')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveType',
    description: 'ดูสรุปประเภทการลา',
  })
  findSummary(
    @Query() query: ListLeaveTypesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveTypesService.findSummary(query, currentUser.scope);
  }

  @Get(':id')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveType',
    description: 'ดูรายละเอียดประเภทการลา',
  })
  findOne(@Param('id') id: string) {
    return this.leaveTypesService.findOne(id);
  }

  @Post()
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'LeaveType',
    description: 'เพิ่มประเภทการลา',
  })
  create(
    @Body() dto: CreateLeaveTypeDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveTypesService.create(dto, currentUser.scope);
  }

  @Patch(':id')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveType',
    description: 'แก้ไขประเภทการลา',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveTypesService.update(id, dto, currentUser.scope);
  }

  @Delete(':id')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'LeaveType',
    description: 'ปิดใช้งานประเภทการลา',
  })
  remove(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.leaveTypesService.remove(id, currentUser.scope);
  }
}