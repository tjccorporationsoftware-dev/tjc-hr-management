import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CancelHolidaySwapDto, CreateHolidayCalendarDto, CreateHolidaySwapDto, CreateHolidayWorkAssignmentDto, UpdateSystemSettingsDto } from './dto/system-settings.dto';
import { SystemSettingsService } from './system-settings.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { requireCompanyId } from '../../common/tenant/tenant-scope.util';
import {
  SystemSettingsAuditQueryDto,
  SystemSettingsScopeQueryDto,
} from './dto/system-settings-scope.dto';

/**
 * บัญชีระดับ GLOBAL ไม่ได้ผูกกับบริษัทใด จึงต้องระบุบริษัทปลายทางมาเอง
 *
 * เดิม endpoint กลุ่มนี้อ่านบริษัทจาก scope อย่างเดียว ทำให้ผู้ดูแลระบบระดับ
 * GLOBAL ตั้งค่าระดับบริษัทไม่ได้เลย ขึ้นว่า "กรุณาระบุบริษัทปลายทาง"
 * ทั้งที่ requireCompanyId รองรับการส่งบริษัทเข้ามาอยู่แล้ว
 *
 * บัญชีระดับ COMPANY/BRANCH ยังถูกล็อกเป็นบริษัทตัวเองเหมือนเดิม
 * เพราะ requireCompanyId จะไม่สนค่าที่ส่งมา
 */

/** อ่านบริษัทปลายทางจาก query ก่อน แล้วค่อยดูใน body */
function resolveRequestedCompanyId(query?: {
  companyId?: string;
}): string | undefined {
  return query?.companyId;
}

type CurrentUserPayload = {
  id: string;
  email?: string;
  displayName?: string;
};

@Controller('settings/system')
@Auth()
@RequirePermissions('ORG_MANAGE')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  @Audit({
    action: AuditAction.VIEW,
    entity: 'SystemSettings',
    description: 'ดูการตั้งค่าระบบ',
  })
  async getSystemSettings(
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.getSystemSettings(
      user.scope.companyId ?? query.companyId ?? null,
    );
  }

  @Patch()
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'SystemSettings',
    description: 'แก้ไขการตั้งค่าระบบ',
  })
  async updateSystemSettings(
    @Body() dto: UpdateSystemSettingsDto,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.updateSystemSettings(
      dto,
      user.id,
      user.scope.companyId ?? query.companyId ?? null,
    );
  }

  /**
   * อ่านวันหยุดของบริษัท
   *
   * ทั้ง controller บังคับ ORG_MANAGE ซึ่งถูกสำหรับการแก้ไข
   * แต่การ "อ่าน" วันหยุดเป็นข้อมูลที่พนักงานทุกคนต้องเห็น
   * หน้าหลักพนักงานเรียก endpoint นี้เพื่อแสดงวันหยุดที่กำลังจะถึง
   * ถ้าไม่ผ่อนสิทธิ์ พนักงานจะเจอ 403 และการ์ดวันหยุดว่างเปล่าทุกคน
   *
   * ใช้ ESS_ACCESS เพราะทุกโรลในระบบถือสิทธิ์นี้ จึงไม่ตัดใครออก
   * ส่วนการเพิ่ม/ลบวันหยุดยังคงต้อง ORG_MANAGE ตามเดิม
   */
  @Get('holidays/calendar')
  @RequirePermissions('ESS_ACCESS')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'HolidayCalendar',
    description: 'ดูรายการวันหยุดจากตารางจริง',
  })
  async listHolidayCalendars(
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.listHolidayCalendars(
      user.scope.companyId ?? query.companyId ?? null,
    );
  }

  @Post('holidays/calendar')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'HolidayCalendar',
    description: 'เพิ่มวันหยุดลงตารางจริง',
  })
  async createHolidayCalendar(
    @Body() dto: CreateHolidayCalendarDto,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.createHolidayCalendar(
      dto,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Delete('holidays/calendar/:id')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'HolidayCalendar',
    description: 'ลบวันหยุดจากตารางจริง',
  })
  async deleteHolidayCalendar(
    @Param('id') id: string,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.deleteHolidayCalendar(
      id,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }


  @Get('holidays/swaps')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'HolidaySwap',
    description: 'ดูรายการสลับวันหยุด',
  })
  async listHolidaySwaps(
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.listHolidaySwaps(
      user.scope.companyId ?? query.companyId ?? null,
    );
  }

  @Post('holidays/swaps')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'HolidaySwap',
    description: 'สร้างรายการสลับวันหยุด',
  })
  async createHolidaySwap(
    @Body() dto: CreateHolidaySwapDto,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.createHolidaySwap(
      dto,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Patch('holidays/swaps/:id/cancel')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'HolidaySwap',
    description: 'ยกเลิกรายการสลับวันหยุด',
  })
  async cancelHolidaySwap(
    @Param('id') id: string,
    @Body() dto: CancelHolidaySwapDto,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.cancelHolidaySwap(
      id,
      dto,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Delete('holidays/swaps/:id')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'HolidaySwap',
    description: 'ลบรายการสลับวันหยุด',
  })
  async deleteHolidaySwap(
    @Param('id') id: string,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.deleteHolidaySwap(
      id,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Get('holidays/work-assignments')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'HolidayWorkAssignment',
    description: 'ดูรายการคนหรือกลุ่มที่ต้องมาทำงานในวันหยุด',
  })
  async listHolidayWorkAssignments(
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.listHolidayWorkAssignments(
      user.scope.companyId ?? query.companyId ?? null,
    );
  }

  @Post('holidays/work-assignments')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'HolidayWorkAssignment',
    description: 'กำหนดคนหรือกลุ่มที่ต้องมาทำงานในวันหยุด',
  })
  async createHolidayWorkAssignments(
    @Body() dto: CreateHolidayWorkAssignmentDto,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.createHolidayWorkAssignments(
      dto,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Delete('holidays/work-assignments/:id')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'HolidayWorkAssignment',
    description: 'ยกเลิกรายการคนหรือกลุ่มที่ต้องมาทำงานในวันหยุด',
  })
  async cancelHolidayWorkAssignment(
    @Param('id') id: string,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.cancelHolidayWorkAssignment(
      id,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Get('holidays/substitute-credits')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'SubstituteHolidayCredit',
    description: 'ดูสิทธิ์หยุดชดเชยจากตารางจริง',
  })
  async listSubstituteHolidayCredits(
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.listSubstituteHolidayCredits(
      user.scope.companyId ?? query.companyId ?? null,
    );
  }

  @Patch('holidays/substitute-credits/:id/cancel')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'SubstituteHolidayCredit',
    description: 'ยกเลิกสิทธิ์หยุดชดเชย',
  })
  async cancelSubstituteHolidayCredit(
    @Param('id') id: string,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.cancelSubstituteHolidayCredit(
      id,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Patch('holidays/substitute-credits/:id/restore')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'SubstituteHolidayCredit',
    description: 'คืนสถานะสิทธิ์หยุดชดเชย',
  })
  async restoreSubstituteHolidayCredit(
    @Param('id') id: string,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.restoreSubstituteHolidayCredit(
      id,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Delete('holidays/substitute-credits/:id')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'SubstituteHolidayCredit',
    description: 'ลบสิทธิ์หยุดชดเชย',
  })
  async deleteSubstituteHolidayCredit(
    @Param('id') id: string,
    @Query() query: SystemSettingsScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.systemSettingsService.deleteSubstituteHolidayCredit(
      id,
      user.id,
      requireCompanyId(user.scope, resolveRequestedCompanyId(query)),
    );
  }

  @Get('audit')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'SystemSettingsAudit',
    description: 'ดูประวัติการแก้ไขการตั้งค่าระบบ',
  })
  async getSystemSettingsAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: SystemSettingsAuditQueryDto,
  ) {
    return this.systemSettingsService.getSystemSettingsAudit({
      page: query?.page ? Number(query.page) : undefined,
      pageSize: query?.pageSize ? Number(query.pageSize) : undefined,
      companyId: user.scope.companyId ?? query?.companyId ?? null,
    });
  }
}
