import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

import { CancelEmployeeTransferDto } from './dto/cancel-employee-transfer.dto';
import { CreateEmployeeTransferDto } from './dto/create-employee-transfer.dto';
import { ListEmployeeTransfersQueryDto } from './dto/list-employee-transfers-query.dto';
import { EmployeeTransfersService } from './employee-transfers.service';

type CurrentUserPayload = Pick<AuthenticatedUser, 'id' | 'scope'>;

@Controller('employee-transfers')
@Auth()
export class EmployeeTransfersController {
  constructor(private readonly service: EmployeeTransfersService) {}

  @Get()
  @RequirePermissions('EMPLOYEE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeTransfer',
    description: 'ดูรายการโยกย้าย/ปรับตำแหน่ง',
  })
  async findAll(
    @Query() query: ListEmployeeTransfersQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.service.findAll(query, currentUser);
  }

  @Get(':id')
  @RequirePermissions('EMPLOYEE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeTransfer',
    description: 'ดูใบโยกย้าย',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.service.findOne(id, currentUser);
  }

  /*
   * ใช้ EMPLOYEE_UPDATE เพราะผลของใบนี้คือการแก้ทะเบียนพนักงานจริง ๆ
   * ถ้าให้สิทธิ์ต่างจากการแก้ทะเบียน คนที่แก้ทะเบียนตรง ๆ ไม่ได้จะเลี่ยงมาทางนี้แทน
   */
  @Post()
  @RequirePermissions('EMPLOYEE_UPDATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EmployeeTransfer',
    description: 'สร้างใบโยกย้าย/ปรับตำแหน่ง',
  })
  async create(
    @Body() dto: CreateEmployeeTransferDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.service.create(dto, currentUser);
  }

  @Patch(':id/cancel')
  @RequirePermissions('EMPLOYEE_UPDATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeTransfer',
    description: 'ยกเลิกใบโยกย้าย',
  })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelEmployeeTransferDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.service.cancel(id, dto, currentUser);
  }

  @Patch(':id/apply')
  @RequirePermissions('EMPLOYEE_UPDATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeTransfer',
    description: 'สั่งให้ใบโยกย้ายมีผลทันที',
  })
  async applyNow(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.service.applyNow(id, currentUser);
  }
}
