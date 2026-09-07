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
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

import { OffboardingService } from './offboarding.service';
import {
  CreateOffboardingCaseDto,
  CreateOffboardingChecklistDto,
  CreateOffboardingTaskDto,
  ListOffboardingCasesQueryDto,
  ListOffboardingChecklistsQueryDto,
  ListOffboardingTasksQueryDto,
  OffboardingCaseActionDto,
  OffboardingTaskActionDto,
  SaveExitInterviewDto,
  UpdateOffboardingCaseDto,
  UpdateOffboardingChecklistDto,
} from './dto/offboarding.dto';

type CurrentUserPayload = { id: string };
type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

@Controller('offboarding')
@Auth()
export class OffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  /* ---------------- Checklist ---------------- */

  @Get('checklists')
  @RequirePermissions('OFFBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OffboardingChecklist',
    description: 'ดูเช็กลิสต์การออกจากงาน',
  })
  findChecklists(
    @Query() query: ListOffboardingChecklistsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.findChecklists(query, currentUser.scope);
  }

  @Post('checklists')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OffboardingChecklist',
    description: 'สร้างเช็กลิสต์การออกจากงาน',
  })
  createChecklist(
    @Body() dto: CreateOffboardingChecklistDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.createChecklist(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('checklists/:id')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingChecklist',
    description: 'แก้ไขเช็กลิสต์การออกจากงาน',
  })
  updateChecklist(
    @Param('id') id: string,
    @Body() dto: UpdateOffboardingChecklistDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.updateChecklist(id, dto, currentUser.scope);
  }

  @Delete('checklists/:id')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OffboardingChecklist',
    description: 'ลบเช็กลิสต์การออกจากงาน',
  })
  removeChecklist(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.removeChecklist(id, currentUser.scope);
  }

  /* ---------------- Case ---------------- */

  @Get('cases')
  @RequirePermissions('OFFBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OffboardingCase',
    description: 'ดูรายการพนักงานที่กำลังออกจากงาน',
  })
  findCases(
    @Query() query: ListOffboardingCasesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.findCases(query, currentUser.scope);
  }

  @Get('cases/:id')
  @RequirePermissions('OFFBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OffboardingCase',
    description: 'ดูรายละเอียดการออกจากงาน',
  })
  findCase(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.offboardingService.findCase(id, currentUser.scope);
  }

  @Post('cases')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OffboardingCase',
    description: 'เปิดเคสการออกจากงาน',
  })
  createCase(
    @Body() dto: CreateOffboardingCaseDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.createCase(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('cases/:id')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingCase',
    description: 'แก้ไขเคสการออกจากงาน',
  })
  updateCase(
    @Param('id') id: string,
    @Body() dto: UpdateOffboardingCaseDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.updateCase(id, dto, currentUser.scope);
  }

  @Post('cases/:id/revoke-access')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingCase',
    description: 'ปิดสิทธิ์เข้าใช้ระบบของพนักงานที่ออก',
  })
  revokeAccess(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.revokeAccess(id, currentUser.scope);
  }

  /**
   * คำนวณค่าชดเชยและภาษีเงินก้อนของเคสนี้ แล้วบันทึกผลลงใบ
   * กดซ้ำได้ ระบบจะคิดใหม่จากตัวเลขล่าสุดทุกครั้ง
   */
  @Post('cases/:id/calculate-severance')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingCase',
    description: 'คำนวณค่าชดเชยและภาษีเงินก้อนตอนออกจากงาน',
  })
  calculateSeverance(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.calculateSeverance(id, currentUser.scope);
  }

  /**
   * ส่งค่าชดเชย/เงินแทนวันลาเข้างวดเงินเดือนที่ครอบวันพ้นสภาพ
   * ต้องกดคำนวณค่าชดเชยก่อน กดซ้ำได้ตราบใดที่งวดยังไม่ดึงรายการไป
   */
  @Post('cases/:id/send-final-pay-to-payroll')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'PayrollAdjustment',
    description: 'ส่งเงินงวดสุดท้ายเข้าระบบเงินเดือน',
  })
  sendFinalPayToPayroll(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.sendFinalPayToPayroll(
      id,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('cases/:id/stop-payroll')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingCase',
    description: 'หยุดจ่ายเงินเดือนงวดถัดไป',
  })
  stopPayroll(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.offboardingService.stopPayroll(id, currentUser.scope);
  }

  @Post('cases/:id/notify-social-security')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingCase',
    description: 'บันทึกการแจ้งออกประกันสังคม',
  })
  notifySocialSecurity(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.markSocialSecurityNotified(
      id,
      currentUser.scope,
    );
  }

  @Post('cases/:id/complete')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingCase',
    description: 'ปิดเคสการออกจากงาน',
  })
  completeCase(
    @Param('id') id: string,
    @Body() dto: OffboardingCaseActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.completeCase(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('cases/:id/cancel')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingCase',
    description: 'ยกเลิกเคสการออกจากงาน',
  })
  cancelCase(
    @Param('id') id: string,
    @Body() dto: OffboardingCaseActionDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.cancelCase(id, dto, currentUser.scope);
  }

  /* ---------------- Task ---------------- */

  @Get('tasks')
  @RequirePermissions('OFFBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OffboardingTask',
    description: 'ดูรายการเคลียร์ของก่อนออก',
  })
  findTasks(
    @Query() query: ListOffboardingTasksQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.findTasks(query, currentUser.scope);
  }

  @Post('tasks')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OffboardingTask',
    description: 'เพิ่มรายการเคลียร์ของ',
  })
  createTask(
    @Body() dto: CreateOffboardingTaskDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.offboardingService.createTask(dto, currentUser.scope);
  }

  @Post('tasks/:id/start')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingTask',
    description: 'เริ่มดำเนินการรายการเคลียร์ของ',
  })
  startTask(
    @Param('id') id: string,
    @Body() dto: OffboardingTaskActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.actOnTask(
      id,
      'start',
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('tasks/:id/complete')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingTask',
    description: 'ยืนยันรับคืน/ปิดรายการเคลียร์ของ',
  })
  completeTask(
    @Param('id') id: string,
    @Body() dto: OffboardingTaskActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.actOnTask(
      id,
      'complete',
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('tasks/:id/waive')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingTask',
    description: 'ยกเว้นรายการเคลียร์ของ',
  })
  waiveTask(
    @Param('id') id: string,
    @Body() dto: OffboardingTaskActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.actOnTask(
      id,
      'waive',
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('tasks/:id/cancel')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OffboardingTask',
    description: 'ยกเลิกรายการเคลียร์ของ',
  })
  cancelTask(
    @Param('id') id: string,
    @Body() dto: OffboardingTaskActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.actOnTask(
      id,
      'cancel',
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  /* ---------------- Exit interview ---------------- */

  @Post('cases/:id/exit-interview')
  @RequirePermissions('OFFBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ExitInterview',
    description: 'บันทึกผลสัมภาษณ์ลาออก',
  })
  saveExitInterview(
    @Param('id') id: string,
    @Body() dto: SaveExitInterviewDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.offboardingService.saveExitInterview(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }
}
