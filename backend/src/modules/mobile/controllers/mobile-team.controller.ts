import { Controller, Get, Param, Query } from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { MobileTeamOrchestrator } from '../application/mobile-team.orchestrator';
import {
  MobileTeamAttendanceQueryDto,
  MobileTeamMembersQueryDto,
  MobileTeamMonthQueryDto,
  MobileTeamRequestsQueryDto,
} from '../dto/mobile-team.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';

/**
 * ทีมของหัวหน้า (จอ 21–22 และจอ drill-down ที่เพิ่มใน Phase 5)
 *
 * ประเภท endpoint: PASSTHROUGH — ManagerService resolve ทีมจาก token เอง
 * และ **ไม่รับ managerId จาก client** อยู่แล้ว จึงไม่มีทางดูทีมของคนอื่น
 * ส่วน employeeId ที่รับใน attendance/requests ถูกกรองด้วยรายชื่อลูกทีมจริง
 * ตั้งแต่ชั้น where ไม่ใช่แค่ซ่อนตอนแสดงผล
 *
 * ใช้ TEAM_VIEW ให้ตรงกับ ManagerController ฝั่งเว็บ ไม่ใช้ APPROVAL_ACCESS
 * เพราะสิทธิ์ดูทีมกับสิทธิ์อนุมัติเป็นคนละความสามารถกัน
 */
@Controller(`${MOBILE_API_PREFIX}/team`)
export class MobileTeamController {
  constructor(private readonly team: MobileTeamOrchestrator) {}

  /**
   * สถานะวันนี้รายคน + ยอดสะสมทั้งเดือน
   *
   * รวมสองจอไว้ใน endpoint เดียวเพราะ getTeamSummary คืนทั้งสองอย่างมาพร้อมกัน
   * อยู่แล้ว การแยกเป็นสอง endpoint จะเป็นการยิงคำถามเดิมสองครั้ง
   */
  @Get('summary')
  @Auth('ESS_ACCESS', 'TEAM_VIEW')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileTeamMonthQueryDto,
  ) {
    return this.team.summary(user, query);
  }

  /** รายชื่อลูกทีมพร้อมค้นหาและแบ่งหน้า — ใช้เป็นทางเข้าของ drill-down */
  @Get('members')
  @Auth('ESS_ACCESS', 'TEAM_VIEW')
  members(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileTeamMembersQueryDto,
  ) {
    return this.team.members(user, query);
  }

  /* ต้องมาก่อน members/:id ไม่ได้ — Nest จับคู่ตามลำดับที่ประกาศ และ
   * 'calendar' อยู่คนละ path segment จึงไม่ชนกัน */
  @Get('calendar')
  @Auth('ESS_ACCESS', 'TEAM_VIEW')
  calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileTeamMonthQueryDto,
  ) {
    return this.team.calendar(user, query);
  }

  /** ประวัติการลงเวลาของทีม หรือของสมาชิกคนเดียวเมื่อส่ง employeeId */
  @Get('attendance')
  @Auth('ESS_ACCESS', 'TEAM_VIEW')
  attendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileTeamAttendanceQueryDto,
  ) {
    return this.team.attendance(user, query);
  }

  /** คำขอของทีมทุกประเภทในรายการเดียว (ไม่ใช่เฉพาะที่รออนุมัติ) */
  @Get('requests')
  @Auth('ESS_ACCESS', 'TEAM_VIEW')
  requests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileTeamRequestsQueryDto,
  ) {
    return this.team.requests(user, query);
  }

  @Get('members/:employeeId')
  @Auth('ESS_ACCESS', 'TEAM_VIEW')
  member(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Query() query: MobileTeamMonthQueryDto,
  ) {
    return this.team.member(user, employeeId, query);
  }
}
