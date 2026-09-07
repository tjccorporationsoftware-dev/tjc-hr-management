import { Controller, Get, Query } from '@nestjs/common';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

import { ManagerService } from './manager.service';

/**
 * ManagerController
 * -----------------------------------------------------------------------------
 * Endpoint กลุ่มนี้ใช้สำหรับมุมมองหัวหน้างานเท่านั้น
 * จุดสำคัญด้านความปลอดภัย:
 * - ไม่รับ managerId จาก frontend เพราะปลอมได้
 * - อ่าน current user จาก token เท่านั้น
 * - service จะ resolve user → employee → direct subordinates เอง
 * - response ส่งกลับเฉพาะข้อมูลลูกทีมของหัวหน้างานคนนั้น
 *
 * ใช้ TEAM_VIEW ไม่ใช่ APPROVAL_ACCESS
 * -----------------------------------
 * APPROVAL_ACCESS คือ "อนุมัติรายการได้" ซึ่ง HR ก็ถืออยู่เพราะต้องอนุมัติใบลา/OT
 * แต่ HR ไม่มีลูกทีม เปิดหน้านี้แล้วได้ผลลัพธ์ว่างเปล่าทุกครั้ง
 * TEAM_VIEW แยกไว้ให้เฉพาะบทบาทที่มีสายบังคับบัญชาจริง
 */
@Controller('manager')
@Auth('TEAM_VIEW')
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  @Get('dashboard')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerDashboard',
    description: 'ดู Dashboard หัวหน้างานแบบ scoped เฉพาะทีม',
  })
  getDashboard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.managerService.getDashboard(currentUser);
  }

  @Get('team/summary')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerTeamSummary',
    description: 'ดูสรุปทีมรายคน (วันนี้ + สะสมทั้งเดือน + วันลาคงเหลือ)',
  })
  getTeamSummary(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getTeamSummary(currentUser, query);
  }

  @Get('team/calendar')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerTeamCalendar',
    description: 'ดูปฏิทินการลา/ทำงานนอกสถานที่ของทีมรายเดือน',
  })
  getTeamCalendar(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getTeamCalendar(currentUser, query);
  }

  @Get('team')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerTeam',
    description: 'ดูรายชื่อลูกทีมแบบ scoped เฉพาะทีม',
  })
  getTeam(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getTeam(currentUser, query);
  }

  @Get('attendance')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerAttendance',
    description: 'ดูเวลาทำงานของลูกทีมแบบ scoped เฉพาะทีม',
  })
  getAttendance(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getAttendance(currentUser, query);
  }

  @Get('leaves')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerLeave',
    description: 'ดูใบลาของลูกทีมแบบ scoped เฉพาะทีม',
  })
  getLeaves(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getLeaves(currentUser, query);
  }

  @Get('overtime')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerOvertime',
    description: 'ดู OT ของลูกทีมแบบ scoped เฉพาะทีม',
  })
  getOvertime(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getOvertime(currentUser, query);
  }

  @Get('offsite')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerOffsite',
    description: 'ดูคำขอทำงานนอกสถานที่ของลูกทีมแบบ scoped เฉพาะทีม',
  })
  getOffsite(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getOffsite(currentUser, query);
  }

  @Get('time-adjust')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ManagerTimeAdjust',
    description: 'ดูคำขอแก้เวลาของลูกทีมแบบ scoped เฉพาะทีม',
  })
  getTimeAdjust(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.managerService.getTimeAdjust(currentUser, query);
  }
}
