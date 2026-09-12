import { ForbiddenException, Injectable } from '@nestjs/common';

import {
  AttendanceLogStatus,
  AttendanceLogType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SystemSettingsService } from '../settings/system-settings.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { thaiToday, toThaiDateKey } from '../../common/utils/thai-date.util';

type ManagerQuery = Record<string, string | undefined>;

type Pagination = {
  page: number;
  pageSize: number;
  skip: number;
};

@Injectable()
export class ManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  async getDashboard(currentUser: AuthenticatedUser) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.findDirectTeamIds(manager.id);
    const today = thaiToday();

    const teamWhere = this.buildTeamEmployeeWhere(manager.id);
    const attendanceTodayWhere: Prisma.AttendanceLogWhereInput = {
      employeeId: { in: teamIds },
      workDate: today,
      deletedAt: null,
    };
    const pendingLeaveWhere: Prisma.LeaveRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      status: 'SUBMITTED' as never,
    };
    const pendingOvertimeWhere: Prisma.OvertimeRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      status: 'SUBMITTED' as never,
    };
    const pendingTimeAdjustWhere: Prisma.TimeAdjustRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      status: 'SUBMITTED' as never,
    };
    const pendingOffsiteWhere: Prisma.OffsiteWorkRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      status: 'SUBMITTED' as never,
    };
    const monthStart = this.toDateOnly(
      new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10),
    );
    const weekStart = this.addDays(today, -6);
    const nextWeekEnd = this.addDays(today, 7);

    const [
      team,
      teamTotal,
      attendanceLogs,
      dailyAttendanceSummaries,
      checkedInRows,
      lateRows,
      leaveRequests,
      overtimeRequests,
      timeAdjustRequests,
      pendingLeaveCount,
      pendingOvertimeCount,
      pendingTimeAdjustCount,
      pendingOffsiteCount,
      todayOnLeaveCount,
      todayOffsiteCount,
      weeklyAttendanceLogs,
      upcomingLeaves,
      approvedOvertimeMonth,
      lateLogsLast30Days,
      oldLeavePendingCount,
      oldOvertimePendingCount,
      oldTimeAdjustPendingCount,
      oldOffsitePendingCount,
    ] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where: teamWhere,
        take: 8,
        orderBy: [
        // ผู้บริหารขึ้นก่อน (ระดับตำแหน่ง 1 = สูงสุด) แล้วค่อยเรียงตามชื่อ
        { positionMaster: { level: 'asc' } },
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
        include: this.employeeListInclude(),
      }),
      this.prisma.employee.count({ where: teamWhere }),
      this.prisma.attendanceLog.findMany({
        where: attendanceTodayWhere,
        take: 80,
        orderBy: [{ logTime: 'asc' }],
        include: this.attendanceLogInclude(),
      }),
      this.prisma.attendanceDailySummary.findMany({
        where: {
          employeeId: { in: teamIds },
          workDate: today,
        },
        take: 80,
        orderBy: [{ employeeId: 'asc' }],
        include: { employee: { include: this.employeeListInclude() } },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          ...attendanceTodayWhere,
          logType: AttendanceLogType.CHECK_IN,
        },
        distinct: ['employeeId'],
        select: { employeeId: true },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          ...attendanceTodayWhere,
          status: AttendanceLogStatus.LATE,
        },
        distinct: ['employeeId'],
        select: { employeeId: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: pendingLeaveWhere,
        take: 6,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        include: this.leaveRequestInclude(),
      }),
      this.prisma.overtimeRequest.findMany({
        where: pendingOvertimeWhere,
        take: 6,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        include: this.overtimeRequestInclude(),
      }),
      this.prisma.timeAdjustRequest.findMany({
        where: pendingTimeAdjustWhere,
        take: 6,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        include: this.timeAdjustRequestInclude(),
      }),
      this.prisma.leaveRequest.count({ where: pendingLeaveWhere }),
      this.prisma.overtimeRequest.count({ where: pendingOvertimeWhere }),
      this.prisma.timeAdjustRequest.count({ where: pendingTimeAdjustWhere }),
      this.prisma.offsiteWorkRequest.count({ where: pendingOffsiteWhere }),
      this.prisma.leaveRequest.count({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'APPROVED' as never,
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      this.prisma.offsiteWorkRequest.count({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'APPROVED' as never,
          workDate: today,
        },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          workDate: { gte: weekStart, lte: today },
          logType: AttendanceLogType.CHECK_IN,
        },
        select: { employeeId: true, workDate: true, status: true },
        orderBy: [{ workDate: 'asc' }],
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'APPROVED' as never,
          startDate: { gte: today, lte: nextWeekEnd },
        },
        take: 5,
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
        include: this.leaveRequestInclude(),
      }),
      this.prisma.overtimeRequest.aggregate({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'APPROVED' as never,
          workDate: { gte: monthStart, lte: today },
        },
        _sum: { totalHours: true },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          workDate: { gte: this.addDays(today, -29), lte: today },
          status: AttendanceLogStatus.LATE,
        },
        select: {
          employeeId: true,
          employee: { include: this.employeeMiniInclude() },
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          ...pendingLeaveWhere,
          submittedAt: { lt: this.addDays(new Date(), -3) },
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          ...pendingOvertimeWhere,
          submittedAt: { lt: this.addDays(new Date(), -3) },
        },
      }),
      this.prisma.timeAdjustRequest.count({
        where: {
          ...pendingTimeAdjustWhere,
          submittedAt: { lt: this.addDays(new Date(), -3) },
        },
      }),
      this.prisma.offsiteWorkRequest.count({
        where: {
          ...pendingOffsiteWhere,
          submittedAt: { lt: this.addDays(new Date(), -3) },
        },
      }),
    ]);

    const trend = this.buildAttendanceTrend(
      weeklyAttendanceLogs,
      teamTotal,
      weekStart,
      today,
    );
    const topLateEmployees = this.buildTopLateEmployees(lateLogsLast30Days);
    const pendingApprovals =
      pendingLeaveCount +
      pendingOvertimeCount +
      pendingTimeAdjustCount +
      pendingOffsiteCount;
    const oldPendingApprovals =
      oldLeavePendingCount +
      oldOvertimePendingCount +
      oldTimeAdjustPendingCount +
      oldOffsitePendingCount;

    return {
      manager,
      team,
      attendanceLogs,
      dailyAttendanceSummaries,
      leaveRequests,
      overtimeRequests,
      timeAdjustRequests,
      approvals: this.buildDashboardApprovalItems(
        leaveRequests,
        overtimeRequests,
        timeAdjustRequests,
      ),
      summary: {
        teamTotal,
        checkedIn: checkedInRows.length,
        notCheckedIn: Math.max(teamTotal - checkedInRows.length, 0),
        late: lateRows.length,
        pendingApprovals,
        pendingLeave: pendingLeaveCount,
        pendingOvertime: pendingOvertimeCount,
        pendingTimeAdjust: pendingTimeAdjustCount,
        pendingOffsite: pendingOffsiteCount,
        onLeaveToday: todayOnLeaveCount,
        offsiteToday: todayOffsiteCount,
        approvedOvertimeHoursThisMonth: this.roundHours(
          this.toNumber(approvedOvertimeMonth._sum.totalHours),
        ),
        oldPendingApprovals,
      },
      insight: {
        attendanceRate: this.percentValue(checkedInRows.length, teamTotal),
        lateRate: this.percentValue(lateRows.length, teamTotal),
        missingRate: this.percentValue(
          Math.max(teamTotal - checkedInRows.length, 0),
          teamTotal,
        ),
        pendingApprovalRate: this.percentValue(
          pendingApprovals,
          Math.max(teamTotal, 1),
        ),
        riskLevel: this.getManagerRiskLevel({
          late: lateRows.length,
          missing: Math.max(teamTotal - checkedInRows.length, 0),
          oldPending: oldPendingApprovals,
        }),
      },
      charts: {
        attendanceTrend: trend,
        pendingBreakdown: [
          { type: 'LEAVE', label: 'ใบลา', count: pendingLeaveCount },
          { type: 'OVERTIME', label: 'OT', count: pendingOvertimeCount },
          {
            type: 'TIME_ADJUST',
            label: 'แก้เวลา',
            count: pendingTimeAdjustCount,
          },
          { type: 'OFFSITE', label: 'นอกสถานที่', count: pendingOffsiteCount },
        ],
      },
      followUps: {
        missingCheckIn: team
          .filter(
            (employee) =>
              !checkedInRows.some((row) => row.employeeId === employee.id),
          )
          .slice(0, 5),
        upcomingLeaves,
        topLateEmployees,
      },
    };
  }

  async getTeam(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const { page, pageSize, skip } = this.getPagination(query);

    const where: Prisma.EmployeeWhereInput = {
      ...this.buildTeamEmployeeWhere(manager.id),
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status as never }
        : {}),
      ...this.buildEmployeeSearchWhere(query.search || query.q),
    };

    const [items, total, statusGroups] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [
        // ผู้บริหารขึ้นก่อน (ระดับตำแหน่ง 1 = สูงสุด) แล้วค่อยเรียงตามชื่อ
        { positionMaster: { level: 'asc' } },
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
        include: this.employeeListInclude(),
      }),
      this.prisma.employee.count({ where }),
      this.prisma.employee.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
    ]);

    return {
      ...this.paginated(items, page, pageSize, total),
      summary: this.buildTeamSummary(total, statusGroups),
    };
  }

  async getAttendance(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.findDirectTeamIds(manager.id);
    const { page, pageSize, skip } = this.getPagination(query);

    const listWhere: Prisma.AttendanceLogWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      ...(query.logType ? { logType: query.logType as never } : {}),
      ...(query.channel ? { channel: query.channel as never } : {}),
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status as never }
        : {}),
      ...this.buildWorkDateRangeWhere(query.dateFrom, query.dateTo),
      ...this.buildAttendanceSearchWhere(query.search || query.q),
    };

    const summaryWhere: Prisma.AttendanceLogWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      ...this.buildWorkDateRangeWhere(query.dateFrom, query.dateTo),
    };

    const [items, total, teamTotal, checkedInRows, lateRows] =
      await this.prisma.$transaction([
        this.prisma.attendanceLog.findMany({
          where: listWhere,
          skip,
          take: pageSize,
          orderBy: [{ workDate: 'desc' }, { logTime: 'desc' }],
          include: this.attendanceLogInclude(),
        }),
        this.prisma.attendanceLog.count({ where: listWhere }),
        this.prisma.employee.count({
          where: this.buildTeamEmployeeWhere(manager.id),
        }),
        this.prisma.attendanceLog.findMany({
          where: {
            ...summaryWhere,
            logType: AttendanceLogType.CHECK_IN,
          },
          distinct: ['employeeId'],
          select: { employeeId: true },
        }),
        this.prisma.attendanceLog.findMany({
          where: {
            ...summaryWhere,
            status: AttendanceLogStatus.LATE,
          },
          distinct: ['employeeId'],
          select: { employeeId: true },
        }),
      ]);

    const checkedInIds = checkedInRows.map((row) => row.employeeId);
    const missingCheckIn = await this.prisma.employee.findMany({
      where: {
        ...this.buildTeamEmployeeWhere(manager.id),
        ...(checkedInIds.length > 0 ? { id: { notIn: checkedInIds } } : {}),
      },
      take: 12,
      orderBy: [
        // ผู้บริหารขึ้นก่อน (ระดับตำแหน่ง 1 = สูงสุด) แล้วค่อยเรียงตามชื่อ
        { positionMaster: { level: 'asc' } },
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
      include: this.employeeListInclude(),
    });

    return {
      ...this.paginated(items, page, pageSize, total),
      summary: {
        teamTotal,
        checkedIn: checkedInRows.length,
        late: lateRows.length,
        missing: Math.max(teamTotal - checkedInRows.length, 0),
        missingCheckIn,
      },
    };
  }

  async getLeaves(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.findDirectTeamIds(manager.id);
    const { page, pageSize, skip } = this.getPagination(query);

    const where: Prisma.LeaveRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status as never }
        : {}),
      ...this.buildLeaveDateRangeWhere(query.dateFrom, query.dateTo),
      ...this.buildLeaveSearchWhere(query.search || query.q),
    };

    const [items, total, statusGroups, onLeaveToday] =
      await this.prisma.$transaction([
        this.prisma.leaveRequest.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
          include: this.leaveRequestInclude(),
        }),
        this.prisma.leaveRequest.count({ where }),
        this.prisma.leaveRequest.groupBy({
          by: ['status'],
          where,
          orderBy: { status: 'asc' },
          _count: { _all: true },
          _sum: { totalDays: true },
        }),
        this.prisma.leaveRequest.count({
          where: this.buildOnLeaveTodayWhere(where, query.status),
        }),
      ]);

    return {
      ...this.paginated(items, page, pageSize, total),
      summary: {
        ...this.buildLeaveSummary(total, statusGroups, onLeaveToday),
        teamTotal: teamIds.length,
      },
    };
  }

  async getOvertime(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.findDirectTeamIds(manager.id);
    const { page, pageSize, skip } = this.getPagination(query);

    const where: Prisma.OvertimeRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status as never }
        : {}),
      ...(query.workType && query.workType !== 'ALL'
        ? { workType: query.workType as never }
        : {}),
      ...this.buildWorkDateRangeWhere(query.dateFrom, query.dateTo),
      ...this.buildOvertimeSearchWhere(query.search || query.q),
    };

    const [items, total, statusGroups] = await this.prisma.$transaction([
      this.prisma.overtimeRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ workDate: 'desc' }, { submittedAt: 'desc' }],
        include: this.overtimeRequestInclude(),
      }),
      this.prisma.overtimeRequest.count({ where }),
      this.prisma.overtimeRequest.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: { _all: true },
        _sum: { totalHours: true },
      }),
    ]);

    return {
      ...this.paginated(items, page, pageSize, total),
      summary: {
        ...this.buildOvertimeSummary(total, statusGroups),
        teamTotal: teamIds.length,
      },
    };
  }

  async getOffsite(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.findDirectTeamIds(manager.id);
    const { page, pageSize, skip } = this.getPagination(query);

    const keyword = query.search || query.q;
    const matchedTeamIds = await this.findTeamEmployeeIdsBySearch(
      teamIds,
      keyword,
    );

    const where: Prisma.OffsiteWorkRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status as never }
        : {}),
      ...(query.locationType && query.locationType !== 'ALL'
        ? { locationType: query.locationType as never }
        : {}),
      ...this.buildOffsiteWorkDateRangeWhere(query.dateFrom, query.dateTo),
      ...this.buildOffsiteSearchWhere(keyword, matchedTeamIds),
    };

    const [rawItems, total, statusGroups, missingGps] =
      await this.prisma.$transaction([
        this.prisma.offsiteWorkRequest.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.offsiteWorkRequest.count({ where }),
        this.prisma.offsiteWorkRequest.groupBy({
          by: ['status'],
          where,
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.offsiteWorkRequest.count({
          where: {
            AND: [
              where,
              {
                OR: [{ latitude: null }, { longitude: null }],
              },
            ],
          },
        }),
      ]);

    const items = await this.enrichOffsiteWithEmployees(rawItems);

    return {
      ...this.paginated(items, page, pageSize, total),
      summary: {
        ...this.buildOffsiteSummary(total, statusGroups, missingGps),
        teamTotal: teamIds.length,
      },
    };
  }

  async getTimeAdjust(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.findDirectTeamIds(manager.id);
    const { page, pageSize, skip } = this.getPagination(query);

    const where: Prisma.TimeAdjustRequestWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status as never }
        : {}),
      ...(query.adjustType && query.adjustType !== 'ALL'
        ? { adjustType: query.adjustType }
        : {}),
      ...(query.targetLogType && query.targetLogType !== 'ALL'
        ? { targetLogType: query.targetLogType as never }
        : {}),
      ...this.buildTimeAdjustDateRangeWhere(query.dateFrom, query.dateTo),
      ...this.buildTimeAdjustSearchWhere(query.search || query.q),
    };

    const [items, total, statusGroups, adjustTypeGroups, targetLogTypeGroups] =
      await this.prisma.$transaction([
        this.prisma.timeAdjustRequest.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: [{ requestedLogTime: 'desc' }, { createdAt: 'desc' }],
          include: this.timeAdjustRequestInclude(),
        }),
        this.prisma.timeAdjustRequest.count({ where }),
        this.prisma.timeAdjustRequest.groupBy({
          by: ['status'],
          where,
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.timeAdjustRequest.groupBy({
          by: ['adjustType'],
          where,
          orderBy: { adjustType: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.timeAdjustRequest.groupBy({
          by: ['targetLogType'],
          where,
          orderBy: { targetLogType: 'asc' },
          _count: { _all: true },
        }),
      ]);

    return {
      ...this.paginated(items, page, pageSize, total),
      summary: {
        ...this.buildTimeAdjustSummary(
          total,
          statusGroups,
          adjustTypeGroups,
          targetLogTypeGroups,
        ),
        teamTotal: teamIds.length,
      },
    };
  }

  /**
   * สรุปทีมรายคน — วันนี้ + สะสมทั้งเดือน + วันลาคงเหลือ
   * ---------------------------------------------------
   * หน้า Dashboard ของหัวหน้าต้องตอบสองคำถามในจอเดียว
   *   "วันนี้ใครมา ใครสาย ใครลา ใครยังไม่เข้า"  → today
   *   "เดือนนี้ใครสายบ่อย ใครขาด ใคร OT เยอะ ใครลาเหลือเท่าไร" → month/leaveBalances
   *
   * ของเดิม /manager/dashboard ให้แต่ยอดรวมของวันนี้ พอวันไหนยังไม่มีคนลงเวลา
   * (เช่นวันหยุด) หน้าจะว่างทั้งหน้า ทั้งที่ข้อมูลสะสมของเดือนมีอยู่เต็ม
   *
   * ยึด attendance_daily_summary เป็นแหล่งเดียว เพราะเป็นตารางที่ payroll ใช้จริง
   * ตัวเลขบนหน้าหัวหน้าจึงตรงกับที่ HR เห็นตอนปิดรอบ ไม่ต้องคำนวณซ้ำคนละสูตร
   */
  async getTeamSummary(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const today = this.toDateOnly(
      query.date || toThaiDateKey(new Date()),
    );

    // เดือนที่ดู: ค่าเริ่มต้นคือเดือนของวันที่ที่ส่งมา
    const monthAnchor = query.month
      ? this.toDateOnly(`${query.month}-01`)
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthStart = new Date(
      Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + 1, 0),
    );
    const previousMonthStart = new Date(
      Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() - 1, 1),
    );
    const previousMonthEnd = new Date(
      Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), 0),
    );
    const currentYear = today.getUTCFullYear();
    const isViewingToday =
      this.dateKey(today) === toThaiDateKey(new Date());

    const team = await this.prisma.employee.findMany({
      where: {
        ...this.buildTeamEmployeeWhere(manager.id),
        status: { notIn: ['RESIGNED', 'TERMINATED'] as never },
      },
      orderBy: [
        // ผู้บริหารขึ้นก่อน (ระดับตำแหน่ง 1 = สูงสุด) แล้วค่อยเรียงตามชื่อ
        { positionMaster: { level: 'asc' } },
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
      include: this.employeeListInclude(),
    });

    const teamIds = team.map((employee) => employee.id);

    if (teamIds.length === 0) {
      return {
        date: this.dateKey(today),
        month: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
        holiday: null,
        today: this.emptyTodaySummary(),
        // ต้องคืนรูปทรงเดียวกับกรณีมีลูกทีมเสมอ ไม่งั้นหน้าเว็บที่อ่าน
        // monthTotals.* ตรง ๆ จะพังทันทีเมื่อหัวหน้ายังไม่มีลูกทีม
        monthTotals: {
          lateDays: 0,
          lateMinutes: 0,
          absentDays: 0,
          missingDays: 0,
          leaveDays: 0,
          otHours: 0,
          recordedDays: 0,
          presentDays: 0,
          attendanceRate: 0,
        },
        members: [],
      };
    }

    const [
      todayRows,
      monthRows,
      previousMonthRows,
      shiftAssignments,
      companyPolicies,
      pendingLeaveRows,
      pendingOtRows,
      pendingTimeAdjustRows,
      pendingOffsiteRows,
      leaveBalances,
    ] = await this.prisma.$transaction([
      this.prisma.attendanceDailySummary.findMany({
        where: { employeeId: { in: teamIds }, workDate: today },
      }),
      this.prisma.attendanceDailySummary.findMany({
        where: {
          employeeId: { in: teamIds },
          workDate: { gte: monthStart, lte: monthEnd },
        },
        select: this.monthSummarySelect(),
      }),
      // เดือนก่อนหน้า — ไว้บอกว่าตัวเลขกำลังดีขึ้นหรือแย่ลง ไม่ใช่ดูเลขนิ่ง ๆ
      this.prisma.attendanceDailySummary.findMany({
        where: {
          employeeId: { in: teamIds },
          workDate: { gte: previousMonthStart, lte: previousMonthEnd },
        },
        select: this.monthSummarySelect(),
      }),
      // กะที่ผูกรายคน ใช้บอก "เลยเวลาเข้างานแล้วหรือยัง"
      this.prisma.employeeWorkShift.findMany({
        where: {
          employeeId: { in: teamIds },
          status: 'ACTIVE' as never,
          deletedAt: null,
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
          policy: { status: 'ACTIVE' as never, deletedAt: null },
        },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        include: { policy: { select: this.policyTimeSelect() } },
      }),
      // กะเริ่มต้นของบริษัท/สาขา สำหรับคนที่ยังไม่ถูกผูกกะรายคน
      this.prisma.attendancePolicy.findMany({
        where: {
          companyId: manager.companyId,
          status: 'ACTIVE' as never,
          deletedAt: null,
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
        select: {
          ...this.policyTimeSelect(),
          branchId: true,
          employeeTypeId: true,
        },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['employeeId'],
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'SUBMITTED' as never,
        },
        orderBy: { employeeId: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.overtimeRequest.groupBy({
        by: ['employeeId'],
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'SUBMITTED' as never,
        },
        orderBy: { employeeId: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.timeAdjustRequest.groupBy({
        by: ['employeeId'],
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'SUBMITTED' as never,
        },
        orderBy: { employeeId: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.offsiteWorkRequest.groupBy({
        by: ['employeeId'],
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: 'SUBMITTED' as never,
        },
        orderBy: { employeeId: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.leaveBalance.findMany({
        where: { employeeId: { in: teamIds }, year: currentYear },
        include: {
          leaveType: { select: { id: true, code: true, nameTh: true } },
        },
      }),
    ]);

    /*
     * วันหยุดต้องถามตัวเดียวกับที่หน้าลงเวลาใช้ (SystemSettingsService) เพราะ
     * "วันหยุด" ของระบบนี้ไม่ได้มีแค่ในตารางวันหยุดประจำปี ยังรวมวันหยุดประจำ
     * สัปดาห์ วันหยุดที่สลับ และวันที่สั่งให้มาทำงานพิเศษด้วย ถ้าอ่านตาราง
     * holiday_calendars ตรง ๆ วันเสาร์-อาทิตย์จะกลายเป็น "ยังไม่เข้างาน" ทั้งทีม
     */
    const holidayInfo =
      await this.systemSettings.getEmployeeAttendanceHolidayInfo(today, {
        id: manager.id,
        companyId: manager.companyId,
        branchId: manager.branchId,
        departmentId: manager.departmentId,
        divisionId: manager.divisionId,
        employeeTypeId: manager.employeeTypeId,
      });

    const holiday =
      holidayInfo.isHoliday && !holidayInfo.isWorkingHoliday
        ? { name: holidayInfo.name ?? 'วันหยุด' }
        : null;

    const todayByEmployee = new Map(
      todayRows.map((row) => [row.employeeId, row]),
    );
    const pendingByEmployee = new Map<string, number>();

    for (const group of [
      pendingLeaveRows,
      pendingOtRows,
      pendingTimeAdjustRows,
      pendingOffsiteRows,
    ]) {
      for (const row of group) {
        pendingByEmployee.set(
          row.employeeId,
          (pendingByEmployee.get(row.employeeId) ?? 0) +
            this.getGroupCount(row._count),
        );
      }
    }

    const monthByEmployee = this.groupMonthSummary(monthRows);
    const previousByEmployee = this.groupMonthSummary(previousMonthRows);

    // กะของแต่ละคน: ผูกรายคนก่อน ถ้าไม่มีค่อยใช้กะของสาขา/บริษัท
    // (ลำดับเดียวกับที่ระบบลงเวลาใช้ ตัวเลขจะได้ไม่ขัดกัน)
    const shiftByEmployee = new Map<string, (typeof companyPolicies)[number]>();

    for (const employee of team) {
      const assigned = shiftAssignments.find(
        (row) => row.employeeId === employee.id,
      );

      if (assigned?.policy) {
        shiftByEmployee.set(
          employee.id,
          assigned.policy as (typeof companyPolicies)[number],
        );
        continue;
      }

      const fallback = companyPolicies.find(
        (policy) =>
          (policy.branchId === null || policy.branchId === employee.branchId) &&
          (policy.employeeTypeId === null ||
            policy.employeeTypeId === employee.employeeTypeId),
      );

      if (fallback) shiftByEmployee.set(employee.id, fallback);
    }

    const balancesByEmployee = new Map<string, typeof leaveBalances>();

    for (const balance of leaveBalances) {
      const list = balancesByEmployee.get(balance.employeeId) ?? [];
      list.push(balance);
      balancesByEmployee.set(balance.employeeId, list);
    }

    const emptyMonthBucket = {
      recordedDays: 0,
      presentDays: 0,
      lateDays: 0,
      lateMinutes: 0,
      absentDays: 0,
      missingDays: 0,
      leaveDays: 0,
      otMinutes: 0,
      deductionAmount: 0,
    };

    const members = team.map((employee) => {
      const daily = todayByEmployee.get(employee.id);
      const shift = shiftByEmployee.get(employee.id) ?? null;
      const month = monthByEmployee.get(employee.id) ?? { ...emptyMonthBucket };
      const previous = previousByEmployee.get(employee.id) ?? {
        ...emptyMonthBucket,
      };

      return {
        employee,
        today: {
          status: this.resolveTodayStatus(daily, Boolean(holiday)),
          // แยกสามช่องตามกะจริง (เช้า/บ่าย/ออก) ให้หัวหน้าเห็นว่าขาดช่องไหน
          morningInAt: daily?.morningInAt ?? null,
          afternoonInAt: daily?.afternoonInAt ?? null,
          checkOutAt: daily?.checkOutAt ?? null,
          lateMinutes: daily?.totalLateMinutes ?? 0,
          otMinutes: daily?.approvedOtMinutes ?? 0,
          hasMissingLog: daily?.hasMissingLog ?? false,
          expectedInAt: shift?.morningCheckInDeadline ?? null,
          /*
           * "ยังไม่มา" ตอนที่ยังไม่ถึงเวลาเข้างานไม่ใช่ปัญหา ธงนี้บอกว่าเลย
           * เวลาเข้างานตามกะแล้วจริง ๆ (มีความหมายเฉพาะตอนดูของวันนี้)
           */
          isOverdue:
            isViewingToday &&
            !holiday &&
            !daily?.morningInAt &&
            !daily?.afternoonInAt &&
            this.isPastShiftTime(shift?.morningCheckInDeadline ?? null),
        },
        month: {
          ...month,
          otHours: this.roundHours(month.otMinutes / 60),
          deductionAmount: this.roundHours(month.deductionAmount),
          attendanceRate: this.percentValue(
            month.presentDays,
            Math.max(month.recordedDays - month.leaveDays, 0) || 0,
          ),
        },
        previousMonth: {
          lateDays: previous.lateDays,
          lateMinutes: previous.lateMinutes,
          absentDays: previous.absentDays,
          missingDays: previous.missingDays,
          otHours: this.roundHours(previous.otMinutes / 60),
        },
        shift: shift
          ? {
              name: shift.name,
              morningDeadline: shift.morningCheckInDeadline,
              afternoonDeadline: shift.afternoonCheckInDeadline,
              checkoutFrom: shift.checkoutAllowedFrom,
            }
          : null,
        leaveBalances: (balancesByEmployee.get(employee.id) ?? []).map(
          (balance) => ({
            leaveTypeId: balance.leaveTypeId,
            code: balance.leaveType?.code ?? null,
            nameTh: balance.leaveType?.nameTh ?? null,
            entitlementDays: this.toNumber(balance.entitlementDays),
            usedDays: this.toNumber(balance.usedDays),
            pendingDays: this.toNumber(balance.pendingDays),
            // สิทธิ์ที่ใช้ได้จริง = โควตา + ยกมา + ปรับ − ใช้ไป − รออนุมัติ
            remainingDays: this.roundHours(
              this.toNumber(balance.entitlementDays) +
                this.toNumber(balance.carriedForwardDays) +
                this.toNumber(balance.adjustedDays) -
                this.toNumber(balance.usedDays) -
                this.toNumber(balance.pendingDays),
            ),
          }),
        ),
        pendingRequests: pendingByEmployee.get(employee.id) ?? 0,
      };
    });

    const todaySummary = members.reduce(
      (acc, member) => {
        acc.teamTotal += 1;
        acc[member.today.status] = (acc[member.today.status] ?? 0) + 1;
        return acc;
      },
      { ...this.emptyTodaySummary() },
    );

    const monthTotals = members.reduce(
      (acc, member) => {
        acc.lateDays += member.month.lateDays;
        acc.lateMinutes += member.month.lateMinutes;
        acc.absentDays += member.month.absentDays;
        acc.missingDays += member.month.missingDays;
        acc.leaveDays += member.month.leaveDays;
        acc.otHours = this.roundHours(acc.otHours + member.month.otHours);
        acc.recordedDays += member.month.recordedDays;
        acc.presentDays += member.month.presentDays;
        return acc;
      },
      {
        lateDays: 0,
        lateMinutes: 0,
        absentDays: 0,
        missingDays: 0,
        leaveDays: 0,
        otHours: 0,
        recordedDays: 0,
        presentDays: 0,
      },
    );

    return {
      date: this.dateKey(today),
      month: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
      holiday: holiday ? { name: holiday.name } : null,
      today: todaySummary,
      monthTotals: {
        ...monthTotals,
        attendanceRate: this.percentValue(
          monthTotals.presentDays,
          Math.max(monthTotals.recordedDays - monthTotals.leaveDays, 0) || 0,
        ),
      },
      members,
    };
  }

  /**
   * ปฏิทินทีมรายเดือน
   * ------------------
   * ตอบคำถามที่หัวหน้าต้องตอบก่อนกดอนุมัติใบลาทุกครั้ง: "วันนั้นมีคนลาอยู่กี่คนแล้ว"
   * ถ้าไม่มีมุมนี้ หัวหน้าจะอนุมัติทีละใบโดยไม่รู้ว่าวันเดียวกันมีคนลาซ้อนอยู่
   *
   * คืนเป็นรายวันของทั้งเดือน พร้อมรายชื่อคนที่ไม่อยู่ในแต่ละวัน (ลา/นอกสถานที่)
   * และธงวันหยุด เพื่อให้ฝั่งหน้าเว็บวาดเป็นตารางปฏิทินได้ตรง ๆ
   */
  async getTeamCalendar(currentUser: AuthenticatedUser, query: ManagerQuery) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const anchor = query.month
      ? this.toDateOnly(`${query.month}-01`)
      : thaiToday();

    const monthStart = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
    );

    const team = await this.prisma.employee.findMany({
      where: {
        ...this.buildTeamEmployeeWhere(manager.id),
        status: { notIn: ["RESIGNED", "TERMINATED"] as never },
      },
      orderBy: [
        // ผู้บริหารขึ้นก่อน (ระดับตำแหน่ง 1 = สูงสุด) แล้วค่อยเรียงตามชื่อ
        { positionMaster: { level: "asc" } },
        { firstName: "asc" },
        { lastName: "asc" },
      ],
      include: this.employeeListInclude(),
    });

    const teamIds = team.map((employee) => employee.id);

    if (teamIds.length === 0) {
      return {
        month: this.monthKey(monthStart),
        teamTotal: 0,
        days: [],
      };
    }

    const [leaves, offsites, holidays] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: { in: ["APPROVED", "SUBMITTED"] as never },
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        include: {
          leaveType: { select: { nameTh: true } },
          employee: { include: this.employeeMiniInclude() },
        },
      }),
      this.prisma.offsiteWorkRequest.findMany({
        where: {
          employeeId: { in: teamIds },
          deletedAt: null,
          status: { in: ["APPROVED", "MANAGER_APPROVED"] as never },
          workDate: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, workDate: true, locationName: true },
      }),
      this.prisma.holidayCalendar.findMany({
        where: {
          companyId: manager.companyId,
          status: "ACTIVE" as never,
          deletedAt: null,
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { date: true, name: true },
      }),
    ]);

    const employeeById = new Map(team.map((employee) => [employee.id, employee]));
    const holidayByDate = new Map(
      holidays.map((holiday) => [this.dateKey(holiday.date), holiday.name]),
    );

    const days: Array<{
      date: string;
      weekday: number;
      isHoliday: boolean;
      holidayName: string | null;
      leaves: Array<{
        employeeId: string;
        name: string;
        leaveType: string | null;
        status: string;
      }>;
      offsites: Array<{
        employeeId: string;
        name: string;
        locationName: string | null;
      }>;
      awayTotal: number;
    }> = [];

    for (
      let cursor = new Date(monthStart);
      cursor <= monthEnd;
      cursor = new Date(cursor.getTime() + 86_400_000)
    ) {
      const key = this.dateKey(cursor);

      const dayLeaves = leaves
        .filter(
          (leave) =>
            this.dateKey(leave.startDate) <= key &&
            this.dateKey(leave.endDate) >= key,
        )
        .map((leave) => ({
          employeeId: leave.employeeId,
          name: this.employeeDisplayName(employeeById.get(leave.employeeId)),
          leaveType: leave.leaveType?.nameTh ?? null,
          status: String(leave.status),
        }));

      const dayOffsites = offsites
        .filter((offsite) => this.dateKey(offsite.workDate) === key)
        .map((offsite) => ({
          employeeId: offsite.employeeId,
          name: this.employeeDisplayName(employeeById.get(offsite.employeeId)),
          locationName: offsite.locationName ?? null,
        }));

      days.push({
        date: key,
        weekday: cursor.getUTCDay(),
        isHoliday: holidayByDate.has(key),
        holidayName: holidayByDate.get(key) ?? null,
        leaves: dayLeaves,
        offsites: dayOffsites,
        awayTotal: dayLeaves.length + dayOffsites.length,
      });
    }

    return {
      month: this.monthKey(monthStart),
      teamTotal: teamIds.length,
      days,
    };
  }

  private monthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  private employeeDisplayName(employee?: {
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    employeeCode?: string | null;
  } | null) {
    if (!employee) return "-";

    const fullName = [employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return employee.displayName || fullName || employee.employeeCode || "-";
  }

  /** รวมแถวสรุปเวลารายวันเป็นยอดรายคน (ใช้ทั้งเดือนนี้และเดือนก่อน) */
  private groupMonthSummary(
    rows: Array<{
      employeeId: string;
      totalLateMinutes: number;
      isAbsent: boolean;
      hasMissingLog: boolean;
      paidLeaveMinutes: number;
      unpaidLeaveMinutes: number;
      approvedOtMinutes: number;
      totalDeductionAmount: unknown;
      morningInAt: Date | null;
      afternoonInAt: Date | null;
    }>,
  ) {
    const map = new Map<
      string,
      {
        recordedDays: number;
        presentDays: number;
        lateDays: number;
        lateMinutes: number;
        absentDays: number;
        missingDays: number;
        leaveDays: number;
        otMinutes: number;
        deductionAmount: number;
      }
    >();

    for (const row of rows) {
      const bucket = map.get(row.employeeId) ?? {
        recordedDays: 0,
        presentDays: 0,
        lateDays: 0,
        lateMinutes: 0,
        absentDays: 0,
        missingDays: 0,
        leaveDays: 0,
        otMinutes: 0,
        deductionAmount: 0,
      };

      const onLeave = row.paidLeaveMinutes > 0 || row.unpaidLeaveMinutes > 0;

      bucket.recordedDays += 1;
      if (row.morningInAt || row.afternoonInAt) bucket.presentDays += 1;
      if (row.totalLateMinutes > 0) {
        bucket.lateDays += 1;
        bucket.lateMinutes += row.totalLateMinutes;
      }
      if (row.isAbsent) bucket.absentDays += 1;
      if (row.hasMissingLog) bucket.missingDays += 1;
      if (onLeave) bucket.leaveDays += 1;
      bucket.otMinutes += row.approvedOtMinutes;
      bucket.deductionAmount += this.toNumber(row.totalDeductionAmount);

      map.set(row.employeeId, bucket);
    }

    return map;
  }

  /** ตอนนี้เลยเวลา "HH:mm" ที่ส่งมาหรือยัง — ใช้กับกะของวันนี้เท่านั้น */
  private isPastShiftTime(time: string | null) {
    if (!time) return false;

    const [hour, minute] = time.split(":").map((part) => Number(part));

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

    const now = new Date();

    return now.getHours() * 60 + now.getMinutes() > hour * 60 + minute;
  }

  /** ฟิลด์ที่ใช้สรุปเวลารายเดือน — ใช้ทั้งเดือนปัจจุบันและเดือนก่อนหน้า */
  private monthSummarySelect() {
    return {
      employeeId: true,
      workDate: true,
      totalLateMinutes: true,
      isAbsent: true,
      hasMissingLog: true,
      paidLeaveMinutes: true,
      unpaidLeaveMinutes: true,
      approvedOtMinutes: true,
      totalDeductionAmount: true,
      morningInAt: true,
      afternoonInAt: true,
    } as const;
  }

  /** เวลาเข้างาน/เลิกงานตามกะ ใช้บอกว่าเลยเวลาเข้างานแล้วหรือยัง */
  private policyTimeSelect() {
    return {
      id: true,
      name: true,
      morningCheckInDeadline: true,
      afternoonCheckInDeadline: true,
      checkoutAllowedFrom: true,
      lateGraceMinutes: true,
    } as const;
  }

  private emptyTodaySummary() {
    return {
      teamTotal: 0,
      PRESENT: 0,
      LATE: 0,
      LEAVE: 0,
      OFFSITE: 0,
      ABSENT: 0,
      NOT_CHECKED_IN: 0,
      HOLIDAY: 0,
    } as Record<string, number>;
  }

  /** สถานะของวันนี้รายคน — เรียงตามความสำคัญ ลา/นอกสถานที่ต้องมาก่อน "ยังไม่เข้า" */
  private resolveTodayStatus(
    daily:
      | {
          morningInAt: Date | null;
          afternoonInAt: Date | null;
          totalLateMinutes: number;
          isAbsent: boolean;
          paidLeaveMinutes: number;
          unpaidLeaveMinutes: number;
          offsiteMinutes: number;
        }
      | undefined,
    isHoliday: boolean,
  ) {
    if (!daily) return isHoliday ? 'HOLIDAY' : 'NOT_CHECKED_IN';

    if (daily.paidLeaveMinutes > 0 || daily.unpaidLeaveMinutes > 0) {
      return 'LEAVE';
    }
    if (daily.offsiteMinutes > 0) return 'OFFSITE';
    if (daily.isAbsent) return 'ABSENT';
    if (daily.totalLateMinutes > 0) return 'LATE';
    if (daily.morningInAt || daily.afternoonInAt) return 'PRESENT';

    return isHoliday ? 'HOLIDAY' : 'NOT_CHECKED_IN';
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return this.toDateOnly(result.toISOString().slice(0, 10));
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private formatThaiShortDate(date: Date) {
    return new Intl.DateTimeFormat('th-TH', {
      day: '2-digit',
      month: 'short',
    }).format(date);
  }

  private percentValue(value: number, total: number) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  }

  private buildAttendanceTrend(
    logs: Array<{
      employeeId: string;
      workDate: Date;
      status: AttendanceLogStatus;
    }>,
    teamTotal: number,
    startDate: Date,
    endDate: Date,
  ) {
    const dayMap = new Map<
      string,
      {
        date: string;
        label: string;
        checkedInIds: Set<string>;
        lateIds: Set<string>;
      }
    >();

    for (
      let current = new Date(startDate);
      current <= endDate;
      current.setDate(current.getDate() + 1)
    ) {
      const date = this.toDateOnly(current.toISOString().slice(0, 10));
      const key = this.dateKey(date);
      dayMap.set(key, {
        date: key,
        label: this.formatThaiShortDate(date),
        checkedInIds: new Set<string>(),
        lateIds: new Set<string>(),
      });
    }

    for (const log of logs) {
      const key = this.dateKey(log.workDate);
      const day = dayMap.get(key);
      if (!day) continue;
      day.checkedInIds.add(log.employeeId);
      if (log.status === AttendanceLogStatus.LATE) {
        day.lateIds.add(log.employeeId);
      }
    }

    return Array.from(dayMap.values()).map((day) => ({
      date: day.date,
      label: day.label,
      checkedIn: day.checkedInIds.size,
      late: day.lateIds.size,
      missing: Math.max(teamTotal - day.checkedInIds.size, 0),
    }));
  }

  private buildTopLateEmployees(
    logs: Array<{ employeeId: string; employee: any }>,
  ) {
    const map = new Map<string, { employee: any; count: number }>();

    for (const log of logs) {
      const current = map.get(log.employeeId);
      if (current) {
        current.count += 1;
      } else {
        map.set(log.employeeId, { employee: log.employee, count: 1 });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private getManagerRiskLevel(input: {
    late: number;
    missing: number;
    oldPending: number;
  }) {
    const score = input.late + input.missing * 2 + input.oldPending * 2;
    if (score >= 8) return 'HIGH';
    if (score >= 4) return 'MEDIUM';
    return 'LOW';
  }

  private buildTeamSummary(
    total: number,
    statusGroups: Array<{
      status: string;
      _count?: true | { _all?: number } | null;
    }>,
  ) {
    const summary = {
      total,
      active: 0,
      probation: 0,
      suspended: 0,
      resigned: 0,
      terminated: 0,
      inactive: 0,
      other: 0,
    };

    for (const group of statusGroups) {
      const count = this.getGroupCount(group._count);

      if (group.status === 'ACTIVE') summary.active = count;
      else if (group.status === 'PROBATION') summary.probation = count;
      else if (group.status === 'SUSPENDED') summary.suspended = count;
      else if (group.status === 'RESIGNED') summary.resigned = count;
      else if (group.status === 'TERMINATED') summary.terminated = count;
      else if (group.status === 'INACTIVE') summary.inactive = count;
      else summary.other += count;
    }

    return summary;
  }

  private buildDashboardApprovalItems(
    leaveRequests: Array<any>,
    overtimeRequests: Array<any>,
    timeAdjustRequests: Array<any>,
  ) {
    const leaveItems = leaveRequests.map((item) => ({
      id: item.id,
      type: 'LEAVE',
      requestNo: item.requestNo ?? null,
      title: item.leaveType?.nameTh || item.leaveType?.nameEn || 'คำขอลา',
      reason: item.reason ?? null,
      status: item.status,
      requestStatus: item.status,
      submittedAt: item.submittedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      detail: {
        startDate: item.startDate,
        endDate: item.endDate,
        totalDays: item.totalDays,
      },
    }));

    const overtimeItems = overtimeRequests.map((item) => ({
      id: item.id,
      type: 'OVERTIME',
      requestNo: item.requestNo ?? null,
      title: 'คำขอ OT',
      reason: item.reason ?? null,
      status: item.status,
      requestStatus: item.status,
      submittedAt: item.submittedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      detail: {
        workDate: item.workDate,
        totalHours: item.totalHours,
        workType: item.workType,
      },
    }));

    const timeAdjustItems = timeAdjustRequests.map((item) => ({
      id: item.id,
      type: 'TIME_ADJUST',
      requestNo: item.requestNo ?? null,
      title: 'คำขอแก้เวลา',
      reason: item.reason ?? null,
      status: item.status,
      requestStatus: item.status,
      submittedAt: item.submittedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      detail: {
        adjustType: item.adjustType,
        targetLogType: item.targetLogType,
        requestedLogTime: item.requestedLogTime,
      },
    }));

    return [...leaveItems, ...overtimeItems, ...timeAdjustItems]
      .sort((a, b) => {
        const aTime = new Date(a.submittedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.submittedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 6);
  }

  private buildLeaveSummary(
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

    summary.totalDays = this.roundHours(summary.totalDays);

    return summary;
  }

  private buildOnLeaveTodayWhere(
    where: Prisma.LeaveRequestWhereInput,
    status?: string,
  ): Prisma.LeaveRequestWhereInput {
    if (status && status !== 'ALL' && status !== 'APPROVED') {
      return { id: '__NO_APPROVED_LEAVE_TODAY__' };
    }

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

  private getGroupTotalDays(
    value: true | { totalDays?: unknown } | null | undefined,
  ) {
    if (!value || value === true) return 0;
    return this.toNumber(value.totalDays);
  }

  private buildOvertimeSummary(
    total: number,
    statusGroups: Array<{
      status: string;
      _count?: true | { _all?: number } | null;
      _sum?: true | { totalHours?: unknown } | null;
    }>,
  ) {
    const summary = {
      total,
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      totalHours: 0,
      approvedHours: 0,
    };

    for (const group of statusGroups) {
      const count = this.getGroupCount(group._count);
      const hours = this.getGroupTotalHours(group._sum);

      summary.totalHours += hours;

      if (group.status === 'DRAFT') summary.draft = count;
      if (group.status === 'SUBMITTED') summary.submitted = count;
      if (group.status === 'APPROVED') {
        summary.approved = count;
        summary.approvedHours = hours;
      }
      if (group.status === 'REJECTED') summary.rejected = count;
      if (group.status === 'CANCELLED') summary.cancelled = count;
    }

    summary.totalHours = this.roundHours(summary.totalHours);
    summary.approvedHours = this.roundHours(summary.approvedHours);

    return summary;
  }

  private buildOffsiteSummary(
    total: number,
    statusGroups: Array<{
      status: string;
      _count?: true | { _all?: number } | null;
    }>,
    missingGps: number,
  ) {
    const summary = {
      total,
      draft: 0,
      submitted: 0,
      managerApproved: 0,
      hrApproved: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      missingGps,
      withGps: Math.max(total - missingGps, 0),
    };

    for (const group of statusGroups) {
      const count = this.getGroupCount(group._count);

      if (group.status === 'DRAFT') summary.draft = count;
      if (group.status === 'SUBMITTED') summary.submitted = count;
      if (group.status === 'MANAGER_APPROVED') summary.managerApproved = count;
      if (group.status === 'HR_APPROVED') summary.hrApproved = count;
      if (group.status === 'APPROVED') summary.approved += count;
      if (group.status === 'REJECTED') summary.rejected += count;
      if (group.status === 'MANAGER_REJECTED') summary.rejected += count;
      if (group.status === 'HR_REJECTED') summary.rejected += count;
      if (group.status === 'CANCELLED') summary.cancelled = count;
    }

    summary.pending = summary.submitted + summary.managerApproved;
    summary.approved += summary.hrApproved;

    return summary;
  }

  private buildTimeAdjustSummary(
    total: number,
    statusGroups: Array<{
      status: string;
      _count?: true | { _all?: number } | null;
    }>,
    adjustTypeGroups: Array<{
      adjustType: string;
      _count?: true | { _all?: number } | null;
    }>,
    targetLogTypeGroups: Array<{
      targetLogType: string;
      _count?: true | { _all?: number } | null;
    }>,
  ) {
    const summary = {
      total,
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      missingCheckIn: 0,
      missingCheckOut: 0,
      missingPunch: 0,
      wrongTime: 0,
      deviceError: 0,
      outsideWork: 0,
      other: 0,
      checkIn: 0,
      checkOut: 0,
      breakStart: 0,
      breakEnd: 0,
    };

    for (const group of statusGroups) {
      const count = this.getGroupCount(group._count);
      if (group.status === 'DRAFT') summary.draft = count;
      if (group.status === 'SUBMITTED') summary.submitted = count;
      if (group.status === 'APPROVED') summary.approved = count;
      if (group.status === 'REJECTED') summary.rejected = count;
      if (group.status === 'CANCELLED') summary.cancelled = count;
    }

    for (const group of adjustTypeGroups) {
      const count = this.getGroupCount(group._count);
      if (group.adjustType === 'MISSING_CHECK_IN')
        summary.missingCheckIn = count;
      if (group.adjustType === 'MISSING_CHECK_OUT')
        summary.missingCheckOut = count;
      if (group.adjustType === 'WRONG_TIME') summary.wrongTime = count;
      if (group.adjustType === 'DEVICE_ERROR') summary.deviceError = count;
      if (group.adjustType === 'OUTSIDE_WORK') summary.outsideWork = count;
      if (group.adjustType === 'OTHER') summary.other = count;
    }

    for (const group of targetLogTypeGroups) {
      const count = this.getGroupCount(group._count);
      if (group.targetLogType === 'CHECK_IN') summary.checkIn = count;
      if (group.targetLogType === 'CHECK_OUT') summary.checkOut = count;
      if (group.targetLogType === 'BREAK_START') summary.breakStart = count;
      if (group.targetLogType === 'BREAK_END') summary.breakEnd = count;
    }

    summary.missingPunch = summary.missingCheckIn + summary.missingCheckOut;

    return summary;
  }

  private toNumber(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private getGroupCount(value: true | { _all?: number } | null | undefined) {
    if (!value || value === true) return 0;
    return Number(value._all ?? 0);
  }

  private getGroupTotalHours(
    value: true | { totalHours?: unknown } | null | undefined,
  ) {
    if (!value || value === true) return 0;
    return this.toNumber(value.totalHours);
  }

  private roundHours(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async resolveManagerEmployee(currentUser: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: currentUser.id,
        deletedAt: null,
        status: {
          notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
        },
      },
      include: {
        company: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        branch: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        department: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        division: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        positionMaster: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
      },
    });

    if (!employee) {
      throw new ForbiddenException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถดูข้อมูลทีมได้',
      );
    }

    return employee;
  }

  private async findDirectTeamIds(managerEmployeeId: string) {
    const employees = await this.prisma.employee.findMany({
      where: this.buildTeamEmployeeWhere(managerEmployeeId),
      select: { id: true },
    });

    return employees.map((employee) => employee.id);
  }

  private buildTeamEmployeeWhere(
    managerEmployeeId: string,
  ): Prisma.EmployeeWhereInput {
    return {
      supervisorId: managerEmployeeId,
      deletedAt: null,
    };
  }

  private buildEmployeeSearchWhere(search?: string) {
    const keyword = search?.trim();

    if (!keyword) return {};

    return {
      OR: [
        { employeeCode: { contains: keyword, mode: 'insensitive' as const } },
        { firstName: { contains: keyword, mode: 'insensitive' as const } },
        { lastName: { contains: keyword, mode: 'insensitive' as const } },
        { displayName: { contains: keyword, mode: 'insensitive' as const } },
        { email: { contains: keyword, mode: 'insensitive' as const } },
        { phone: { contains: keyword, mode: 'insensitive' as const } },
        { position: { contains: keyword, mode: 'insensitive' as const } },
      ],
    } satisfies Prisma.EmployeeWhereInput;
  }

  private buildAttendanceSearchWhere(search?: string) {
    const keyword = search?.trim();

    if (!keyword) return {};

    return {
      employee: {
        OR: [
          { employeeCode: { contains: keyword, mode: 'insensitive' as const } },
          { firstName: { contains: keyword, mode: 'insensitive' as const } },
          { lastName: { contains: keyword, mode: 'insensitive' as const } },
          { displayName: { contains: keyword, mode: 'insensitive' as const } },
          { position: { contains: keyword, mode: 'insensitive' as const } },
        ],
      },
    } satisfies Prisma.AttendanceLogWhereInput;
  }

  private buildLeaveSearchWhere(search?: string) {
    const keyword = search?.trim();

    if (!keyword) return {};

    return {
      OR: [
        { requestNo: { contains: keyword, mode: 'insensitive' as const } },
        { reason: { contains: keyword, mode: 'insensitive' as const } },
        {
          employee: {
            employeeCode: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          employee: {
            firstName: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          employee: {
            lastName: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          leaveType: {
            nameTh: { contains: keyword, mode: 'insensitive' as const },
          },
        },
      ],
    } satisfies Prisma.LeaveRequestWhereInput;
  }

  private buildOvertimeSearchWhere(search?: string) {
    const keyword = search?.trim();

    if (!keyword) return {};

    return {
      OR: [
        { requestNo: { contains: keyword, mode: 'insensitive' as const } },
        { reason: { contains: keyword, mode: 'insensitive' as const } },
        {
          employee: {
            employeeCode: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          employee: {
            firstName: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          employee: {
            lastName: { contains: keyword, mode: 'insensitive' as const },
          },
        },
      ],
    } satisfies Prisma.OvertimeRequestWhereInput;
  }

  private buildOffsiteSearchWhere(search?: string, employeeIds: string[] = []) {
    const keyword = search?.trim();

    if (!keyword) return {};

    return {
      OR: [
        { requestNo: { contains: keyword, mode: 'insensitive' as const } },
        { locationName: { contains: keyword, mode: 'insensitive' as const } },
        { address: { contains: keyword, mode: 'insensitive' as const } },
        { reason: { contains: keyword, mode: 'insensitive' as const } },
        { employeeId: { contains: keyword, mode: 'insensitive' as const } },
        ...(employeeIds.length > 0
          ? [{ employeeId: { in: employeeIds } }]
          : []),
      ],
    } satisfies Prisma.OffsiteWorkRequestWhereInput;
  }

  private buildTimeAdjustSearchWhere(search?: string) {
    const keyword = search?.trim();

    if (!keyword) return {};

    return {
      OR: [
        { requestNo: { contains: keyword, mode: 'insensitive' as const } },
        { reason: { contains: keyword, mode: 'insensitive' as const } },
        { note: { contains: keyword, mode: 'insensitive' as const } },
        { adjustType: { contains: keyword, mode: 'insensitive' as const } },
        {
          employee: {
            employeeCode: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          employee: {
            firstName: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          employee: {
            lastName: { contains: keyword, mode: 'insensitive' as const },
          },
        },
        {
          employee: {
            displayName: { contains: keyword, mode: 'insensitive' as const },
          },
        },
      ],
    } satisfies Prisma.TimeAdjustRequestWhereInput;
  }

  private buildWorkDateRangeWhere(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return {};

    return {
      workDate: {
        ...(dateFrom ? { gte: this.toDateOnly(dateFrom) } : {}),
        ...(dateTo ? { lte: this.toDateOnly(dateTo) } : {}),
      },
    } satisfies Prisma.AttendanceLogWhereInput;
  }

  private buildOffsiteWorkDateRangeWhere(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return {};

    return {
      workDate: {
        ...(dateFrom ? { gte: this.toDateOnly(dateFrom) } : {}),
        ...(dateTo ? { lte: this.toDateOnly(dateTo) } : {}),
      },
    } satisfies Prisma.OffsiteWorkRequestWhereInput;
  }

  private buildTimeAdjustDateRangeWhere(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return {};

    return {
      requestedLogTime: {
        ...(dateFrom
          ? { gte: this.toDateTimeBoundary(dateFrom, 'start') }
          : {}),
        ...(dateTo ? { lte: this.toDateTimeBoundary(dateTo, 'end') } : {}),
      },
    } satisfies Prisma.TimeAdjustRequestWhereInput;
  }

  private buildLeaveDateRangeWhere(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return {};

    return {
      ...(dateFrom || dateTo
        ? {
            AND: [
              dateTo ? { startDate: { lte: this.toDateOnly(dateTo) } } : {},
              dateFrom ? { endDate: { gte: this.toDateOnly(dateFrom) } } : {},
            ],
          }
        : {}),
    } satisfies Prisma.LeaveRequestWhereInput;
  }

  private toDateOnly(value: string) {
    const source = value.length === 10 ? `${value}T00:00:00.000Z` : value;
    return new Date(source);
  }

  private toDateTimeBoundary(value: string, boundary: 'start' | 'end') {
    const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
    return new Date(`${value}T${time}+07:00`);
  }

  private getPagination(query: ManagerQuery): Pagination {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
    };
  }

  private paginated<T>(
    items: T[],
    page: number,
    pageSize: number,
    total: number,
  ) {
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

  private employeeListInclude() {
    return {
      company: { select: { id: true, code: true, nameTh: true, nameEn: true } },
      branch: { select: { id: true, code: true, nameTh: true, nameEn: true } },
      department: {
        select: { id: true, code: true, nameTh: true, nameEn: true },
      },
      division: {
        select: { id: true, code: true, nameTh: true, nameEn: true },
      },
      employeeType: {
        select: { id: true, code: true, nameTh: true, nameEn: true },
      },
      positionMaster: {
        select: { id: true, code: true, nameTh: true, nameEn: true },
      },
      supervisor: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          positionId: true,
          status: true,
          positionMaster: {
            select: { id: true, code: true, nameTh: true, nameEn: true },
          },
        },
      },
      _count: { select: { subordinates: true } },
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          status: true,
        },
      },
    } satisfies Prisma.EmployeeInclude;
  }

  private employeeMiniInclude() {
    return {
      company: { select: { id: true, code: true, nameTh: true } },
      branch: { select: { id: true, code: true, nameTh: true } },
      department: { select: { id: true, code: true, nameTh: true } },
      division: { select: { id: true, code: true, nameTh: true } },
      employeeType: { select: { id: true, code: true, nameTh: true } },
      positionMaster: {
        select: { id: true, code: true, nameTh: true, nameEn: true },
      },
    };
  }

  private async findTeamEmployeeIdsBySearch(
    teamIds: string[],
    search?: string,
  ) {
    const keyword = search?.trim();

    if (!keyword || teamIds.length === 0) return [];

    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: teamIds },
        ...this.buildEmployeeSearchWhere(keyword),
      },
      select: { id: true },
    });

    return employees.map((employee) => employee.id);
  }

  private async enrichOffsiteWithEmployees<
    T extends { employeeId?: string | null },
  >(items: T[]) {
    if (!items.length) return items;

    const employeeIds = Array.from(
      new Set(items.map((item) => item.employeeId).filter(Boolean) as string[]),
    );

    if (!employeeIds.length) return items;

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        title: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
        userId: true,
        company: { select: { id: true, code: true, nameTh: true } },
        branch: { select: { id: true, code: true, nameTh: true } },
        department: { select: { id: true, code: true, nameTh: true } },
      },
    });

    const employeeMap = new Map(
      employees.map((employee) => [employee.id, employee]),
    );

    return items.map((item) => ({
      ...item,
      employee: item.employeeId
        ? (employeeMap.get(item.employeeId) ?? null)
        : null,
    }));
  }

  private attendanceLogInclude() {
    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          status: true,
          company: { select: { id: true, code: true, nameTh: true } },
          branch: { select: { id: true, code: true, nameTh: true } },
          department: { select: { id: true, code: true, nameTh: true } },
          division: { select: { id: true, code: true, nameTh: true } },
        },
      },
      device: { select: { id: true, code: true, name: true, type: true } },
      location: { select: { id: true, code: true, nameTh: true, type: true } },
      createdBy: { select: { id: true, email: true, displayName: true } },
    } satisfies Prisma.AttendanceLogInclude;
  }

  private leaveRequestInclude() {
    return {
      employee: { include: this.employeeMiniInclude() },
      leaveType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          isPaid: true,
          requiresAttachment: true,
        },
      },
      submittedBy: { select: { id: true, email: true, displayName: true } },
      cancelledBy: { select: { id: true, email: true, displayName: true } },
    } satisfies Prisma.LeaveRequestInclude;
  }

  private overtimeRequestInclude() {
    return {
      employee: { include: this.employeeMiniInclude() },
      submittedBy: { select: { id: true, email: true, displayName: true } },
      cancelledBy: { select: { id: true, email: true, displayName: true } },
    } satisfies Prisma.OvertimeRequestInclude;
  }

  private timeAdjustRequestInclude() {
    return {
      employee: { include: this.employeeMiniInclude() },
      originalAttendanceLog: {
        include: this.attendanceLogInclude(),
      },
      appliedAttendanceLog: {
        include: this.attendanceLogInclude(),
      },
      submittedBy: { select: { id: true, email: true, displayName: true } },
      cancelledBy: { select: { id: true, email: true, displayName: true } },
    } satisfies Prisma.TimeAdjustRequestInclude;
  }

  /* ------------------------------------------------------------ Mobile only
   *
   * เมธอดกลุ่มนี้เพิ่มขึ้นมาสำหรับแอปมือถือโดยเฉพาะ และ **ห้ามแก้เมธอดของเว็บ
   * ด้านบนเพื่อรองรับแอป** — เว็บอยู่ในสถานะ freeze ทุกอย่างที่แอปต้องการเพิ่ม
   * ต้องเป็นเมธอดใหม่ที่ใช้ helper ตัวเดิม เพื่อให้ผลลัพธ์ตรงกันโดยไม่แตะ path
   * ที่หน้าเว็บวิ่งอยู่
   *
   * ทุกตัวยัง resolve ทีมจาก token เหมือนเดิม และ **ไม่เชื่อ employeeId จาก
   * client** — ถ้าส่ง id ที่ไม่ใช่ลูกทีมมา จะถูกตัดออกด้วย teamIds ตั้งแต่ชั้น
   * where ไม่ใช่แค่ซ่อนตอนแสดงผล
   */

  /**
   * รหัสพนักงานที่อยู่ในทีมจริง หลังกรองด้วย employeeId ที่ client ขอมา
   *
   * คืนเป็น array เสมอ ถ้า client ขอคนที่ไม่ใช่ลูกทีมจะได้ array ว่าง ทำให้
   * query ที่ตามมาไม่คืนอะไรเลย แทนที่จะ throw — ผู้ใช้ที่เพิ่งถูกย้ายออกจาก
   * ทีมระหว่างเปิดจอค้างไว้ควรเห็น "ไม่มีข้อมูล" ไม่ใช่หน้า error สีแดง
   */
  private async resolveScopedTeamIds(
    managerEmployeeId: string,
    employeeId?: string,
  ) {
    const teamIds = await this.findDirectTeamIds(managerEmployeeId);

    if (!employeeId) return teamIds;

    return teamIds.filter((id) => id === employeeId);
  }

  /**
   * รายละเอียดลูกทีมรายคนสำหรับแอป (จอ drill-down)
   *
   * ใช้ getTeamSummary แล้วเลือกคนที่ต้องการ แทนที่จะ query ใหม่ทั้งชุด
   * เพราะสถานะวันนี้ ยอดสะสมรายเดือน กะที่มีผล และวันลาคงเหลือ ถูกคำนวณ
   * ด้วยกติกาชุดเดียวกับที่หน้าเว็บใช้อยู่ในนั้นแล้ว การเขียนใหม่แปลว่า
   * ต้องมาไล่ให้ตรงกันเองตลอดไป ซึ่งเป็นที่มาของ "เลขบนแอปไม่ตรงกับเว็บ"
   *
   * แลกด้วยการโหลดทั้งทีมเพื่อดูคนเดียว — ทีมของหัวหน้าหนึ่งคนมีหลักสิบ
   * ไม่ใช่หลักพัน และจอนี้ไม่ได้เปิดถี่ จึงคุ้มกว่าการมีสูตรคู่ขนาน
   */
  async findMobileTeamMember(
    currentUser: AuthenticatedUser,
    employeeId: string,
    query: ManagerQuery = {},
  ) {
    const summary = await this.getTeamSummary(currentUser, query);
    const member = summary.members.find(
      (item) => item.employee.id === employeeId,
    );

    if (!member) {
      throw new ForbiddenException('พนักงานคนนี้ไม่ได้อยู่ในทีมของคุณ');
    }

    return {
      date: summary.date,
      holiday: summary.holiday,
      member,
      month: summary.month,
    };
  }

  /**
   * ประวัติการลงเวลาของทีม (หรือของสมาชิกคนเดียวเมื่อส่ง employeeId)
   *
   * ต่างจาก getAttendance ของเว็บตรงที่ไม่คืนก้อน summary + missingCheckIn
   * ซึ่งเว็บใช้ทำแถบสรุปด้านบน แต่แอปมีตัวเลขชุดนั้นจาก /team/summary อยู่แล้ว
   * การส่งซ้ำแปลว่ายิง query หนักเพิ่มโดยไม่มีใครอ่าน
   */
  async findMobileTeamAttendance(
    currentUser: AuthenticatedUser,
    query: ManagerQuery,
  ) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.resolveScopedTeamIds(
      manager.id,
      query.employeeId,
    );
    const { page, pageSize, skip } = this.getPagination(query);

    const where: Prisma.AttendanceLogWhereInput = {
      employeeId: { in: teamIds },
      deletedAt: null,
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status as never }
        : {}),
      ...this.buildWorkDateRangeWhere(query.dateFrom, query.dateTo),
      ...this.buildAttendanceSearchWhere(query.search || query.q),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ workDate: 'desc' }, { logTime: 'desc' }],
        include: this.attendanceLogInclude(),
      }),
      this.prisma.attendanceLog.count({ where }),
    ]);

    return this.paginated(items, page, pageSize, total);
  }

  /**
   * คำขอของทีมทุกประเภทในรายการเดียว
   *
   * เว็บแยกเป็นสี่หน้า (ลา / OT / แก้เวลา / นอกสถานที่) เพราะมีพื้นที่พอจะโชว์
   * คอลัมน์เฉพาะของแต่ละประเภท แต่บนมือถือหัวหน้าถามว่า "ทีมยื่นอะไรมาบ้าง"
   * ไม่ได้ถามแยกประเภท จึงรวมให้เป็นรายการเดียวเรียงตามวันที่ยื่น
   *
   * ดึงเกินหน้าที่ขอหนึ่งรายการ (`windowSize`) เพื่อรู้ว่ายังมีต่อไหม โดยไม่ต้อง
   * count ทั้งสี่ตาราง — ตัวเลขรวมที่แม่นยำไม่มีใครใช้บนจอนี้ แต่ค่า count
   * สี่ครั้งต่อการเลื่อนหนึ่งหน้าเป็นราคาที่จ่ายจริงทุกครั้ง
   */
  async findMobileTeamRequests(
    currentUser: AuthenticatedUser,
    query: ManagerQuery,
  ) {
    const manager = await this.resolveManagerEmployee(currentUser);
    const teamIds = await this.resolveScopedTeamIds(
      manager.id,
      query.employeeId,
    );
    const { page, pageSize } = this.getPagination(query);
    const windowSize = page * pageSize + 1;
    const status =
      query.status && query.status !== 'ALL' ? query.status : undefined;
    const requestedType = query.type && query.type !== 'ALL' ? query.type : null;
    const wants = (type: string) => !requestedType || requestedType === type;

    if (teamIds.length === 0) {
      return {
        items: [],
        meta: { hasMore: false, page, pageSize },
      };
    }

    const teamScope = { deletedAt: null, employeeId: { in: teamIds } };

    const [leaves, overtimes, timeAdjusts, offsites] = await Promise.all([
      wants('LEAVE')
        ? this.prisma.leaveRequest.findMany({
            where: {
              ...teamScope,
              ...(status ? { status: status as never } : {}),
              ...this.buildLeaveDateRangeWhere(query.dateFrom, query.dateTo),
              ...this.buildLeaveSearchWhere(query.search || query.q),
            },
            take: windowSize,
            orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
            include: this.leaveRequestInclude(),
          })
        : [],
      wants('OVERTIME')
        ? this.prisma.overtimeRequest.findMany({
            where: {
              ...teamScope,
              ...(status ? { status: status as never } : {}),
              ...this.buildWorkDateRangeWhere(query.dateFrom, query.dateTo),
              ...this.buildOvertimeSearchWhere(query.search || query.q),
            },
            take: windowSize,
            orderBy: [{ workDate: 'desc' }, { submittedAt: 'desc' }],
            include: this.overtimeRequestInclude(),
          })
        : [],
      wants('TIME_ADJUST')
        ? this.prisma.timeAdjustRequest.findMany({
            where: {
              ...teamScope,
              ...(status ? { status: status as never } : {}),
              ...this.buildTimeAdjustDateRangeWhere(
                query.dateFrom,
                query.dateTo,
              ),
              ...this.buildTimeAdjustSearchWhere(query.search || query.q),
            },
            take: windowSize,
            orderBy: [{ requestedLogTime: 'desc' }, { createdAt: 'desc' }],
            include: this.timeAdjustRequestInclude(),
          })
        : [],
      wants('OFFSITE')
        ? this.prisma.offsiteWorkRequest.findMany({
            where: {
              ...teamScope,
              ...(status ? { status: status as never } : {}),
              ...this.buildOffsiteWorkDateRangeWhere(
                query.dateFrom,
                query.dateTo,
              ),
            },
            take: windowSize,
            orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
          })
        : [],
    ]);

    /*
     * OffsiteWorkRequest ถือ employeeId เป็น scalar ไม่มี relation ใน schema
     * (ต่างจากอีกสามประเภท) จึง include ชื่อพนักงานมาพร้อมกันไม่ได้ ต้องดึงเอง
     *
     * ดึงเฉพาะรหัสที่โผล่ในผลลัพธ์จริง ไม่ใช่ทั้งทีม เพราะหน้าที่กรองด้วย
     * ช่วงวันที่แคบ ๆ มักมี offsite ไม่กี่คน
     */
    const offsiteEmployeeIds = [
      ...new Set(offsites.map((item) => item.employeeId)),
    ];
    const offsiteEmployees = offsiteEmployeeIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: offsiteEmployeeIds } },
          include: this.employeeMiniInclude(),
        })
      : [];
    const offsiteEmployeeById = new Map(
      offsiteEmployees.map((employee) => [employee.id, employee]),
    );

    const merged = [
      ...leaves.map((item) => ({ type: 'LEAVE' as const, item })),
      ...overtimes.map((item) => ({ type: 'OVERTIME' as const, item })),
      ...timeAdjusts.map((item) => ({ type: 'TIME_ADJUST' as const, item })),
      ...offsites.map((item) => ({
        type: 'OFFSITE' as const,
        item: {
          ...item,
          employee: offsiteEmployeeById.get(item.employeeId) ?? null,
        },
      })),
    ];

    /*
     * เรียงด้วยวันที่ยื่นเป็นหลัก ตกลงมาที่ createdAt เมื่อยังเป็นฉบับร่าง
     * ที่ยังไม่มี submittedAt — ไม่งั้นฉบับร่างจะไปกองท้ายสุดตลอดกาล
     */
    const sortKey = (row: (typeof merged)[number]) => {
      const source = row.item as { submittedAt?: Date | null; createdAt?: Date };
      return (source.submittedAt ?? source.createdAt ?? new Date(0)).getTime();
    };

    merged.sort((left, right) => sortKey(right) - sortKey(left));

    const start = (page - 1) * pageSize;
    const window = merged.slice(start, start + pageSize + 1);
    const hasMore = window.length > pageSize;

    return {
      items: hasMore ? window.slice(0, pageSize) : window,
      meta: { hasMore, page, pageSize },
    };
  }
}
