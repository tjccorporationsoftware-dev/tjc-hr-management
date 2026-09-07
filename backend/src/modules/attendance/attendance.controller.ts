import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Delete } from "@nestjs/common";

import { CreateAttendanceLocationDto } from "./dto/create-attendance-location.dto";
import { UpdateAttendanceLocationDto } from "./dto/update-attendance-location.dto";
import { CreateAttendanceDeviceDto } from "./dto/create-attendance-device.dto";
import { UpdateAttendanceDeviceDto } from "./dto/update-attendance-device.dto";
import {
  CreateAttendanceDeviceEnrollmentDto,
  UpdateAttendanceDeviceEnrollmentDto,
} from "./dto/attendance-device-enrollment.dto";
import { AttendanceDevicePunchBatchDto } from "./dto/attendance-device-punch.dto";
import { PushDeviceEmployeesDto } from "./dto/push-device-employees.dto";
import { AuditAction } from "../../generated/prisma/client";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";

import { AttendanceService } from "./attendance.service";
import { AttendanceSessionRuleService } from "./attendance-session-rule.service";
import { AttendanceProgressService } from "./attendance-progress.service";
import { AttendanceImportService } from "./attendance-import.service";
import {
  CreateAttendancePolicyDto,
  EffectiveAttendancePolicyQueryDto,
  ListAttendancePoliciesQueryDto,
  UpdateAttendancePolicyDto,
} from "./dto/attendance-policy.dto";
import {
  AssignEmployeeWorkShiftDto,
  ListEmployeeWorkShiftsQueryDto,
  UpdateEmployeeAttendanceExemptionDto,
} from "./dto/employee-work-shift.dto";
import {
  PunchAttendanceDto,
  PunchContextQueryDto,
} from "./dto/punch-attendance.dto";
import {
  ListAttendanceDailySummariesQueryDto,
  RecalculateAttendanceDailySummariesDto,
} from "./dto/attendance-daily-summary.dto";
import {
  AttendanceDailyReviewActionDto,
  BulkAttendanceDailyReviewActionDto,
} from "./dto/attendance-daily-review-action.dto";
import { UpdateMissingLogPenaltyWaiverDto } from "./dto/attendance-penalty-waiver.dto";
import {
  AttendanceMonthlyReviewActionDto,
  AttendanceMonthlyReviewDetailQueryDto,
  AttendanceMonthlyReviewQueryDto,
  AttendanceMonthlyReviewScopeActionDto,
} from "./dto/attendance-monthly-review.dto";
import { CancelAttendanceLogDto } from "./dto/cancel-attendance-log.dto";
import { CompleteAttendanceImportDto } from "./dto/complete-attendance-import.dto";
import { CheckAttendanceDto } from "./dto/check-attendance.dto";
import { CreateManualAttendanceLogDto } from "./dto/create-manual-attendance-log.dto";
import { ListAttendanceLogsQueryDto } from "./dto/list-attendance-logs-query.dto";
import { UpdateAttendanceLogDto } from "./dto/update-attendance-log.dto";
import {
  CreateAttendanceSessionRuleDto,
  ListAttendanceSessionRulesQueryDto,
  ReorderAttendanceSessionRulesDto,
  UpdateAttendanceSessionRuleDto,
} from "./dto/attendance-session-rule.dto";

type CurrentUserPayload = {
  id: string;
  email?: string;
  displayName?: string;
};

type ScopedUser = Pick<
  import("../../common/interfaces/authenticated-user.interface").AuthenticatedUser,
  "id" | "scope"
>;

@Controller("attendance")
@Auth()
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceSessionRuleService: AttendanceSessionRuleService,
    private readonly attendanceProgressService: AttendanceProgressService,
    private readonly attendanceImportService: AttendanceImportService,
  ) {}

  @Get("my/today")
  @RequirePermissions("ATTENDANCE_CHECKIN")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceLog",
    description: "ดูสถานะลงเวลาของตัวเองวันนี้",
  })
  async findMyToday(@CurrentUser() currentUser: CurrentUserPayload) {
    return this.attendanceService.findMyToday(currentUser.id);
  }

  @Get("locations")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceLocation",
    description: "ดูรายการสถานที่ลงเวลา",
  })
  async findLocations(@CurrentUser() user: ScopedUser) {
    return this.attendanceService.findLocations(user.scope);
  }

  @Get("locations/:id")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceLocation",
    description: "ดูรายละเอียดสถานที่ลงเวลา",
  })
  async findLocation(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findLocation(id, user.scope);
  }

  @Post("locations")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceLocation",
    description: "เพิ่มสถานที่ลงเวลา",
  })
  async createLocation(
    @Body() dto: CreateAttendanceLocationDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.createLocation(dto, user.scope);
  }

  @Patch("locations/:id")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceLocation",
    description: "แก้ไขสถานที่ลงเวลา",
  })
  async updateLocation(
    @Param("id") id: string,
    @Body() dto: UpdateAttendanceLocationDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.updateLocation(id, dto, user.scope);
  }

  @Delete("locations/:id")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AttendanceLocation",
    description: "ลบสถานที่ลงเวลาแบบ soft delete",
  })
  async removeLocation(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.removeLocation(id, user.scope);
  }

  @Get("devices")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDevice",
    description: "ดูรายการอุปกรณ์ลงเวลา",
  })
  async findDevices(@CurrentUser() user: ScopedUser) {
    return this.attendanceService.findDevices(user.scope);
  }

  @Get("devices/:id")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDevice",
    description: "ดูรายละเอียดอุปกรณ์ลงเวลา",
  })
  async findDevice(@Param("id") id: string) {
    return this.attendanceService.findDevice(id);
  }

  @Post("devices")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceDevice",
    description: "เพิ่มอุปกรณ์ลงเวลา",
  })
  async createDevice(
    @Body() dto: CreateAttendanceDeviceDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.createDevice(dto, user.scope);
  }

  @Patch("devices/:id")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDevice",
    description: "แก้ไขอุปกรณ์ลงเวลา",
  })
  async updateDevice(
    @Param("id") id: string,
    @Body() dto: UpdateAttendanceDeviceDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.updateDevice(id, dto, user.scope);
  }

  @Delete("devices/:id")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AttendanceDevice",
    description: "ลบอุปกรณ์ลงเวลาแบบ soft delete",
  })
  async removeDevice(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.removeDevice(id, user.scope);
  }

  @Get("devices/:id/enrollments")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDeviceEnrollment",
    description: "ดูรายการพนักงานที่ผูกกับเครื่องสแกน",
  })
  async findDeviceEnrollments(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findDeviceEnrollments(id, user.scope);
  }

  /** สรุปประวัติการสแกนเป็นรายคน — ต้องมาก่อน :id/scan-logs ไม่งั้นชนกัน */
  @Get("devices/:id/scan-logs/people")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceRawEvent",
    description: "ดูสรุปการสแกนรายคนของเครื่อง",
  })
  async findDeviceScanLogPeople(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findDeviceScanLogPeople(id, user.scope);
  }

  @Get("devices/:id/scan-logs")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceRawEvent",
    description: "ดูประวัติการสแกนของเครื่อง",
  })
  async findDeviceScanLogs(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("deviceUserId") deviceUserId?: string,
  ) {
    return this.attendanceService.findDeviceScanLogs(id, user.scope, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      deviceUserId,
    });
  }

  @Post("devices/:id/enrollments")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceDeviceEnrollment",
    description: "ผูกพนักงานกับรหัสผู้ใช้ในเครื่องสแกน",
  })
  async createDeviceEnrollment(
    @Param("id") id: string,
    @Body() dto: CreateAttendanceDeviceEnrollmentDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.createDeviceEnrollment(id, dto, user.scope);
  }

  @Patch("devices/:id/enrollments/:enrollmentId")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDeviceEnrollment",
    description: "แก้ไขการผูกพนักงานกับเครื่องสแกน",
  })
  async updateDeviceEnrollment(
    @Param("id") id: string,
    @Param("enrollmentId") enrollmentId: string,
    @Body() dto: UpdateAttendanceDeviceEnrollmentDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.updateDeviceEnrollment(
      id,
      enrollmentId,
      dto,
      user.scope,
    );
  }

  @Delete("devices/:id/enrollments/:enrollmentId")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AttendanceDeviceEnrollment",
    description: "ยกเลิกการผูกพนักงานกับเครื่องสแกน",
  })
  async removeDeviceEnrollment(
    @Param("id") id: string,
    @Param("enrollmentId") enrollmentId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.removeDeviceEnrollment(
      id,
      enrollmentId,
      user.scope,
    );
  }

  /**
   * ส่งทะเบียนพนักงานลงเครื่องสแกน
   * เข้าคิวไว้ให้เครื่องมาเอาไปเอง (ADMS สั่งตรงไม่ได้)
   */
  @Post("devices/:id/push-employees")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceDeviceCommand",
    description: "ส่งทะเบียนพนักงานลงเครื่องสแกน",
  })
  async pushDeviceEmployees(
    @Param("id") id: string,
    @Body() dto: PushDeviceEmployeesDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.pushEmployeesToDevice(
      id,
      dto,
      user.scope,
      user.id,
    );
  }

  /** สถานะคำสั่งที่ส่งลงเครื่อง (รอส่ง/ส่งแล้ว/สำเร็จ/ล้มเหลว) */
  @Get("devices/:id/commands")
  @RequirePermissions("ATTENDANCE_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDeviceCommand",
    description: "ดูสถานะคำสั่งที่ส่งลงเครื่องสแกน",
  })
  async findDeviceCommands(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
    @Query("limit") limit?: string,
  ) {
    return this.attendanceService.findDeviceCommands(id, user.scope, {
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * รับรายการสแกนจากเครื่อง (หรือ middleware ที่ดึงจากเครื่อง)
   * มาสร้างเป็นการลงเวลาให้พนักงานที่ผูกรหัสไว้
   */
  @Post("devices/:id/punches")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.IMPORT,
    entity: "AttendanceLog",
    description: "รับข้อมูลสแกนจากเครื่องลงเวลา",
  })
  async ingestDevicePunches(
    @Param("id") id: string,
    @Body() dto: AttendanceDevicePunchBatchDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.ingestDevicePunches(id, dto, user.scope, user.id);
  }

  @Get("policies")
  @RequirePermissions("ATTENDANCE_POLICY_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendancePolicy",
    description: "ดูนโยบายเวลาเข้าออกงานและค่าปรับ",
  })
  async findPolicies(
    @Query() query: ListAttendancePoliciesQueryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findPolicies(query, user.scope);
  }

  @Get("policies/effective")
  @RequirePermissions("ATTENDANCE_POLICY_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendancePolicy",
    description: "ดูนโยบายเวลาเข้าออกงานที่มีผลใช้งาน",
  })
  async findEffectivePolicy(@Query() query: EffectiveAttendancePolicyQueryDto) {
    return this.attendanceService.findEffectivePolicy(query);
  }

  @Get("policies/:policyId/session-rules")
  @RequirePermissions("ATTENDANCE_POLICY_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceSessionRule",
    description: "ดูรอบลงเวลาของนโยบายเวลาเข้าออกงาน",
  })
  async findPolicySessionRules(
    @Param("policyId") policyId: string,
    @Query() query: ListAttendanceSessionRulesQueryDto,
  ) {
    return this.attendanceSessionRuleService.findByPolicy(policyId, query);
  }

  @Post("policies/:policyId/session-rules")
  @RequirePermissions("ATTENDANCE_SESSION_RULE_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceSessionRule",
    description: "เพิ่มรอบลงเวลาของนโยบายเวลาเข้าออกงาน",
  })
  async createPolicySessionRule(
    @Param("policyId") policyId: string,
    @Body() dto: CreateAttendanceSessionRuleDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceSessionRuleService.create(
      policyId,
      dto,
      user.id,
      user.scope,
    );
  }

  @Post("policies/:policyId/session-rules/reorder")
  @RequirePermissions("ATTENDANCE_SESSION_RULE_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceSessionRule",
    description: "จัดลำดับรอบลงเวลาของนโยบายเวลาเข้าออกงาน",
  })
  async reorderPolicySessionRules(
    @Param("policyId") policyId: string,
    @Body() dto: ReorderAttendanceSessionRulesDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceSessionRuleService.reorder(
      policyId,
      dto,
      user.id,
      user.scope,
    );
  }

  @Patch("session-rules/:id")
  @RequirePermissions("ATTENDANCE_SESSION_RULE_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceSessionRule",
    description: "แก้ไขรอบลงเวลาของนโยบายเวลาเข้าออกงาน",
  })
  async updatePolicySessionRule(
    @Param("id") id: string,
    @Body() dto: UpdateAttendanceSessionRuleDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceSessionRuleService.update(id, dto, user.id, user.scope);
  }

  @Delete("session-rules/:id")
  @RequirePermissions("ATTENDANCE_SESSION_RULE_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AttendanceSessionRule",
    description: "ปิดใช้งานรอบลงเวลาของนโยบายเวลาเข้าออกงาน",
  })
  async removePolicySessionRule(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceSessionRuleService.remove(id, user.id, user.scope);
  }

  /* ประกาศก่อน policies/:id เสมอ ไม่งั้น "shift-assignments" จะถูกจับเป็น id */
  @Get("policies/shift-assignments")
  @RequirePermissions("ATTENDANCE_POLICY_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "EmployeeWorkShift",
    description: "ดูการผูกพนักงานเข้ากะการทำงาน",
  })
  async findEmployeeShiftAssignments(
    @Query() query: ListEmployeeWorkShiftsQueryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findEmployeeShiftAssignments(
      query,
      user.scope,
    );
  }

  /*
   * ต้องประกาศก่อน policies/:id เช่นเดียวกับ shift-assignments
   * ไม่งั้น "employee-exemptions" จะถูกจับเป็น id ของกะ
   */
  @Post("policies/employee-exemptions")
  @RequirePermissions("ATTENDANCE_POLICY_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Employee",
    description: "ตั้งการยกเว้นการลงเวลาให้พนักงาน",
  })
  async updateEmployeeAttendanceExemptions(
    @Body() dto: UpdateEmployeeAttendanceExemptionDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.updateEmployeeAttendanceExemptions(
      dto,
      user.scope,
    );
  }

  @Post("policies/:id/assign-employees")
  @RequirePermissions("ATTENDANCE_POLICY_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "EmployeeWorkShift",
    description: "ผูกพนักงานเข้ากะการทำงาน",
  })
  async assignEmployeesToShift(
    @Param("id") id: string,
    @Body() dto: AssignEmployeeWorkShiftDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.assignEmployeesToShift(
      id,
      dto,
      user.scope,
      user.id,
    );
  }

  @Post("policies/:id/remove-employees")
  @RequirePermissions("ATTENDANCE_POLICY_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "EmployeeWorkShift",
    description: "เอาพนักงานออกจากกะการทำงาน",
  })
  async removeEmployeesFromShift(
    @Param("id") id: string,
    @Body() dto: AssignEmployeeWorkShiftDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.removeEmployeesFromShift(id, dto, user.scope);
  }

  @Post("policies")
  @RequirePermissions("ATTENDANCE_POLICY_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendancePolicy",
    description: "เพิ่มนโยบายเวลาเข้าออกงานและค่าปรับ",
  })
  async createPolicy(
    @Body() dto: CreateAttendancePolicyDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.createPolicy(dto, user.scope, user.id);
  }

  @Patch("policies/:id")
  @RequirePermissions("ATTENDANCE_POLICY_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendancePolicy",
    description: "แก้ไขนโยบายเวลาเข้าออกงานและค่าปรับ",
  })
  async updatePolicy(
    @Param("id") id: string,
    @Body() dto: UpdateAttendancePolicyDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.updatePolicy(id, dto, user.scope, user.id);
  }

  @Delete("policies/:id")
  @RequirePermissions("ATTENDANCE_POLICY_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AttendancePolicy",
    description: "ปิดใช้งานนโยบายเวลาเข้าออกงานและค่าปรับ",
  })
  async removePolicy(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.removePolicy(id, user.scope, user.id);
  }

  @Post("imports/:id/complete")
  @RequirePermissions("ATTENDANCE_IMPORT")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: "attendance:import:complete",
    limit: 10,
    windowSeconds: 60,
    includeUserId: true,
    message: "มีการปิดงานนำเข้าถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  })
  @Audit({
    action: AuditAction.IMPORT,
    entity: "AttendanceImport",
    description: "ปิดงานนำเข้า Attendance และส่งคำนวณสรุปรายวันที่ได้รับผลกระทบ",
  })
  async completeAttendanceImport(
    @Param("id") id: string,
    @Body() dto: CompleteAttendanceImportDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.attendanceImportService.completeImport(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get("daily-summaries")
  @RequirePermissions("ATTENDANCE_READ_ALL")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDailySummary",
    description: "ดูสรุปเวลาเข้าออกและยอดหักรายวันทั้งหมด",
  })
  async findDailySummaries(
    @Query() query: ListAttendanceDailySummariesQueryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findDailySummaries(query, user.scope);
  }


  @Get("daily-summaries/monthly-review")
  @RequirePermissions("ATTENDANCE_READ_ALL")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDailySummary",
    description: "ดูสรุปเวลารวมรายคนตามช่วงงวดก่อนเข้าเงินเดือน",
  })
  async findMonthlyDailySummaryReview(
    @Query() query: AttendanceMonthlyReviewQueryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findMonthlyDailySummaryReview(
      query,
      user.scope,
    );
  }


  @Get("daily-summaries/monthly-review/:employeeId/details")
  @RequirePermissions("ATTENDANCE_READ_ALL")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDailySummary",
    description: "ดูรายละเอียดสรุปเวลารายเดือนของพนักงานหนึ่งคน",
  })
  async findMonthlyDailySummaryReviewDetail(
    @Param("employeeId") employeeId: string,
    @Query() query: AttendanceMonthlyReviewDetailQueryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findMonthlyDailySummaryReviewDetail(
      employeeId,
      query,
      user.scope,
    );
  }

  @Get("daily-summaries/my")
  @RequirePermissions("ATTENDANCE_READ_OWN")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDailySummary",
    description: "ดูสรุปเวลาเข้าออกและยอดหักรายวันของตัวเอง",
  })
  async findMyDailySummaries(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: ListAttendanceDailySummariesQueryDto,
  ) {
    return this.attendanceService.findMyDailySummaries(currentUser.id, query);
  }

  @Get("daily-summaries/team")
  @RequirePermissions("ATTENDANCE_READ_TEAM")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceDailySummary",
    description: "ดูสรุปเวลาเข้าออกและยอดหักรายวันของทีม",
  })
  async findTeamDailySummaries(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: ListAttendanceDailySummariesQueryDto,
  ) {
    return this.attendanceService.findTeamDailySummaries(currentUser.id, query);
  }

  @Get("daily-summaries/recalculate/progress/:progressId")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceRecalculationProgress",
    description: "ดูความคืบหน้าการคำนวณ Attendance แบบเรียลไทม์",
  })
  findRecalculationProgress(
    @Param("progressId") progressId: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.attendanceProgressService.get(progressId, currentUser.id);
  }

  @Post("daily-summaries/recalculate/progress/:progressId/cancel")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceRecalculationProgress",
    description: "ขอหยุดการคำนวณ Attendance",
  })
  cancelRecalculationProgress(
    @Param("progressId") progressId: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.attendanceProgressService.requestCancel(
      progressId,
      currentUser.id,
    );
  }

  @Post("daily-summaries/recalculate")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: "attendance:daily-summary:recalculate",
    limit: 10,
    windowSeconds: 60,
    includeUserId: true,
    message: "มีการคำนวณสรุปเวลาถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  })
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "คำนวณสรุปเวลาเข้าออกและยอดหักรายวันใหม่",
  })
  async recalculateDailySummaries(
    @Body() dto: RecalculateAttendanceDailySummariesDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.recalculateDailySummaries(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }


  @Post("daily-summaries/monthly-ready-for-payroll")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ทำเครื่องหมายสรุปเวลาทั้งช่วงงวดของพนักงานว่าพร้อมเข้าเงินเดือน",
  })
  async monthlyReadyForPayrollDailySummaries(
    @Body() dto: AttendanceMonthlyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.monthlyMarkDailySummariesReadyForPayroll(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/monthly-lock")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ล็อกสรุปเวลาทั้งช่วงงวดของพนักงานหลังพร้อมเข้าเงินเดือน",
  })
  async monthlyLockDailySummaries(
    @Body() dto: AttendanceMonthlyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.monthlyLockDailySummaries(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/monthly-ready-for-payroll/by-period")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ทำเครื่องหมายสรุปเวลาทั้งงวดตามตัวกรองว่าพร้อมเข้าเงินเดือน",
  })
  async monthlyReadyForPayrollDailySummariesByPeriod(
    @Body() dto: AttendanceMonthlyReviewScopeActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.monthlyMarkDailySummariesReadyForPayrollByPeriod(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/monthly-lock/by-period")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ล็อกสรุปเวลาทั้งงวดตามตัวกรองหลังพร้อมเข้าเงินเดือน",
  })
  async monthlyLockDailySummariesByPeriod(
    @Body() dto: AttendanceMonthlyReviewScopeActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.monthlyLockDailySummariesByPeriod(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/bulk-ready-for-payroll")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ทำเครื่องหมายสรุปเวลาหลายรายการว่าพร้อมเข้าเงินเดือน",
  })
  async bulkReadyForPayrollDailySummaries(
    @Body() dto: BulkAttendanceDailyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.bulkMarkDailySummariesReadyForPayroll(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/bulk-lock")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ล็อกสรุปเวลาหลายรายการหลังพร้อมเข้าเงินเดือน",
  })
  async bulkLockDailySummaries(
    @Body() dto: BulkAttendanceDailyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.bulkLockDailySummaries(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/:id/review")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "HR ตรวจสรุปเวลารายวันแล้ว",
  })
  async reviewDailySummary(
    @Param("id") id: string,
    @Body() dto: AttendanceDailyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.markDailySummaryReviewed(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/:id/unreview")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ยกเลิกสถานะตรวจแล้วของสรุปเวลารายวัน",
  })
  async unreviewDailySummary(
    @Param("id") id: string,
    @Body() dto: AttendanceDailyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.cancelDailySummaryReviewed(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/:id/missing-log-penalty-waiver")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ปรับการหักค่าปรับลืมสแกนของสรุปเวลารายวัน",
  })
  async setMissingLogPenaltyWaiver(
    @Param("id") id: string,
    @Body() dto: UpdateMissingLogPenaltyWaiverDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.setDailySummaryMissingLogPenaltyWaiver(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/:id/ready-for-payroll")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ทำเครื่องหมายสรุปเวลารายวันว่าพร้อมเข้าเงินเดือน",
  })
  async readyForPayrollDailySummary(
    @Param("id") id: string,
    @Body() dto: AttendanceDailyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.markDailySummaryReadyForPayroll(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post("daily-summaries/:id/lock")
  @RequirePermissions("ATTENDANCE_RECALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceDailySummary",
    description: "ล็อกสรุปเวลารายวันหลังพร้อมเข้าเงินเดือน",
  })
  async lockDailySummary(
    @Param("id") id: string,
    @Body() dto: AttendanceDailyReviewActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.lockDailySummary(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get("logs")
  @RequirePermissions("ATTENDANCE_READ_ALL")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceLog",
    description: "ดูรายการลงเวลา",
  })
  async findAll(
    @Query() query: ListAttendanceLogsQueryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findAll(query, user.scope);
  }

  @Get("logs/:id")
  @RequirePermissions("ATTENDANCE_READ_ALL")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceLog",
    description: "ดูรายละเอียดรายการลงเวลา",
  })
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.attendanceService.findOne(id, user.scope);
  }

  @Get("punch/context")
  @RequirePermissions("ATTENDANCE_CHECKIN")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendanceLog",
    description: "ดูรอบลงเวลาปัจจุบันตามนโยบายและ session rules",
  })
  async getPunchContext(
    @Query() query: PunchContextQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.attendanceService.getPunchContext(currentUser.id, query);
  }

  @Post("punch")
  @RequirePermissions("ATTENDANCE_CHECKIN")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: "attendance:punch",
    limit: 20,
    windowSeconds: 60,
    includeUserId: true,
    message: "มีการบันทึกเวลาเร็วเกินไป กรุณารอสักครู่แล้วลองใหม่",
  })
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceLog",
    description: "บันทึกเวลาแบบระบุรอบเช้า/บ่าย/ออกงาน พร้อมแหล่งที่มา",
  })
  async punch(
    @Body() dto: PunchAttendanceDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() request: Request,
  ) {
    return this.attendanceService.punch(dto, currentUser.id, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
  }

  @Post("check-in")
  @RequirePermissions("ATTENDANCE_CHECKIN")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceLog",
    description: "ลงเวลาเข้างาน",
  })
  async checkIn(
    @Body() dto: CheckAttendanceDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() request: Request,
  ) {
    return this.attendanceService.checkIn(dto, currentUser.id, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
  }

  @Post("check-out")
  @RequirePermissions("ATTENDANCE_CHECKIN")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceLog",
    description: "ลงเวลาออกงาน",
  })
  async checkOut(
    @Body() dto: CheckAttendanceDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() request: Request,
  ) {
    return this.attendanceService.checkOut(dto, currentUser.id, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
  }

  @Post("logs/manual")
  @RequirePermissions("ATTENDANCE_ADD")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendanceLog",
    description: "เพิ่มเวลาทำงานโดย HR/Admin",
  })
  async createManualLog(
    @Body() dto: CreateManualAttendanceLogDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
    @Req() request: Request,
  ) {
    return this.attendanceService.createManualLog(
      dto,
      currentUser.id,
      {
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      },
      currentUser.scope,
    );
  }

  @Patch("logs/:id")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendanceLog",
    description: "แก้ไขรายการลงเวลา",
  })
  async updateLog(
    @Param("id") id: string,
    @Body() dto: UpdateAttendanceLogDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.updateLog(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch("logs/:id/cancel")
  @RequirePermissions("ATTENDANCE_EDIT")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AttendanceLog",
    description: "ยกเลิกรายการลงเวลา",
  })
  async cancelLog(
    @Param("id") id: string,
    @Body() dto: CancelAttendanceLogDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.attendanceService.cancelLog(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }
}
