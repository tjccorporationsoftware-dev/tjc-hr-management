import { Body, Controller, Post } from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { requireCompanyId } from '../../common/tenant/tenant-scope.util';
import {
  RunLeaveCarryForwardDto,
  RunLeaveCarryForwardExpiryDto,
} from './dto/leave-carry-forward.dto';
import { LeaveCarryForwardService } from './services/leave-carry-forward.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope' | 'id'>;

/**
 * งานปลายปีของระบบลา — สะสมวันลาข้ามปี และตัดวันสะสมที่หมดอายุ
 * ทั้งสอง endpoint รันซ้ำได้ และมี dryRun ให้ดูผลก่อนลงจริง
 */
@Auth()
@Controller('leaves/carry-forward')
export class LeaveCarryForwardController {
  constructor(private readonly carryForwardService: LeaveCarryForwardService) {}

  @Post('run')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveBalance',
    description: 'สะสมวันลาคงเหลือข้ามปี',
  })
  run(
    @Body() dto: RunLeaveCarryForwardDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    const companyId = requireCompanyId(currentUser.scope, dto.companyId);

    return this.carryForwardService.runCarryForward({
      companyId,
      fromYear: dto.fromYear ?? new Date().getFullYear() - 1,
      employeeId: dto.employeeId ?? null,
      dryRun: dto.dryRun,
      actorId: currentUser.id ?? null,
    });
  }

  @Post('expire')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveBalance',
    description: 'ตัดวันลาสะสมที่หมดอายุ',
  })
  expire(
    @Body() dto: RunLeaveCarryForwardExpiryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    const companyId = requireCompanyId(currentUser.scope, dto.companyId);

    return this.carryForwardService.runExpiry({
      companyId,
      year: dto.year ?? new Date().getFullYear(),
      employeeId: dto.employeeId ?? null,
      dryRun: dto.dryRun,
      actorId: currentUser.id ?? null,
    });
  }
}
