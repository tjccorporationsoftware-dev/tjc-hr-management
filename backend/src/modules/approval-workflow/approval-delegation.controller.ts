import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { requireCompanyId } from '../../common/tenant/tenant-scope.util';
import { assertSafePathId } from '../../common/utils/safe-path-id.util';
import {
  CreateApprovalDelegationDto,
  ListApprovalDelegationsQueryDto,
} from './dto/approval-delegation.dto';
import { ApprovalDelegationService } from './services/approval-delegation.service';

/**
 * มอบอำนาจอนุมัติแทน
 *
 *   GET    /approval-delegations
 *   POST   /approval-delegations
 *   DELETE /approval-delegations/:id
 *
 * ใช้ตอนผู้อนุมัติลายาว เพื่อไม่ให้ใบลา/OT ของทั้งทีมค้าง
 * ทุกครั้งที่กดแทน ระบบจะบันทึกไว้ว่ากดแทนใครด้วยใบไหน
 */
@Controller('approval-delegations')
export class ApprovalDelegationController {
  constructor(private readonly service: ApprovalDelegationService) {}

  @Get()
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ApprovalDelegation',
    description: 'ดูรายการมอบอำนาจอนุมัติแทน',
  })
  list(
    @Query() query: ListApprovalDelegationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(
      requireCompanyId(user.scope, query.companyId),
      query.activeOnly === 'true',
    );
  }

  @Get('target-types')
  @Auth('APPROVAL_ACCESS')
  supportedTargetTypes() {
    return this.service.supportedTargetTypes();
  }

  /*
   * สร้างและยกเลิกต้องใช้สิทธิ์จัดการผู้ใช้ ไม่ใช่แค่เข้าถึงกล่องอนุมัติ
   * เพราะการมอบอำนาจคือการส่งต่ออำนาจตัดสินใจให้คนอื่น
   */
  @Post()
  @Auth('USER_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'ApprovalDelegation',
    description: 'สร้างใบมอบอำนาจอนุมัติแทน',
  })
  create(
    @Body() dto: CreateApprovalDelegationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(
      requireCompanyId(user.scope, dto.companyId),
      dto,
      user.id,
    );
  }

  @Delete(':id')
  @Auth('USER_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ApprovalDelegation',
    description: 'ยกเลิกใบมอบอำนาจอนุมัติแทน',
  })
  revoke(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    assertSafePathId(id, 'รหัสใบมอบอำนาจ');

    return this.service.revoke(
      id,
      requireCompanyId(user.scope, companyId),
      user.id,
    );
  }
}
