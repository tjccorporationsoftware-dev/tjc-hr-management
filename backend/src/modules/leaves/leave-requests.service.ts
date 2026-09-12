import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalMatrixResolverService } from '../approval-workflow/services/approval-matrix-resolver.service';
import {
  canActOnApprovalStep,
  canApproveOwnRequest,
  isOwnRequest,
  type ApprovalRequestOwner,
  loadActorRoleCodes,
} from '../approval-workflow/utils/approval-step-authorization.util';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveRequestActionDto } from './dto/leave-request-action.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AttendanceRecalculationTriggerService } from '../attendance/attendance-recalculation-trigger.service';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { buildLeaveRequestInclude } from './helpers/leave-request-include.helper';
import { buildLeaveRequestWhere } from './helpers/leave-search.helper';
import { LeavePolicyResolverService } from './services/leave-policy-resolver.service';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  tenantWhere,
} from '../../common/tenant/tenant-scope.util';
import type { CurrentUserLike, LeaveDayType } from './types/leave.types';
import {
  DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY,
  calculateHourlyLeaveMinutes,
  calculateLeaveTotalDays,
  eachLeaveDate,
  parseLeaveDateOnly,
  parseLeaveTimeToMinutes,
  toLeaveDateKey,
  validateLeaveDateRange,
  type LeaveRoundingMode,
} from './utils/leave-date.util';
import { SystemSettingsService } from '../settings/system-settings.service';
import { thaiToday } from '../../common/utils/thai-date.util';
import { assertDateRangeNotLocked } from '../attendance/utils/attendance-lock.util';
import { leaveSlicesConflict } from './utils/leave-overlap.util';
import {
  delegatedUserIds,
  loadActiveDelegations,
} from '../approval-workflow/utils/approval-delegation.util';

/**
 * ใช้กับการ re-fetch รายละเอียดใบลาภายใน service หลังทำ action สำเร็จ
 * (actor ได้รับอนุญาตให้กระทำกับ record นั้นแล้ว จึงไม่ต้อง scope ซ้ำ)
 */
const INTERNAL_UNSCOPED: TenantScope = {
  level: 'GLOBAL',
  companyId: null,
  branchId: null,
};

@Injectable()
export class LeaveRequestsService {
  /**
   * LeaveRequestsService คือ facade หลักของใบลา
   * ---------------------------------------------------------------------------
   * Controller และ Approval Center ยังเรียก service นี้เหมือนเดิม
   * เพื่อไม่ให้ endpoint เดิม/permission เดิม/response เดิมพัง
   *
   * รอบ refactor นี้แยก helper/type/include ออกไปบางส่วนก่อน
   * ส่วน approval/balance flow ยังอยู่ในไฟล์นี้เพราะผูกกับ transaction แน่นมาก
   * หากจะแยกต่อ ให้ย้ายทีละเมธอดและรัน build ทุกครั้ง
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalMatrixResolver: ApprovalMatrixResolverService,
    private readonly notificationsService: NotificationsService,
    private readonly attendanceRecalculation: AttendanceRecalculationTriggerService,
    private readonly leavePolicyResolver: LeavePolicyResolverService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  /**
   * หาวันที่ "ไม่นับเป็นวันลา" ตามเงื่อนไขของประเภทลา
   *
   * includeWeekend = false -> ตัดวันหยุดประจำสัปดาห์ออก
   * includeHoliday = false -> ตัดวันหยุดนักขัตฤกษ์/วันหยุดบริษัทออก
   *
   * ทั้งคู่เปิดอยู่ (ค่าเริ่มต้น) จะคืน set ว่างทันทีโดยไม่ยิง query
   * เพื่อให้ใบลาส่วนใหญ่ยังเร็วเท่าเดิม
   */
  private async resolveNonCountedLeaveDates(params: {
    employee: {
      id?: string | null;
      companyId?: string | null;
      branchId?: string | null;
      departmentId?: string | null;
      divisionId?: string | null;
      employeeTypeId?: string | null;
    };
    leaveType: { includeHoliday?: boolean | null; includeWeekend?: boolean | null };
    startDate: Date;
    endDate: Date;
  }): Promise<Set<string>> {
    const skipWeekly = params.leaveType.includeWeekend === false;
    const skipHoliday = params.leaveType.includeHoliday === false;
    const excluded = new Set<string>();

    if (!skipWeekly && !skipHoliday) return excluded;

    const dates = eachLeaveDate(params.startDate, params.endDate);
    if (dates.length === 0) return excluded;

    // ดึงค่าตั้งวันหยุดของบริษัทครั้งเดียว แล้ววนตรวจในหน่วยความจำ
    const settings = await this.systemSettingsService.getSystemSettings(
      params.employee.companyId ?? null,
    );

    for (const date of dates) {
      const info = this.systemSettingsService.resolveEmployeeAttendanceHolidayInfo(
        date,
        settings,
        params.employee,
      );

      if (!info.isHoliday) continue;
      // วันหยุดที่ถูกสั่งให้มาทำงาน ยังถือเป็นวันทำงาน จึงต้องนับเป็นวันลา
      if (info.isWorkingHoliday) continue;

      const isWeekly = info.source === 'WEEKLY';

      if ((isWeekly && skipWeekly) || (!isWeekly && skipHoliday)) {
        excluded.add(toLeaveDateKey(date));
      }
    }

    return excluded;
  }

  async findAll(query: ListLeaveRequestsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // where สำหรับรายการจริง ใช้ทุก filter รวมถึง status
    const where = buildLeaveRequestWhere(query, scope);
    // where สำหรับ summary/status tabs ตัด status ออก เพื่อให้ HR เห็นจำนวนทุกสถานะภายใต้ filter ชุดเดียวกัน
    const summaryWhere = buildLeaveRequestWhere(
      {
        ...query,
        status: undefined,
      },
      scope,
    );

    const [rawItems, total, summaryTotal, statusGroups, onLeaveToday] =
      await this.prisma.$transaction([
        this.prisma.leaveRequest.findMany({
          where,
          include: this.leaveRequestInclude(),
          orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: pageSize,
        }),
        this.prisma.leaveRequest.count({ where }),
        this.prisma.leaveRequest.count({ where: summaryWhere }),
        this.prisma.leaveRequest.groupBy({
          by: ['status'],
          where: summaryWhere,
          orderBy: { status: 'asc' },
          _count: { _all: true },
          _sum: { totalDays: true },
        }),
        this.prisma.leaveRequest.count({
          where: this.buildOnLeaveTodayWhere(summaryWhere, undefined),
        }),
      ]);

    const items = await this.attachLeaveBalances(rawItems);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: this.buildLeaveRequestSummary(
        summaryTotal,
        statusGroups,
        onLeaveToday,
      ),
    };
  }

  private async attachLeaveBalances<
    T extends Array<{
      employeeId: string;
      leaveTypeId: string;
      startDate: Date | string;
    }>,
  >(items: T) {
    if (items.length === 0) return items;

    const balanceKeys = new Map<
      string,
      {
        employeeId: string;
        leaveTypeId: string;
        year: number;
      }
    >();

    for (const item of items) {
      const year = this.getLeaveYear(item.startDate);
      const key = `${item.employeeId}:${item.leaveTypeId}:${year}`;

      balanceKeys.set(key, {
        employeeId: item.employeeId,
        leaveTypeId: item.leaveTypeId,
        year,
      });
    }

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        OR: Array.from(balanceKeys.values()).map((key) => ({
          employeeId: key.employeeId,
          leaveTypeId: key.leaveTypeId,
          year: key.year,
        })),
      },
      select: {
        id: true,
        employeeId: true,
        leaveTypeId: true,
        year: true,
        entitlementDays: true,
        carriedForwardDays: true,
        adjustedDays: true,
        usedDays: true,
        pendingDays: true,
        note: true,
      },
    });

    const balanceMap = new Map(
      balances.map((balance) => [
        `${balance.employeeId}:${balance.leaveTypeId}:${balance.year}`,
        {
          ...balance,
          totalAvailableBeforeUsed: this.roundDays(
            this.toNumber(balance.entitlementDays) +
              this.toNumber(balance.carriedForwardDays) +
              this.toNumber(balance.adjustedDays),
          ),
          remainingDays: this.roundDays(
            this.toNumber(balance.entitlementDays) +
              this.toNumber(balance.carriedForwardDays) +
              this.toNumber(balance.adjustedDays) -
              this.toNumber(balance.usedDays) -
              this.toNumber(balance.pendingDays),
          ),
        },
      ]),
    );

    return items.map((item) => {
      const key = `${item.employeeId}:${item.leaveTypeId}:${this.getLeaveYear(
        item.startDate,
      )}`;

      return {
        ...item,
        leaveBalance: balanceMap.get(key) ?? null,
      };
    }) as unknown as T;
  }

  private getLeaveYear(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();

    return Number.isFinite(year) ? year : new Date().getFullYear();
  }

  async findMy(query: ListLeaveRequestsQueryDto, currentUser: CurrentUserLike) {
    const employee = await this.resolveCurrentEmployee(currentUser);

    // employeeId already restricts to the caller's own records, so tenant scope
    // adds nothing here — pass a GLOBAL scope to avoid a redundant filter.
    return this.findAll(
      {
        ...query,
        employeeId: employee.id,
      },
      { level: 'GLOBAL', companyId: null, branchId: null },
    );
  }

  /**
   * Mobile timeline read-model — เรียงตามวันที่เริ่มลา ซึ่งเป็น occurredOn บนแอป
   * โดยไม่เปลี่ยนลำดับของ findMy/findAll ที่เว็บใช้อยู่
   */
  async findMyForMobileTimeline(
    query: ListLeaveRequestsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveCurrentEmployee(currentUser);
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.max(Number(query.pageSize ?? 20), 1);
    const skip = (page - 1) * pageSize;
    const where = buildLeaveRequestWhere(
      { ...query, employeeId: employee.id },
      { level: 'GLOBAL', companyId: null, branchId: null },
    );

    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        select: {
          id: true,
          requestNo: true,
          status: true,
          reason: true,
          startDate: true,
          endDate: true,
          dayType: true,
          startTime: true,
          endTime: true,
          totalDays: true,
          submittedAt: true,
          createdAt: true,
          leaveType: { select: { nameTh: true } },
          approvalSteps: {
            select: {
              status: true,
              stepNo: true,
              actedBy: { select: { displayName: true } },
              expectedApprover: { select: { displayName: true } },
              expectedEmployee: {
                select: { displayName: true, firstName: true, lastName: true },
              },
              position: { select: { nameTh: true } },
            },
            orderBy: { stepNo: 'asc' },
          },
        },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private buildLeaveRequestSummary(
    total: number,
    statusGroups: Array<{
      status: string;
      _count?: true | { _all?: number } | null;
      _sum?: true | { totalDays?: unknown } | null;
    }>,
    onLeaveToday: number,
  ) {
    const summary = {
      total,
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      totalDays: 0,
      onLeaveToday,
    };

    for (const group of statusGroups) {
      const count = this.getGroupCount(group._count);
      const days = this.getGroupTotalDays(group._sum);

      summary.totalDays += days;

      if (group.status === 'DRAFT') summary.draft = count;
      if (group.status === 'SUBMITTED') summary.submitted = count;
      if (group.status === 'APPROVED') summary.approved = count;
      if (group.status === 'REJECTED') summary.rejected = count;
      if (group.status === 'CANCELLED') summary.cancelled = count;
    }

    summary.totalDays = this.roundDays(summary.totalDays);

    return summary;
  }

  private buildOnLeaveTodayWhere(
    where: Prisma.LeaveRequestWhereInput,
    status?: ListLeaveRequestsQueryDto['status'],
  ): Prisma.LeaveRequestWhereInput {
    if (status && status !== 'APPROVED') {
      return {
        id: '__NO_APPROVED_LEAVE_TODAY__',
      };
    }

    // ต้องเป็น "วันนี้" ตามปฏิทินไทย ไม่ใช่ตาม UTC
    // ไม่งั้นช่วงเที่ยงคืนถึง 7 โมงเช้า จะนับคนลาของเมื่อวานมาแสดงแทน
    const today = thaiToday();

    return {
      AND: [
        where,
        {
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today },
        },
      ],
    };
  }

  private getGroupCount(value: true | { _all?: number } | null | undefined) {
    if (!value || value === true) return 0;
    return Number(value._all ?? 0);
  }

  private getGroupTotalDays(
    value: true | { totalDays?: unknown } | null | undefined,
  ) {
    if (!value || value === true) return 0;
    return this.toNumber(value.totalDays);
  }

  private toNumber(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private roundDays(value: number) {
    return Math.round(value * 100) / 100;
  }

  async findMyOne(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyLeaveRequest(id, currentUser);

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async findPendingApprovals(
    query: ListLeaveRequestsQueryDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const canViewAll = await this.actorCanViewAllApprovalSteps(actorId);
    const scopeWhere = tenantWhere(scope) as Prisma.EmployeeWhereInput;

    const where: Prisma.LeaveRequestWhereInput = {
      deletedAt: null,
      status: 'SUBMITTED',
      approvalSteps: {
        some: {
          status: 'PENDING',
          ...(canViewAll ? {} : { expectedApproverId: actorId }),
        },
      },
      ...(Object.keys(scopeWhere).length > 0
        ? { employee: { is: scopeWhere } }
        : {}),
    };

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.leaveTypeId) {
      where.leaveTypeId = query.leaveTypeId;
    }

    if (query.dateFrom || query.dateTo) {
      where.startDate = {};

      if (query.dateFrom) {
        where.startDate.gte = this.parseDateOnly(query.dateFrom);
      }

      if (query.dateTo) {
        where.startDate.lte = this.parseDateOnly(query.dateTo);
      }
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          requestNo: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          reason: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          employee: {
            employeeCode: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            firstName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            lastName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          leaveType: {
            code: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          leaveType: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        include: this.leaveRequestInclude(),
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async updateMy(
    id: string,
    dto: UpdateLeaveRequestDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyLeaveRequest(id, currentUser);

    // ยืนยันความเป็นเจ้าของแล้ว จึงไม่ต้อง scope ซ้ำ
    return this.update(id, dto, INTERNAL_UNSCOPED);
  }

  async submitMy(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyLeaveRequest(id, currentUser);

    return this.submit(id, currentUser);
  }

  async cancelMy(
    id: string,
    dto: LeaveRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyLeaveRequest(id, currentUser);

    const request = await this.findOne(id, INTERNAL_UNSCOPED);

    // การยกเลิกใบที่ยังรออนุมัติจาก ESS คือการถอนกลับมาแก้ไข
    // จึงต้องคงใบและเลขคำขอเดิมไว้ ไม่เปลี่ยนเป็นประวัติยกเลิกถาวร
    if (request.status === 'SUBMITTED') {
      return this.withdrawSubmittedToDraft(id, dto, currentUser);
    }

    return this.cancel(id, dto, currentUser);
  }

  async findOne(id: string, scope: TenantScope) {
    const scopeWhere = tenantWhere(scope) as Prisma.EmployeeWhereInput;

    const item = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(Object.keys(scopeWhere).length > 0
          ? { employee: { is: scopeWhere } }
          : {}),
      },
      include: this.leaveRequestInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    return item;
  }

  /**
   * สร้างใบลาใหม่
   * - สร้างเป็น DRAFT ก่อนเสมอ
   * - ถ้า dto.submit = true จะส่งเข้ากระบวนการอนุมัติทันที
   */
  async create(
    dto: CreateLeaveRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(dto.employeeId, actorId);
    // พนักงานปลายทางต้องอยู่ในบริษัท/สาขาของผู้สร้าง
    assertWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });
    const leaveType = await this.ensureLeaveTypeIsValid(
      employee.companyId,
      dto.leaveTypeId,
    );

    const startDate = this.parseDateOnly(dto.startDate);
    const endDate = this.parseDateOnly(dto.endDate);
    const dayType = dto.dayType ?? 'FULL_DAY';
    const excludedDateKeys = await this.resolveNonCountedLeaveDates({
      employee,
      leaveType,
      startDate,
      endDate,
    });
    const leaveTiming = this.resolveLeaveTiming({
      leaveType,
      startDate,
      endDate,
      dayType,
      startTime: dto.startTime,
      endTime: dto.endTime,
      retroactiveReason: dto.retroactiveReason,
      excludedDateKeys,
    });

    await this.enforceLeavePolicyRules({
      leaveType,
      employee,
      startDate,
      totalDays: leaveTiming.totalDays,
      isRetroactive: leaveTiming.isRetroactive,
    });

    await this.assertNoOverlappingLeave({
      employeeId: employee.id,
      startDate,
      endDate,
      dayType,
      startTime: leaveTiming.startTime,
      endTime: leaveTiming.endTime,
    });

    const requestNo = await this.generateRequestNo();

    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        requestNo,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        dayType,
        totalDays: leaveTiming.totalDays,
        startTime: leaveTiming.startTime,
        endTime: leaveTiming.endTime,
        totalMinutes: leaveTiming.totalMinutes,
        isRetroactive: leaveTiming.isRetroactive,
        retroactiveReason: leaveTiming.retroactiveReason,
        retroactiveRequestedAt: leaveTiming.isRetroactive ? new Date() : null,
        policySnapshot: leaveTiming.policySnapshot,
        reason: dto.reason.trim(),
        contactInfo: dto.contactInfo?.trim() || null,
        note: dto.note?.trim() || null,
        status: 'DRAFT',
      },
    });

    if (dto.submit) {
      return this.submit(leaveRequest.id, currentUser);
    }

    return this.findOne(leaveRequest.id, INTERNAL_UNSCOPED);
  }

  async update(id: string, dto: UpdateLeaveRequestDto, scope: TenantScope) {
    const current = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            companyId: true,
            branchId: true,
            employeeTypeId: true,
            departmentId: true,
            divisionId: true,
            startDate: true,
            probationPassedAt: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    assertWithinScope(scope, {
      companyId: current.employee.companyId,
      branchId: current.employee.branchId,
    });

    if (current.status !== 'DRAFT') {
      if (current.status === 'SUBMITTED') {
        throw new BadRequestException(
          'ต้องยกเลิกการส่งคำขอก่อนจึงจะแก้ไขใบลาได้',
        );
      }
      throw new BadRequestException('รายการสถานะนี้ไม่สามารถแก้ไขใบลาได้');
    }

    const nextLeaveTypeId = dto.leaveTypeId ?? current.leaveTypeId;

    const leaveType = await this.ensureLeaveTypeIsValid(
      current.employee.companyId,
      nextLeaveTypeId,
    );

    const startDate = dto.startDate
      ? this.parseDateOnly(dto.startDate)
      : current.startDate;

    const endDate = dto.endDate
      ? this.parseDateOnly(dto.endDate)
      : current.endDate;

    const dayType = dto.dayType ?? current.dayType;
    const excludedDateKeys = await this.resolveNonCountedLeaveDates({
      employee: current.employee,
      leaveType,
      startDate,
      endDate,
    });
    const leaveTiming = this.resolveLeaveTiming({
      leaveType,
      startDate,
      endDate,
      dayType,
      startTime:
        dto.startTime === undefined ? current.startTime : dto.startTime,
      endTime: dto.endTime === undefined ? current.endTime : dto.endTime,
      retroactiveReason:
        dto.retroactiveReason === undefined
          ? current.retroactiveReason
          : dto.retroactiveReason,
      excludedDateKeys,
    });

    await this.enforceLeavePolicyRules({
      leaveType,
      employee: current.employee,
      startDate,
      totalDays: leaveTiming.totalDays,
      isRetroactive: leaveTiming.isRetroactive,
    });

    await this.assertNoOverlappingLeave({
      employeeId: current.employeeId,
      excludeId: id,
      startDate,
      endDate,
      dayType,
      startTime: leaveTiming.startTime,
      endTime: leaveTiming.endTime,
    });

    await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        leaveTypeId: nextLeaveTypeId,
        startDate,
        endDate,
        dayType,
        totalDays: leaveTiming.totalDays,
        startTime: leaveTiming.startTime,
        endTime: leaveTiming.endTime,
        totalMinutes: leaveTiming.totalMinutes,
        isRetroactive: leaveTiming.isRetroactive,
        retroactiveReason: leaveTiming.retroactiveReason,
        retroactiveRequestedAt:
          leaveTiming.isRetroactive && !current.retroactiveRequestedAt
            ? new Date()
            : current.retroactiveRequestedAt,
        policySnapshot: leaveTiming.policySnapshot,
        reason: dto.reason?.trim() || undefined,
        contactInfo:
          dto.contactInfo === undefined
            ? undefined
            : dto.contactInfo?.trim() || null,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  /**
   * ส่งใบลาเข้าสายอนุมัติ
   * - ตรวจวันลาคงเหลือ
   * - เพิ่ม pendingDays
   * - สร้าง LeaveApprovalStep จาก Approval Matrix
   */
  async submit(id: string, currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status !== 'DRAFT') {
      throw new BadRequestException('ส่งใบลาได้เฉพาะสถานะร่างเท่านั้น');
    }

    // แบบร่างอาจถูกสร้างไว้ก่อนที่จะมีใบอื่นยื่นทับช่วงเดียวกัน ต้องเช็คซ้ำตอนส่ง
    await this.assertNoOverlappingLeave({
      employeeId: request.employeeId,
      excludeId: id,
      startDate: request.startDate,
      endDate: request.endDate,
      dayType: request.dayType,
      startTime: request.startTime,
      endTime: request.endTime,
    });

    const year = request.startDate.getFullYear();

    await this.prisma.$transaction(async (tx) => {
      const totalDays = Number(request.totalDays);
      const shouldDeductQuota = this.shouldDeductLeaveQuota(request.leaveType);

      if (shouldDeductQuota) {
        // ล็อกแถวโควตาไว้ตลอดธุรกรรม เพื่อให้เช็คกับหักเป็นก้อนเดียวกัน
        const balance = await this.lockBalanceForUpdate(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year,
        });

        const availableDays =
          Number(balance.entitlementDays) +
          Number(balance.carriedForwardDays) +
          Number(balance.adjustedDays) -
          Number(balance.usedDays) -
          Number(balance.pendingDays);

        // เงื่อนไข "ห้ามลาเกินโควตา" — ปิดไว้ = ยอมให้ยอดติดลบ (บันทึกไว้ให้ HR เห็น)
        if (availableDays < totalDays && this.shouldBlockOverQuota(request.leaveType)) {
          throw new BadRequestException(
            `จำนวนวันลาคงเหลือไม่เพียงพอ คงเหลือ ${availableDays.toLocaleString(
              'th-TH',
            )} วัน ต้องการใช้ ${totalDays.toLocaleString('th-TH')} วัน`,
          );
        }
      }

      const approvalMatrix = await this.findApplicableApprovalMatrix(
        tx,
        request.employee,
      );

      if (!approvalMatrix) {
        throw new BadRequestException(
          'ยังไม่ได้ตั้งค่าสายอนุมัติสำหรับใบลานี้ กรุณาตั้งค่า Approval Matrix ก่อน',
        );
      }

      if (shouldDeductQuota) {
        const balance = await this.ensureBalanceForRequest(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year,
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: {
              increment: totalDays,
            },
          },
        });
      }

      // กันกดส่งซ้ำ — ถ้าใบนี้ถูกส่งไปแล้ว โควตาจะถูกกันไว้สองรอบ
      const submitted = await tx.leaveRequest.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          submittedById: actorId,
        },
      });

      if (submitted.count === 0) {
        throw new BadRequestException('ใบลานี้ถูกส่งไปแล้ว กรุณารีเฟรชหน้าจอ');
      }

      await tx.leaveApprovalStep.deleteMany({
        where: {
          leaveRequestId: id,
        },
      });

      await this.createLeaveApprovalSteps(tx, {
        leaveRequestId: id,
        employee: request.employee,
        matrix: approvalMatrix,
      });

      await tx.leaveApprovalLog.create({
        data: {
          leaveRequestId: id,
          action: 'SUBMIT',
          oldStatus: 'DRAFT',
          newStatus: 'SUBMITTED',
          reason: `ส่งใบลาเพื่อขออนุมัติผ่านสายอนุมัติ ${approvalMatrix.nameTh}`,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForLeave(
      request,
      actorId,
      'SUBMIT',
    );

    await this.notifyLeaveSafely('แจ้งเตือนใบลารออนุมัติ', () =>
      this.notificationsService.notifyLeavePendingApproval(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  /**
   * อนุมัติใบลาตาม step ปัจจุบัน
   * - ถ้ามี step ถัดไป จะเลื่อนจาก WAITING เป็น PENDING
   * - ถ้าเป็น step สุดท้าย จะย้าย pendingDays ไป usedDays และเปลี่ยนเป็น APPROVED
   */
  async approve(
    id: string,
    dto: LeaveRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('อนุมัติได้เฉพาะใบลาที่รออนุมัติเท่านั้น');
    }

    /*
     * ห้ามอนุมัติใบลาลงในวันที่ปิดงวด/ส่งเข้าเงินเดือนไปแล้ว
     * สรุปเวลาที่ล็อกจะไม่ถูกคำนวณตามใบลานี้ (ตัวคำนวณข้ามแถวล็อกเสมอ)
     * เงินเดือนที่จ่ายไปแล้วกับใบลาจะขัดกันเองโดยไม่มีอะไรฟ้อง
     */
    await assertDateRangeNotLocked(
      this.prisma as never,
      request.employeeId,
      request.startDate,
      request.endDate,
    );

    /*
     * ห้ามอนุมัติใบลาที่กินเวลาซ้อนกับใบลา APPROVED เดิมของคนเดียวกัน
     * ไม่งั้นโควตาถูกหักซ้ำ และลาไม่รับค่าจ้างจะถูกหักเงินซ้ำ
     * (ตอนยื่นกันไว้ชั้นหนึ่งแล้ว แต่ใบที่ยื่นก่อนกติกานี้ยังค้างอยู่ได้)
     */
    await this.assertNoOverlappingLeave({
      employeeId: request.employeeId,
      excludeId: id,
      startDate: request.startDate,
      endDate: request.endDate,
      dayType: request.dayType,
      startTime: request.startTime,
      endTime: request.endTime,
      statuses: ['APPROVED'],
      action: 'อนุมัติ',
    });

    const totalDays = Number(request.totalDays);
    const shouldDeductQuota = this.shouldDeductLeaveQuota(request.leaveType);

    await this.prisma.$transaction(async (tx) => {
      const currentStep = await this.getCurrentLeaveApprovalStep(tx, id);

      if (!currentStep) {
        throw new BadRequestException('ไม่พบขั้นตอนอนุมัติที่กำลังรอดำเนินการ');
      }

      await this.ensureActorCanActCurrentStep(tx, currentStep, actorId, {
        requesterUserId: request.submittedById,
        subjectEmployeeId: request.employeeId,
      });

      const nextStep = await tx.leaveApprovalStep.findFirst({
        where: {
          leaveRequestId: id,
          status: 'WAITING',
          stepNo: {
            gt: currentStep.stepNo,
          },
        },
        orderBy: {
          stepNo: 'asc',
        },
      });

      /*
       * เช็คสถานะขั้นตอนซ้ำอีกครั้งตอนเขียน โดยผูกไว้กับตัวคำสั่ง update เอง
       *
       * การเช็คก่อนหน้าเกิดคนละจังหวะกับการเขียน ถ้ามีผู้อนุมัติสองคนกดพร้อมกัน
       * ทั้งคู่จะผ่านการเช็คแล้วเดินต่อไปหักโควตาซ้ำสองรอบ
       * เงื่อนไข status ที่ติดไปกับ update ทำให้คนที่มาทีหลังได้ count = 0
       */
      const stepApproved = await tx.leaveApprovalStep.updateMany({
        where: {
          id: currentStep.id,
          status: currentStep.status,
        },
        data: {
          status: 'APPROVED',
          approvedCount: {
            increment: 1,
          },
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      if (stepApproved.count === 0) {
        throw new BadRequestException(
          'ขั้นตอนนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าจอ',
        );
      }

      if (nextStep) {
        await tx.leaveApprovalStep.update({
          where: {
            id: nextStep.id,
          },
          data: {
            status: 'PENDING',
          },
        });

        await tx.leaveApprovalLog.create({
          data: {
            leaveRequestId: id,
            action: 'APPROVE',
            oldStatus: 'SUBMITTED',
            newStatus: 'SUBMITTED',
            reason:
              dto.reason?.trim() ||
              `อนุมัติขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
            note:
              dto.note?.trim() ||
              `ส่งต่อไปยังขั้นตอนที่ ${nextStep.stepNo}: ${nextStep.nameTh}`,
            approvedById: actorId,
          },
        });

        return;
      }

      if (shouldDeductQuota) {
        const balance = await this.ensureBalanceForRequest(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year: request.startDate.getFullYear(),
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: {
              decrement: totalDays,
            },
            usedDays: {
              increment: totalDays,
            },
          },
        });
      }

      const approved = await tx.leaveRequest.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
        },
      });

      if (approved.count === 0) {
        throw new BadRequestException('ใบลานี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าจอ');
      }

      await tx.leaveApprovalLog.create({
        data: {
          leaveRequestId: id,
          action: 'APPROVE',
          oldStatus: 'SUBMITTED',
          newStatus: 'APPROVED',
          reason:
            dto.reason?.trim() ||
            `อนุมัติครบทุกขั้นตอน ขั้นตอนสุดท้าย: ${currentStep.nameTh}`,
          note: dto.note?.trim() || null,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForLeave(
      request,
      actorId,
      'APPROVE',
    );

    await this.notifyLeaveSafely('อัปเดตแจ้งเตือนหลังอนุมัติใบลา', async () => {
      await this.notificationsService.closeLeavePendingNotifications(id);

      const latest = await this.prisma.leaveRequest.findFirst({
        where: { id, deletedAt: null },
        select: { status: true },
      });

      if (latest?.status === 'SUBMITTED') {
        await this.notificationsService.notifyLeavePendingApproval(id);
      }

      if (latest?.status === 'APPROVED') {
        await this.notificationsService.notifyLeaveApproved(id);
      }
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  /**
   * ไม่อนุมัติใบลา
   * - ลด pendingDays กลับ
   * - ปิด step ที่เหลือเป็น CANCELLED
   * - เปลี่ยนใบลาเป็น REJECTED
   */
  async reject(
    id: string,
    dto: LeaveRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'ไม่อนุมัติได้เฉพาะใบลาที่รออนุมัติเท่านั้น',
      );
    }

    const totalDays = Number(request.totalDays);
    const shouldDeductQuota = this.shouldDeductLeaveQuota(request.leaveType);

    await this.prisma.$transaction(async (tx) => {
      const currentStep = await this.getCurrentLeaveApprovalStep(tx, id);

      if (!currentStep) {
        throw new BadRequestException('ไม่พบขั้นตอนอนุมัติที่กำลังรอดำเนินการ');
      }

      await this.ensureActorCanActCurrentStep(tx, currentStep, actorId, {
        requesterUserId: request.submittedById,
        subjectEmployeeId: request.employeeId,
      });

      if (shouldDeductQuota) {
        const balance = await this.ensureBalanceForRequest(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year: request.startDate.getFullYear(),
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: {
              decrement: totalDays,
            },
          },
        });
      }

      await tx.leaveApprovalStep.update({
        where: {
          id: currentStep.id,
        },
        data: {
          status: 'REJECTED',
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      await tx.leaveApprovalStep.updateMany({
        where: {
          leaveRequestId: id,
          status: {
            in: ['WAITING', 'PENDING'],
          },
          id: {
            not: currentStep.id,
          },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
        },
      });

      await tx.leaveApprovalLog.create({
        data: {
          leaveRequestId: id,
          action: 'REJECT',
          oldStatus: 'SUBMITTED',
          newStatus: 'REJECTED',
          reason:
            dto.reason?.trim() ||
            `ไม่อนุมัติในขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note: dto.note?.trim() || null,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForLeave(
      request,
      actorId,
      'REJECT',
    );

    await this.notifyLeaveSafely('แจ้งเตือนใบลาถูกปฏิเสธ', async () => {
      await this.notificationsService.closeLeavePendingNotifications(id);
      await this.notificationsService.notifyLeaveRejected(id);
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  /**
   * ส่งกลับใบลาให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่
   * - ใช้เมื่อตรวจพบว่าข้อมูลหรือหลักฐานยังไม่ครบถ้วน
   * - คืน pendingDays กลับ เพราะคำขอจะกลับไปเป็น DRAFT
   * - ปิดขั้นตอนอนุมัติที่ยังรอดำเนินการ เพื่อรอสร้างใหม่ตอน submit รอบถัดไป
   */
  async returnForReview(
    id: string,
    dto: LeaveRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'ส่งกลับให้ตรวจสอบใหม่ได้เฉพาะใบลาที่รออนุมัติเท่านั้น',
      );
    }

    const totalDays = Number(request.totalDays);
    const shouldDeductQuota = this.shouldDeductLeaveQuota(request.leaveType);

    await this.prisma.$transaction(async (tx) => {
      const currentStep = await this.getCurrentLeaveApprovalStep(tx, id);

      if (!currentStep) {
        throw new BadRequestException('ไม่พบขั้นตอนอนุมัติที่กำลังรอดำเนินการ');
      }

      await this.ensureActorCanActCurrentStep(tx, currentStep, actorId, {
        requesterUserId: request.submittedById,
        subjectEmployeeId: request.employeeId,
      });

      if (shouldDeductQuota) {
        const balance = await this.ensureBalanceForRequest(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year: request.startDate.getFullYear(),
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: {
              decrement: totalDays,
            },
          },
        });
      }

      await tx.leaveApprovalStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'CANCELLED',
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      await tx.leaveApprovalStep.updateMany({
        where: {
          leaveRequestId: id,
          status: {
            in: ['WAITING', 'PENDING'],
          },
          id: {
            not: currentStep.id,
          },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'DRAFT',
          submittedAt: null,
          submittedById: null,
          approvedAt: null,
          rejectedAt: null,
          cancelledAt: null,
          cancelledById: null,
        },
      });

      await tx.leaveApprovalLog.create({
        data: {
          leaveRequestId: id,
          action: 'CANCEL',
          oldStatus: 'SUBMITTED',
          newStatus: 'DRAFT',
          reason:
            dto.reason?.trim() ||
            `ส่งกลับให้ตรวจสอบใหม่ในขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note:
            dto.note?.trim() ||
            'ผู้ยื่นสามารถแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่ได้',
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForLeave(
      request,
      actorId,
      'RETURN_FOR_REVIEW',
    );

    await this.notifyLeaveSafely(
      'แจ้งเตือนใบลาถูกส่งกลับให้ตรวจสอบ',
      async () => {
        await this.notificationsService.closeLeavePendingNotifications(id);
        await this.notificationsService.notifyLeaveReturnedForReview(id);
      },
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  /**
   * ถอนใบลาที่ส่งแล้วกลับเป็นร่าง สำหรับ ESS
   * - ใช้เมื่อผู้ยื่นต้องการแก้ไขหรือลบใบลาที่ส่งไปแล้ว
   * - คืน pendingDays และปิดขั้นตอนอนุมัติเดิม
   */
  async withdrawSubmittedToDraft(
    id: string,
    dto: LeaveRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'ยกเลิกการส่งได้เฉพาะใบลาที่รออนุมัติเท่านั้น',
      );
    }

    const totalDays = Number(request.totalDays);
    const shouldDeductQuota = this.shouldDeductLeaveQuota(request.leaveType);

    await this.prisma.$transaction(async (tx) => {
      if (shouldDeductQuota) {
        const balance = await this.ensureBalanceForRequest(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year: request.startDate.getFullYear(),
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: {
              decrement: totalDays,
            },
          },
        });
      }

      await tx.leaveApprovalStep.updateMany({
        where: {
          leaveRequestId: id,
          status: {
            in: ['WAITING', 'PENDING'],
          },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'DRAFT',
          submittedAt: null,
          submittedById: null,
        },
      });

      await tx.leaveApprovalLog.create({
        data: {
          leaveRequestId: id,
          action: 'CANCEL',
          oldStatus: 'SUBMITTED',
          newStatus: 'DRAFT',
          reason:
            dto.reason?.trim() ||
            'ผู้ยื่นยกเลิกการส่งคำขอเพื่อกลับไปแก้ไขหรือลบใบลา',
          note: dto.note?.trim() || 'ใบลาถูกถอนออกจากคิวอนุมัติและกลับเป็นร่าง',
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForLeave(
      request,
      actorId,
      'WITHDRAW_TO_DRAFT',
    );

    await this.notifyLeaveSafely('ปิดแจ้งเตือนใบลาที่ถูกถอนกลับเป็นร่าง', () =>
      this.notificationsService.closeLeavePendingNotifications(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  /**
   * ยกเลิกใบลา
   * - ถ้ายัง SUBMITTED จะคืน pendingDays
   * - ถ้า APPROVED แล้วจะคืน usedDays
   */
  async cancel(
    id: string,
    dto: LeaveRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status === 'CANCELLED') {
      throw new BadRequestException('ใบลานี้ถูกยกเลิกแล้ว');
    }

    if (request.status === 'REJECTED') {
      throw new BadRequestException('ใบลาที่ไม่อนุมัติแล้วไม่จำเป็นต้องยกเลิก');
    }

    /*
     * ใบลาที่อนุมัติแล้วและถูกใช้คิดเงินงวดที่ปิดไปแล้ว ยกเลิกไม่ได้
     * ไม่งั้นยอดหัก/ยอดจ่ายที่จ่ายจริงไปแล้วจะไม่มีใบลารองรับ
     * (ใบลาสถานะร่าง/รออนุมัติไม่กระทบเงิน ยกเลิกได้ตามปกติ)
     */
    if (request.status === 'APPROVED') {
      await assertDateRangeNotLocked(
        this.prisma as never,
        request.employeeId,
        request.startDate,
        request.endDate,
      );
    }

    const totalDays = Number(request.totalDays);
    const shouldDeductQuota = this.shouldDeductLeaveQuota(request.leaveType);

    await this.prisma.$transaction(async (tx) => {
      if (shouldDeductQuota && request.status === 'SUBMITTED') {
        const balance = await this.ensureBalanceForRequest(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year: request.startDate.getFullYear(),
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: {
              decrement: totalDays,
            },
          },
        });
      }

      if (shouldDeductQuota && request.status === 'APPROVED') {
        const balance = await this.ensureBalanceForRequest(tx, {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          companyId: request.employee.companyId,
          branchId: request.employee.branchId,
          employeeTypeId: request.employee.employeeTypeId,
          year: request.startDate.getFullYear(),
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            usedDays: {
              decrement: totalDays,
            },
          },
        });
      }

      await tx.leaveApprovalStep.updateMany({
        where: {
          leaveRequestId: id,
          status: {
            in: ['WAITING', 'PENDING'],
          },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actorId,
        },
      });

      await tx.leaveApprovalLog.create({
        data: {
          leaveRequestId: id,
          action: 'CANCEL',
          oldStatus: request.status,
          newStatus: 'CANCELLED',
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForLeave(
      request,
      actorId,
      'CANCEL',
    );

    await this.notifyLeaveSafely('ปิดแจ้งเตือนใบลาที่ถูกยกเลิก', () =>
      this.notificationsService.closeLeavePendingNotifications(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async remove(id: string, currentUser: CurrentUserLike) {
    return this.cancel(
      id,
      {
        reason: 'ยกเลิกใบลาจากระบบ',
      },
      currentUser,
    );
  }

  private async enqueueAttendanceRecalculationForLeave(
    request: {
      id: string;
      employeeId: string;
      startDate: Date;
      endDate: Date;
    },
    actorId: string,
    sourceAction: string,
  ) {
    await this.attendanceRecalculation.enqueueDateRange({
      employeeId: request.employeeId,
      startDate: request.startDate,
      endDate: request.endDate,
      requestedById: actorId,
      sourceType: 'LEAVE_REQUEST',
      sourceId: request.id,
      sourceAction,
    });
  }

  private notifyLeaveSafely(
    actionDescription: string,
    callback: () => Promise<unknown>,
  ) {
    void Promise.resolve()
      .then(callback)
      .catch((error) => {
        console.error(
          `[LeaveNotification] ${actionDescription} ไม่สำเร็จ`,
          error,
        );
      });
  }

  /**
   * include สำหรับ response ของใบลา
   * แยกไปไว้ helper เพื่อให้ findAll/findOne ใช้ shape เดียวกัน
   */
  private leaveRequestInclude() {
    return buildLeaveRequestInclude();
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    }

    return actorId;
  }
  private async resolveCurrentEmployee(currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    return this.resolveEmployee(undefined, actorId);
  }

  private async ensureMyLeaveRequest(
    leaveRequestId: string,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveCurrentEmployee(currentUser);

    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id: leaveRequestId,
        employeeId: employee.id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!request) {
      throw new NotFoundException(
        'ไม่พบใบลาของคุณ หรือไม่มีสิทธิ์เข้าถึงรายการนี้',
      );
    }

    return request;
  }

  private async resolveEmployee(
    employeeId: string | undefined,
    actorId: string,
  ) {
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          deletedAt: null,
          status: {
            notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
          },
        },
      });

      if (!employee) {
        throw new NotFoundException('ไม่พบพนักงาน หรือพนักงานไม่พร้อมใช้งาน');
      }

      return employee;
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
        status: {
          notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถยื่นลาเองได้',
      );
    }

    return employee;
  }

  /**
   * บังคับใช้เงื่อนไขที่ตั้งไว้ในหน้า ตั้งค่า > นโยบายการทำงาน > การลา
   * - เพศที่ใช้สิทธิ์ได้ / ต้องผ่านการบรรจุก่อน / ลาล่วงหน้ากี่วัน  (ระดับประเภทลา)
   * - ลาติดต่อกันสูงสุด                                             (ระดับนโยบายของขอบเขต)
   */
  private async enforceLeavePolicyRules(params: {
    leaveType: {
      id: string;
      nameTh: string;
      // ต้องส่งต่อไปให้ตัวตรวจสิทธิ์ ใช้ระบุสิทธิลาตามกฎหมายที่การตั้งค่าเอาชนะไม่ได้
      code?: string | null;
      referenceCode?: string | null;
      advanceNoticeDays: number;
      genderEligibility: 'ALL' | 'MALE' | 'FEMALE';
      serviceStartBasis: 'HIRE_DATE' | 'PROBATION_PASS_DATE';
      requireProbationPassed: boolean;
      prorateFirstYear: boolean;
      enforceQuotaLimit: boolean;
      quotaAccrualYears: number;
    };
    employee: {
      id: string;
      companyId: string;
      branchId: string | null;
      employeeTypeId: string | null;
      startDate: Date;
      probationPassedAt: Date | null;
    };
    startDate: Date;
    totalDays: number;
    isRetroactive: boolean;
  }) {
    // เพศอยู่ที่ EmployeeProfile ดึงเฉพาะตอนที่ประเภทลาจำกัดเพศจริง ๆ
    const profile =
      params.leaveType.genderEligibility === 'ALL'
        ? null
        : await this.prisma.employeeProfile.findUnique({
            where: { employeeId: params.employee.id },
            select: { gender: true },
          });

    this.leavePolicyResolver.assertEligible({
      leaveType: params.leaveType,
      employee: { ...params.employee, profile },
      startDate: params.startDate,
      isRetroactive: params.isRetroactive,
    });

    const policy = await this.leavePolicyResolver.resolvePolicy(this.prisma, {
      companyId: params.employee.companyId,
      branchId: params.employee.branchId,
      employeeTypeId: params.employee.employeeTypeId,
      leaveTypeId: params.leaveType.id,
    });

    if (policy) {
      this.leavePolicyResolver.assertWithinConsecutiveLimit({
        leaveTypeName: params.leaveType.nameTh,
        policy,
        totalDays: params.totalDays,
      });
    }
  }

  /**
   * ห้ามยื่น/อนุมัติใบลาที่กินเวลาซ้อนกับใบลาอื่นของคนเดียวกัน
   *
   * ค่าเริ่มต้นเทียบกับใบที่ "ยื่นแล้ว" (รออนุมัติ + อนุมัติแล้ว) — ใบที่ยังไม่อนุมัติ
   * ก็จองช่วงเวลานั้นไว้แล้ว ถ้าปล่อยให้ยื่นทับกัน หัวหน้าต้องมานั่งไล่ว่าใบไหนตัวจริง
   * ส่วนแบบร่างไม่นับ เพราะยังไม่ได้ยื่น และจะถูกกันอีกทีตอนกดส่ง
   *
   * ครึ่งเช้า+ครึ่งบ่าย หรือรายชั่วโมงคนละช่วง เป็นเคสถูกกติกา ไม่ติดด่านนี้
   * (ดู leaveSlicesConflict)
   */
  private async assertNoOverlappingLeave(params: {
    employeeId: string;
    excludeId?: string;
    startDate: Date;
    endDate: Date;
    dayType: string | null | undefined;
    startTime?: string | null;
    endTime?: string | null;
    statuses?: Array<'SUBMITTED' | 'APPROVED'>;
    action?: string;
  }) {
    const statuses = params.statuses ?? ['SUBMITTED', 'APPROVED'];

    const others = await this.prisma.leaveRequest.findMany({
      where: {
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
        employeeId: params.employeeId,
        status: { in: statuses },
        deletedAt: null,
        startDate: { lte: params.endDate },
        endDate: { gte: params.startDate },
      },
      select: {
        requestNo: true,
        status: true,
        dayType: true,
        startTime: true,
        endTime: true,
      },
    });

    const conflict = others.find((other) =>
      leaveSlicesConflict(
        {
          dayType: params.dayType,
          startTime: params.startTime,
          endTime: params.endTime,
        },
        other,
      ),
    );
    if (!conflict) return;

    const statusLabel =
      conflict.status === 'APPROVED' ? 'อนุมัติแล้ว' : 'รออนุมัติ';
    throw new BadRequestException(
      `ช่วงวันที่นี้มีใบลาอยู่แล้ว (${conflict.requestNo ?? 'ไม่มีเลขที่'} · ${statusLabel}) ` +
        `ต้องยกเลิกใบเดิมก่อน จึงจะ${params.action ?? 'ยื่น'}ใบนี้ได้`,
    );
  }

  private async ensureLeaveTypeIsValid(companyId: string, leaveTypeId: string) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: leaveTypeId,
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
      },
    });

    if (!leaveType) {
      throw new NotFoundException(
        'ไม่พบประเภทการลา หรือประเภทการลาไม่พร้อมใช้งาน',
      );
    }

    return leaveType;
  }

  private shouldDeductLeaveQuota(leaveType: { deductQuota?: boolean | null }) {
    return leaveType.deductQuota !== false;
  }

  /**
   * เงื่อนไข "ห้ามลาเกินโควตา" จากหน้านโยบายการทำงาน
   *
   * true  = โควตาหมดแล้วยื่นไม่ได้ (ค่าเริ่มต้น และเป็นพฤติกรรมเดิมของระบบ)
   * false = ยื่นได้ ยอดคงเหลือจะติดลบ ให้ HR ตามปรับยอดทีหลัง
   *
   * ใช้ enforceQuotaLimit เป็นสวิตช์เดียว ให้ตรงกับที่เห็นในหน้าตั้งค่า
   * ส่วน negativeBalanceMode ถูก sync ตามสวิตช์นี้ตอนบันทึกนโยบาย
   * (ยังไม่รองรับ CONVERT_TO_UNPAID เพราะต้องแตะสายคำนวณเงินเดือนด้วย)
   */
  private shouldBlockOverQuota(leaveType: {
    enforceQuotaLimit?: boolean | null;
  }) {
    return leaveType.enforceQuotaLimit !== false;
  }

  /**
   * ล็อกแถวโควตาลาแล้วอ่านค่าล่าสุด — ต้องใช้ทุกครั้งก่อนเช็คหรือหักโควตา
   *
   * เดิมเป็น อ่าน → เช็ค → หัก โดยไม่ล็อกแถว พนักงานที่เหลือโควตา 1 วัน
   * กดส่งใบลา 2 ใบพร้อมกันจะอ่านยอดเดียวกันทั้งคู่ ผ่านการเช็คทั้งคู่
   * แล้วหักซ้อนกันจนติดลบ เช่นเดียวกับตอนอนุมัติที่หัก pending/used ซ้ำได้
   *
   * FOR UPDATE ทำให้ธุรกรรมที่สองรอจนตัวแรก commit แล้วค่อยอ่านค่าที่หักไปแล้ว
   */
  private async lockBalanceForUpdate(
    tx: Prisma.TransactionClient,
    params: {
      employeeId: string;
      leaveTypeId: string;
      companyId: string;
      branchId: string | null;
      employeeTypeId: string | null;
      year: number;
    },
  ) {
    // สร้างแถวให้ก่อนถ้ายังไม่มี — ล็อกแถวที่ไม่มีตัวตนไม่ได้
    const balance = await this.ensureBalanceForRequest(tx, params);

    await tx.$queryRaw`SELECT id FROM leave_balances WHERE id = ${balance.id} FOR UPDATE`;

    // อ่านซ้ำใต้ล็อก เพื่อให้ได้ค่าที่ธุรกรรมอื่นเพิ่งหักไป
    const locked = await tx.leaveBalance.findUnique({
      where: { id: balance.id },
    });

    return locked ?? balance;
  }

  private async ensureBalanceForRequest(
    tx: Prisma.TransactionClient,
    params: {
      employeeId: string;
      leaveTypeId: string;
      companyId: string;
      branchId: string | null;
      employeeTypeId: string | null;
      year: number;
    },
  ) {
    const current = await tx.leaveBalance.findFirst({
      where: {
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        year: params.year,
      },
    });

    if (current) {
      return current;
    }

    const policy = await this.leavePolicyResolver.resolvePolicy(tx, {
      companyId: params.companyId,
      branchId: params.branchId,
      employeeTypeId: params.employeeTypeId,
      leaveTypeId: params.leaveTypeId,
    });

    if (!policy) {
      throw new BadRequestException('ยังไม่พบนโยบายวันลาของพนักงานคนนี้');
    }

    const [leaveType, employee] = await Promise.all([
      tx.leaveType.findUnique({
        where: { id: params.leaveTypeId },
        // code/referenceCode ใช้ระบุสิทธิลาตามกฎหมายที่ต้องนับอายุงานจากวันเริ่มงานเสมอ
        select: {
          serviceStartBasis: true,
          requireProbationPassed: true,
          prorateFirstYear: true,
          code: true,
          referenceCode: true,
        },
      }),
      tx.employee.findUnique({
        where: { id: params.employeeId },
        select: { startDate: true, probationPassedAt: true },
      }),
    ]);

    // โควตาตาม "ระยะเวลาทำงาน / โควตา" ของพนักงานคนนี้ ณ สิ้นปีสิทธิ์
    const entitlementDays =
      leaveType && employee
        ? this.leavePolicyResolver.resolveQuotaDays(
            policy,
            leaveType,
            employee,
            new Date(params.year, 11, 31),
          ).quotaDays
        : Number(policy.annualQuotaDays);

    return tx.leaveBalance.create({
      data: {
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        year: params.year,
        entitlementDays,
        carriedForwardDays: 0,
        adjustedDays: 0,
        usedDays: 0,
        pendingDays: 0,
      },
    });
  }

  private async findApplicableApprovalMatrix(
    tx: Prisma.TransactionClient,
    employee: {
      companyId: string;
      branchId: string | null;
      departmentId: string | null;
      employeeTypeId: string | null;
    },
  ) {
    /*
     * ใช้ resolver กลางเพื่อให้การเลือก Approval Matrix ของใบลา
     * ใช้กติกาเดียวกับ OT และ Time Adjust
     */
    return this.approvalMatrixResolver.findApplicableMatrix(tx, {
      targetType: 'LEAVE_REQUEST',
      employee,
    });
  }

  private async createLeaveApprovalSteps(
    tx: Prisma.TransactionClient,
    params: {
      leaveRequestId: string;
      employee: Prisma.EmployeeGetPayload<{}>;
      matrix: Prisma.ApprovalMatrixGetPayload<{
        include: {
          steps: true;
        };
      }>;
    },
  ) {
    const resolvedSteps = await this.approvalMatrixResolver.resolveSteps(tx, {
      employee: params.employee,
      matrix: params.matrix,
    });

    for (let index = 0; index < resolvedSteps.length; index += 1) {
      const resolvedStep = resolvedSteps[index];
      const step = resolvedStep.step;

      await tx.leaveApprovalStep.create({
        data: {
          leaveRequestId: params.leaveRequestId,
          matrixId: params.matrix.id,
          matrixStepId: step.id,
          stepNo: step.stepNo,
          nameTh: step.nameTh,
          description: step.description,
          approverType: step.approverType,
          expectedApproverId: resolvedStep.expectedApproverId,
          expectedEmployeeId: resolvedStep.expectedEmployeeId,
          positionId: step.positionId,
          roleCode: step.roleCode,
          minApproverCount: step.minApproverCount || 1,
          status: index === 0 ? 'PENDING' : 'WAITING',
        },
      });
    }
  }

  private async getCurrentLeaveApprovalStep(
    tx: Prisma.TransactionClient,
    leaveRequestId: string,
  ) {
    return tx.leaveApprovalStep.findFirst({
      where: {
        leaveRequestId,
        status: 'PENDING',
      },
      orderBy: {
        stepNo: 'asc',
      },
      include: {
        expectedApprover: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        expectedEmployee: {
          select: {
            id: true,
            employeeCode: true,
            nickname: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
      },
    });
  }

  private async ensureActorCanActCurrentStep(
    tx: Prisma.TransactionClient,
    currentStep: {
      id: string;
      expectedApproverId: string | null;
      expectedEmployeeId: string | null;
      nameTh: string;
      stepNo: number;
      roleCode: string | null;
      expectedApprover?: {
        id: string;
        email: string;
        displayName: string | null;
      } | null;
      expectedEmployee?: {
        id: string;
        employeeCode: string;
        firstName: string;
        lastName: string;
        displayName: string | null;
        userId: string | null;
      } | null;
    },
    actorId: string,
    owner?: ApprovalRequestOwner,
  ) {
    const actorEmployee = await tx.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
        status: {
          notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    /*
     * กันอนุมัติใบลาของตัวเอง — ต้องเช็คก่อนทุกทางลัด
     * หัวหน้างานและเจ้าหน้าที่ HR ก็เป็นลูกจ้างที่ยื่นใบลาเหมือนกัน
     * และมักถูกผูกเป็นผู้อนุมัติของสายงานตัวเองด้วย
     */
    const actorRoleCodes = await loadActorRoleCodes(tx, actorId);

    /* ฝ่ายบุคคลอนุมัติของตัวเองได้ — นิยามเดียวกับ canActOnApprovalStep */
    if (
      isOwnRequest(owner, actorId, actorEmployee?.id ?? null) &&
      !canApproveOwnRequest(actorRoleCodes)
    ) {
      throw new BadRequestException(
        'ไม่สามารถอนุมัติหรือไม่อนุมัติใบลาของตนเองได้',
      );
    }

    if (currentStep.expectedApproverId === actorId) {
      return;
    }

    if (
      actorEmployee?.id &&
      currentStep.expectedEmployeeId === actorEmployee.id
    ) {
      return;
    }

    if (
      currentStep.expectedEmployee?.userId &&
      currentStep.expectedEmployee.userId === actorId
    ) {
      return;
    }

    // ผู้อนุมัติตัวจริงไม่อยู่ ให้คนที่รับมอบอำนาจกดแทนได้
    const delegations = await loadActiveDelegations(
      tx,
      actorId,
      'LEAVE_REQUEST',
    );

    if (
      canActOnApprovalStep({
        step: currentStep,
        actorId,
        actorRoleCodes,
        owner,
        actorEmployeeId: actorEmployee?.id ?? null,
        delegatedFromUserIds: delegatedUserIds(delegations),
      })
    ) {
      return;
    }

    const expectedName =
      currentStep.expectedEmployee?.displayName ||
      [
        currentStep.expectedEmployee?.firstName,
        currentStep.expectedEmployee?.lastName,
      ]
        .filter(Boolean)
        .join(' ') ||
      currentStep.expectedApprover?.displayName ||
      currentStep.expectedApprover?.email ||
      'ผู้อนุมัติที่ระบบกำหนด';

    throw new BadRequestException(
      `คุณไม่ใช่ผู้อนุมัติของขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh} ผู้อนุมัติที่ถูกต้องคือ ${expectedName}`,
    );
  }

  private async actorCanViewAllApprovalSteps(actorId: string) {
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        deletedAt: null,
        roles: {
          some: {
            role: {
              code: {
                in: ['ADMIN', 'SUPER_ADMIN'],
              },
              isActive: true,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(actor);
  }

  private async generateRequestNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const prefix = `LV-${year}${month}${day}`;

    const count = await this.prisma.leaveRequest.count({
      where: {
        requestNo: {
          startsWith: prefix,
        },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  /**
   * wrapper คงชื่อ method เดิมไว้เพื่อลดผลกระทบต่อโค้ดส่วนอื่น
   * แต่ย้าย logic จริงไปไว้ utils/leave-date.util.ts แล้ว
   */
  private parseDateOnly(value: string | Date) {
    return parseLeaveDateOnly(value);
  }

  /**
   * ตรวจช่วงวันที่ลา ผ่าน util กลาง
   */

  private resolveLeaveTiming(params: {
    leaveType: any;
    startDate: Date;
    endDate: Date;
    dayType: LeaveDayType;
    startTime?: string | null;
    endTime?: string | null;
    retroactiveReason?: string | null;
    /** วันที่ไม่นับเป็นวันลา (วันหยุดที่ประเภทลากำหนดให้ข้าม) */
    excludedDateKeys?: ReadonlySet<string> | null;
  }) {
    this.validateDateRange(params.startDate, params.endDate, params.dayType);

    let totalMinutes = 0;
    let requestedLeaveMinutes = 0;
    let startTime: string | null = null;
    let endTime: string | null = null;

    // เงื่อนไข "การปัดเศษเวลาลา" ของประเภทลา — NONE = คิดตามนาทีจริงเหมือนเดิม
    const roundingMode: LeaveRoundingMode =
      (params.leaveType as { roundingMode?: LeaveRoundingMode | null })
        .roundingMode ?? 'NONE';
    const workingMinutesPerDay = DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY;

    if (params.dayType === 'HOURLY') {
      if (!params.leaveType.allowHourly) {
        throw new BadRequestException(
          'ประเภทการลานี้ยังไม่อนุญาตให้ลารายชั่วโมง',
        );
      }

      if (!params.startTime || !params.endTime) {
        throw new BadRequestException('กรุณาระบุเวลาเริ่มลาและเวลาสิ้นสุดลา');
      }

      requestedLeaveMinutes =
        parseLeaveTimeToMinutes(params.endTime) -
        parseLeaveTimeToMinutes(params.startTime);
      totalMinutes = calculateHourlyLeaveMinutes(
        params.startTime,
        params.endTime,
        roundingMode,
        workingMinutesPerDay,
      );

      const minLeaveUnitMinutes = Number(
        params.leaveType.minLeaveUnitMinutes ?? 60,
      );
      if (minLeaveUnitMinutes > 0 && totalMinutes < minLeaveUnitMinutes) {
        throw new BadRequestException(
          `ลารายชั่วโมงต้องไม่น้อยกว่า ${minLeaveUnitMinutes.toLocaleString('th-TH')} นาที`,
        );
      }

      startTime = params.startTime;
      endTime = params.endTime;
    } else if (
      params.dayType === 'HALF_DAY_MORNING' ||
      params.dayType === 'HALF_DAY_AFTERNOON'
    ) {
      if (!params.leaveType.allowHalfDay) {
        throw new BadRequestException(
          'ประเภทการลานี้ยังไม่อนุญาตให้ลาครึ่งวัน',
        );
      }

      totalMinutes = Math.round(workingMinutesPerDay / 2);
    } else {
      const fullDayCount = this.calculateTotalDays(
        params.startDate,
        params.endDate,
        params.dayType,
        0,
        workingMinutesPerDay,
        params.excludedDateKeys,
      );

      if (fullDayCount <= 0) {
        throw new BadRequestException(
          'ช่วงที่เลือกเป็นวันหยุดทั้งหมด จึงไม่มีวันลาที่ต้องใช้สิทธิ์',
        );
      }

      totalMinutes = Math.round(fullDayCount * workingMinutesPerDay);
    }

    const totalDays = this.calculateTotalDays(
      params.startDate,
      params.endDate,
      params.dayType,
      totalMinutes,
      workingMinutesPerDay,
      params.excludedDateKeys,
    );

    const isRetroactive = this.isRetroactiveLeave(params.startDate);
    const retroactiveReason = params.retroactiveReason?.trim() || null;

    if (isRetroactive) {
      if (!params.leaveType.allowBackdated) {
        throw new BadRequestException(
          'ประเภทการลานี้ยังไม่อนุญาตให้ลาย้อนหลัง',
        );
      }

      const maxBackdatedDays = Number(params.leaveType.maxBackdatedDays ?? 0);
      const backdatedDays = this.countBackdatedDays(params.startDate);
      if (maxBackdatedDays > 0 && backdatedDays > maxBackdatedDays) {
        throw new BadRequestException(
          `ประเภทการลานี้อนุญาตให้ลาย้อนหลังได้ไม่เกิน ${maxBackdatedDays.toLocaleString('th-TH')} วัน`,
        );
      }

    }

    return {
      totalDays,
      totalMinutes,
      startTime,
      endTime,
      isRetroactive,
      retroactiveReason: isRetroactive ? retroactiveReason : null,
      policySnapshot: {
        leaveTypeId: params.leaveType.id,
        leaveTypeCode: params.leaveType.code,
        leaveTypeName: params.leaveType.nameTh,
        isPaid: Boolean(params.leaveType.isPaid),
        allowHalfDay: Boolean(params.leaveType.allowHalfDay),
        allowHourly: Boolean(params.leaveType.allowHourly),
        allowBackdated: Boolean(params.leaveType.allowBackdated),
        maxBackdatedDays: Number(params.leaveType.maxBackdatedDays ?? 0),
        minLeaveUnitMinutes: Number(
          params.leaveType.minLeaveUnitMinutes ?? 240,
        ),
        // เก็บโหมดปัดเศษที่ใช้ตอนยื่น เพื่อให้ตรวจย้อนหลังได้ว่าตัวเลขมาจากกติกาไหน
        roundingMode,
        workingMinutesPerDay,
        dayType: params.dayType,
        requestWindowMinutes: requestedLeaveMinutes || totalMinutes,
        chargeableWorkingMinutes: totalMinutes,
        totalMinutes,
        totalDays,
      },
    };
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private isRetroactiveLeave(startDate: Date) {
    return (
      this.toDateKey(startDate) < this.toDateKey(this.parseDateOnly(new Date()))
    );
  }

  private countBackdatedDays(startDate: Date) {
    const today = this.parseDateOnly(new Date());
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.max(
      Math.floor((today.getTime() - startDate.getTime()) / msPerDay),
      0,
    );
  }

  private validateDateRange(
    startDate: Date,
    endDate: Date,
    dayType: LeaveDayType,
  ) {
    return validateLeaveDateRange(startDate, endDate, dayType);
  }

  /**
   * คำนวณจำนวนวันลา ผ่าน util กลาง
   */
  private calculateTotalDays(
    startDate: Date,
    endDate: Date,
    dayType: LeaveDayType,
    totalMinutes = 0,
    workingMinutesPerDay = DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY,
    excludedDateKeys?: ReadonlySet<string> | null,
  ) {
    return calculateLeaveTotalDays(
      startDate,
      endDate,
      dayType,
      totalMinutes,
      workingMinutesPerDay,
      excludedDateKeys,
    );
  }
}
