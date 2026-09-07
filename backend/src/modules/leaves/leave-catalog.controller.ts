import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CopyLeavePolicyDto,
  ListLeaveCatalogQueryDto,
  SaveLeaveTypeMatrixDto,
  ToggleLeaveCatalogDto,
} from './dto/leave-catalog.dto';
import { LeaveCatalogService } from './leave-catalog.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

/**
 * รายการประเภทการลามาตรฐานระดับระบบ + การเปิด/ปิดใช้ต่อบริษัท
 * และการบันทึกนโยบายทุกประเภทพนักงานในครั้งเดียว
 */
@Auth()
@Controller('leaves/catalog')
export class LeaveCatalogController {
  constructor(private readonly leaveCatalogService: LeaveCatalogService) {}

  @Get()
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveTypeCatalog',
    description: 'ดูรายการประเภทการลามาตรฐานของระบบ',
  })
  list(
    @Query() query: ListLeaveCatalogQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveCatalogService.listCatalog(query, currentUser.scope);
  }

  @Post(':catalogId/enable')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'LeaveType',
    description: 'เปิดใช้ประเภทการลาให้บริษัท',
  })
  enable(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleLeaveCatalogDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveCatalogService.enableForCompany(
      catalogId,
      dto.companyId,
      currentUser.scope,
    );
  }

  @Post(':catalogId/disable')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveType',
    description: 'ปิดใช้ประเภทการลาของบริษัท',
  })
  disable(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleLeaveCatalogDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveCatalogService.disableForCompany(
      catalogId,
      dto.companyId,
      currentUser.scope,
    );
  }

  @Get('types/:leaveTypeId/matrix')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeavePolicy',
    description: 'ดูนโยบายการลาแยกตามประเภทพนักงาน',
  })
  getMatrix(
    @Param('leaveTypeId') leaveTypeId: string,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveCatalogService.getMatrix(
      leaveTypeId,
      branchId?.trim() || null,
      currentUser.scope,
    );
  }

  @Put('types/:leaveTypeId/matrix')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeavePolicy',
    description: 'บันทึกนโยบายการลาแยกตามประเภทพนักงาน',
  })
  saveMatrix(
    @Param('leaveTypeId') leaveTypeId: string,
    @Body() dto: SaveLeaveTypeMatrixDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveCatalogService.saveMatrix(
      leaveTypeId,
      dto,
      currentUser.scope,
    );
  }

  @Post('copy')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'LeavePolicy',
    description: 'คัดลอกนโยบายการลาข้ามบริษัท/สาขา',
  })
  copy(
    @Body() dto: CopyLeavePolicyDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveCatalogService.copyPolicies(dto, currentUser.scope);
  }
}
