import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateOvertimePolicyDto } from './dto/create-overtime-policy.dto';
import { ListOvertimePoliciesQueryDto } from './dto/list-overtime-policies-query.dto';
import {
  GetOvertimeMatrixQueryDto,
  SaveOvertimeMatrixDto,
  SetOvertimeMatrixStatusDto,
} from './dto/overtime-policy-matrix.dto';
import { UpdateOvertimePolicyDto } from './dto/update-overtime-policy.dto';
import { OvertimePoliciesService } from './overtime-policies.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

@Auth()
@Controller('overtime/policies')
export class OvertimePoliciesController {
  constructor(
    private readonly overtimePoliciesService: OvertimePoliciesService,
  ) {}

  @Get()
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimePolicy',
    description: 'ดูรายการนโยบาย OT',
  })
  findAll(
    @Query() query: ListOvertimePoliciesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimePoliciesService.findAll(query, currentUser.scope);
  }

  @Get('summary')
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimePolicy',
    description: 'ดูสรุปนโยบาย OT',
  })
  findSummary(
    @Query() query: ListOvertimePoliciesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimePoliciesService.findSummary(query, currentUser.scope);
  }

  /* ประกาศก่อน :id เสมอ ไม่งั้น "matrix" จะถูกจับเป็น id */
  @Get('matrix')
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimePolicy',
    description: 'ดูนโยบาย OT แยกตามประเภทพนักงาน',
  })
  getMatrix(
    @Query() query: GetOvertimeMatrixQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimePoliciesService.getMatrix(query, currentUser.scope);
  }

  @Put('matrix')
  @RequirePermissions('OT_SETTING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimePolicy',
    description: 'บันทึกนโยบาย OT แยกตามประเภทพนักงาน',
  })
  saveMatrix(
    @Body() dto: SaveOvertimeMatrixDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimePoliciesService.saveMatrix(dto, currentUser.scope);
  }

  @Put('matrix/status')
  @RequirePermissions('OT_SETTING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimePolicy',
    description: 'เปิด/ปิดประเภทวัน OT',
  })
  setMatrixStatus(
    @Body() dto: SetOvertimeMatrixStatusDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimePoliciesService.setMatrixStatus(dto, currentUser.scope);
  }

  @Get(':id')
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimePolicy',
    description: 'ดูรายละเอียดนโยบาย OT',
  })
  findOne(@Param('id') id: string) {
    return this.overtimePoliciesService.findOne(id);
  }

  @Post()
  @RequirePermissions('OT_SETTING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OvertimePolicy',
    description: 'เพิ่มนโยบาย OT',
  })
  create(
    @Body() dto: CreateOvertimePolicyDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimePoliciesService.create(dto, currentUser.scope);
  }

  @Patch(':id')
  @RequirePermissions('OT_SETTING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimePolicy',
    description: 'แก้ไขนโยบาย OT',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOvertimePolicyDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimePoliciesService.update(id, dto, currentUser.scope);
  }

  @Delete(':id')
  @RequirePermissions('OT_SETTING_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OvertimePolicy',
    description: 'ปิดใช้งานนโยบาย OT',
  })
  remove(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.overtimePoliciesService.remove(id, currentUser.scope);
  }
}
