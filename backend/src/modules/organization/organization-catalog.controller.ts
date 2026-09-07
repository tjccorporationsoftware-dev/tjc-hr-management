import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  BulkToggleOrganizationCatalogDto,
  ListOrganizationCatalogQueryDto,
  ToggleOrganizationCatalogDto,
} from './dto/organization-catalog.dto';
import { OrganizationCatalogService } from './organization-catalog.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

/**
 * รายการตำแหน่ง/ประเภทพนักงานมาตรฐานระดับระบบ + การเปิดปิดใช้ต่อบริษัท
 *
 * ใช้สิทธิ์ชุดเดียวกับการจัดการโครงสร้างองค์กร (ORG_READ / ORG_MANAGE)
 * เพราะผลลัพธ์คือแถวใน Position / EmployeeType ของบริษัทตรง ๆ
 */
@Controller('organization/catalog')
export class OrganizationCatalogController {
  constructor(
    private readonly organizationCatalogService: OrganizationCatalogService,
  ) {}

  /* --------------------------- departments --------------------------- */

  @Get('departments')
  @Auth('ORG_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DepartmentCatalog',
    description: 'ดูรายการแผนกมาตรฐานของระบบ',
  })
  listDepartments(
    @Query() query: ListOrganizationCatalogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.listDepartmentCatalog(
      query,
      user.scope,
    );
  }

  @Post('departments/enable-bulk')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Department',
    description: 'เปิดใช้แผนกมาตรฐานหลายรายการให้บริษัท',
  })
  enableDepartmentsBulk(
    @Body() dto: BulkToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enableDepartmentsBulk(
      dto,
      user.scope,
    );
  }

  @Post('departments/:catalogId/enable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Department',
    description: 'เปิดใช้แผนกมาตรฐานให้บริษัท',
  })
  enableDepartment(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enableDepartment(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }

  @Post('departments/:catalogId/disable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Department',
    description: 'ปิดใช้แผนกมาตรฐานของบริษัท',
  })
  disableDepartment(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.disableDepartment(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }

  /* ---------------------------- divisions ---------------------------- */

  @Get('divisions')
  @Auth('ORG_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DivisionCatalog',
    description: 'ดูรายการฝ่าย/กลุ่มงานมาตรฐานของระบบ',
  })
  listDivisions(
    @Query() query: ListOrganizationCatalogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.listDivisionCatalog(
      query,
      user.scope,
    );
  }

  @Post('divisions/enable-bulk')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Division',
    description: 'เปิดใช้ฝ่าย/กลุ่มงานมาตรฐานหลายรายการให้บริษัท',
  })
  enableDivisionsBulk(
    @Body() dto: BulkToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enableDivisionsBulk(dto, user.scope);
  }

  @Post('divisions/:catalogId/enable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Division',
    description: 'เปิดใช้ฝ่าย/กลุ่มงานมาตรฐานให้บริษัท',
  })
  enableDivision(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enableDivision(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }

  @Post('divisions/:catalogId/disable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Division',
    description: 'ปิดใช้ฝ่าย/กลุ่มงานมาตรฐานของบริษัท',
  })
  disableDivision(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.disableDivision(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }

  /* ---------------------------- positions ---------------------------- */

  @Get('positions')
  @Auth('ORG_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PositionCatalog',
    description: 'ดูรายการตำแหน่งมาตรฐานของระบบ',
  })
  listPositions(
    @Query() query: ListOrganizationCatalogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.listPositionCatalog(
      query,
      user.scope,
    );
  }

  @Post('positions/enable-bulk')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Position',
    description: 'เปิดใช้ตำแหน่งมาตรฐานหลายรายการให้บริษัท',
  })
  enablePositionsBulk(
    @Body() dto: BulkToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enablePositionsBulk(dto, user.scope);
  }

  @Post('positions/:catalogId/enable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Position',
    description: 'เปิดใช้ตำแหน่งมาตรฐานให้บริษัท',
  })
  enablePosition(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enablePosition(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }

  @Post('positions/:catalogId/disable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Position',
    description: 'ปิดใช้ตำแหน่งมาตรฐานของบริษัท',
  })
  disablePosition(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.disablePosition(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }

  /* ------------------------- employee types -------------------------- */

  @Get('employee-types')
  @Auth('ORG_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeTypeCatalog',
    description: 'ดูรายการประเภทพนักงานมาตรฐานของระบบ',
  })
  listEmployeeTypes(
    @Query() query: ListOrganizationCatalogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.listEmployeeTypeCatalog(
      query,
      user.scope,
    );
  }

  @Post('employee-types/enable-bulk')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EmployeeType',
    description: 'เปิดใช้ประเภทพนักงานมาตรฐานหลายรายการให้บริษัท',
  })
  enableEmployeeTypesBulk(
    @Body() dto: BulkToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enableEmployeeTypesBulk(
      dto,
      user.scope,
    );
  }

  @Post('employee-types/:catalogId/enable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EmployeeType',
    description: 'เปิดใช้ประเภทพนักงานมาตรฐานให้บริษัท',
  })
  enableEmployeeType(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.enableEmployeeType(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }

  @Post('employee-types/:catalogId/disable')
  @Auth('ORG_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeType',
    description: 'ปิดใช้ประเภทพนักงานมาตรฐานของบริษัท',
  })
  disableEmployeeType(
    @Param('catalogId') catalogId: string,
    @Body() dto: ToggleOrganizationCatalogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationCatalogService.disableEmployeeType(
      catalogId,
      dto.companyId,
      user.scope,
    );
  }
}
