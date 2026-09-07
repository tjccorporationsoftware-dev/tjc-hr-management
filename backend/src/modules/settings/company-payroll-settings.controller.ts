import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditAction } from '../../generated/prisma/client';
import { CompanyPayrollSettingsService } from './company-payroll-settings.service';
import { UpdateCompanyPayrollSettingsDto } from './dto/company-payroll-settings.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { assertWithinScope } from '../../common/tenant/tenant-scope.util';

type CurrentUserPayload = {
  id: string;
  email?: string;
  displayName?: string;
};

@Controller('settings/payroll/company-settings')
export class CompanyPayrollSettingsController {
  constructor(private readonly companyPayrollSettingsService: CompanyPayrollSettingsService) {}

  @Get(':companyId')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'CompanyPayrollSetting',
    description: 'ดูตั้งค่ารอบเงินเดือนแยกบริษัท',
  })
  getCompanyPayrollSetting(
    @Param('companyId') companyId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    assertWithinScope(currentUser.scope, { companyId });
    return this.companyPayrollSettingsService.getCompanyPayrollSetting(companyId);
  }

  @Patch(':companyId')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'CompanyPayrollSetting',
    description: 'แก้ไขตั้งค่ารอบเงินเดือนแยกบริษัท',
  })
  updateCompanyPayrollSetting(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateCompanyPayrollSettingsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    assertWithinScope(currentUser.scope, { companyId });
    return this.companyPayrollSettingsService.updateCompanyPayrollSetting(
      companyId,
      dto,
      currentUser.id,
    );
  }

  @Post(':companyId/reset')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'CompanyPayrollSetting',
    description: 'รีเซ็ตตั้งค่ารอบเงินเดือนของบริษัทกลับเป็นค่ากลาง',
  })
  resetCompanyPayrollSetting(
    @Param('companyId') companyId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    assertWithinScope(currentUser.scope, { companyId });
    return this.companyPayrollSettingsService.resetCompanyPayrollSetting(
      companyId,
      currentUser.id,
    );
  }

  @Get(':companyId/audit')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'CompanyPayrollSettingAudit',
    description: 'ดูประวัติการแก้ไขตั้งค่ารอบเงินเดือนแยกบริษัท',
  })
  getCompanyPayrollSettingAudit(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    assertWithinScope(currentUser.scope, { companyId });
    return this.companyPayrollSettingsService.getCompanyPayrollSettingAudit(companyId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
