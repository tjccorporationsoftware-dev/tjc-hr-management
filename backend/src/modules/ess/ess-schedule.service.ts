import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { SystemSettingsService } from '../settings/system-settings.service';
import { EssScheduleQueryDto } from './dto/ess-schedule-query.dto';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

type ScheduleDayType =
  | 'WORKDAY'
  | 'WEEKEND'
  | 'HOLIDAY'
  | 'LEAVE'
  | 'OVERTIME'
  | 'ATTENDANCE'
  | 'TIME_ADJUST';

type ScheduleDayStatus =
  | 'NORMAL'
  | 'HAS_ATTENDANCE'
  | 'ON_LEAVE'
  | 'HAS_OT'
  | 'HAS_TIME_ADJUST'
  | 'MIXED';

const WEEKDAY_BY_DAY: string[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

@Injectable()
export class EssScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  async getMySchedule(currentUser: CurrentUserLike, query: EssScheduleQueryDto) {
    const employee = await this.resolveMyEmployee(currentUser);
    // ตั้งค่า/วันหยุดตามบริษัทของพนักงานคนนั้น
    const settings = await this.systemSettings.getSystemSettings(
      (employee as { companyId?: string | null }).companyId ?? null,
    );

    const weeklyHolidays: string[] = settings.attendanceWeeklyHolidays ?? ['SUN'];

    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;

    const period = this.getMonthPeriod(year, month);

    const [attendanceLogs, leaveRequests, overtimeRequests, timeAdjustRequests] =
      await Promise.all([
        this.prisma.attendanceLog.findMany({
          where: {
            employeeId: employee.id,
            deletedAt: null,
            workDate: {
              gte: period.dateFrom,
              lte: period.dateTo,
            },
          },
          orderBy: {
            logTime: 'asc',
          },
          include: {
            location: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
            device: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        } as any),

        this.prisma.leaveRequest.findMany({
          where: {
            employeeId: employee.id,
            deletedAt: null,
            status: {
              in: ['SUBMITTED', 'APPROVED'],
            } as any,
            startDate: {
              lte: period.dateTo,
            },
            endDate: {
              gte: period.dateFrom,
            },
          },
          orderBy: {
            startDate: 'asc',
          },
          include: {
            leaveType: {
              select: {
                id: true,
                code: true,
                nameTh: true,
                nameEn: true,
              },
            },
          },
        } as any),

        this.prisma.overtimeRequest.findMany({
          where: {
            employeeId: employee.id,
            deletedAt: null,
            status: {
              in: ['SUBMITTED', 'APPROVED'],
            } as any,
            workDate: {
              gte: period.dateFrom,
              lte: period.dateTo,
            },
          },
          orderBy: {
            workDate: 'asc',
          },
        } as any),

        this.prisma.timeAdjustRequest.findMany({
          where: {
            employeeId: employee.id,
            deletedAt: null,
            status: {
              in: ['SUBMITTED', 'APPROVED'],
            } as any,
            requestedLogTime: {
              gte: period.dateFrom,
              lte: period.dateTo,
            },
          },
          orderBy: {
            requestedLogTime: 'asc',
          },
        } as any),
      ]);

    /*
     * วันหยุดพิเศษของบริษัท (สงกรานต์ ชดเชย สลับวันหยุด ฯลฯ)
     * ต้องส่งวันแบบ UTC-midnight เข้าไป เพราะตัวเทียบใช้ toISOString
     * ถ้าส่ง Date เที่ยงคืนเวลาไทย วันจะเคลื่อนถอยหลังหนึ่งวันทั้งเดือน
     */
    const holidayByDay = new Map<
      number,
      { isHoliday: boolean; name: string | null; isWorkingHoliday: boolean }
    >();
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      const info = this.systemSettings.resolveEmployeeAttendanceHolidayInfo(
        utcDate,
        settings,
        employee as never,
      );
      holidayByDay.set(day, {
        isHoliday: Boolean(info.isHoliday),
        name: info.name ?? null,
        isWorkingHoliday: Boolean(info.isWorkingHoliday),
      });
    }

    const days = this.buildDays({
      year,
      month,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      weeklyHolidays,
      holidayByDay,
      attendanceLogs,
      leaveRequests,
      overtimeRequests,
      timeAdjustRequests,
    });

    const summary = days.reduce(
      (acc, day) => {
        if (day.isWeekend) acc.weekendDays += 1;
        if (!day.isWeekend) acc.workDays += 1;
        if (day.attendanceLogs.length > 0) acc.attendanceDays += 1;
        if (day.leaveRequests.length > 0) acc.leaveDays += 1;
        if (day.overtimeRequests.length > 0) acc.overtimeDays += 1;
        if (day.timeAdjustRequests.length > 0) acc.timeAdjustDays += 1;

        return acc;
      },
      {
        workDays: 0,
        weekendDays: 0,
        attendanceDays: 0,
        leaveDays: 0,
        overtimeDays: 0,
        timeAdjustDays: 0,
      },
    );

    return {
      employee: this.mapEmployee(employee),
      year,
      month,
      period: {
        label: `${String(month).padStart(2, '0')}/${year}`,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
      },
      summary,
      days,
      warning:
        'ตารางนี้เป็น ESS Schedule แบบอ่านอย่างเดียว โดยสรุปจากข้อมูลลงเวลา วันลา OT และคำขอแก้เวลา ยังไม่ใช่ระบบ Shift Scheduling เต็มรูปแบบ',
    };
  }

  /**
   * กะที่มีผลจริงของพนักงานในแต่ละวันของเดือน สำหรับ Mobile Schedule
   *
   * เป็น read projection เท่านั้น ไม่แก้ assignment/policy และไม่เปลี่ยน response
   * ของ getMySchedule() ที่เว็บใช้อยู่ ลำดับเลือกกะยึดกติกาเดียวกับ Attendance:
   * รายคน -> สาขา/ประเภทพนักงาน -> บริษัท -> ค่าเริ่มต้นของระบบ
   */
  async getMyEffectiveShiftCalendar(
    currentUser: CurrentUserLike,
    query: EssScheduleQueryDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;

    // ใช้ UTC midnight ให้ตรงกับ @db.Date ของ effectiveFrom/effectiveTo
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const prisma = this.prisma as any;

    const [assignments, scopePolicies] = await Promise.all([
      prisma.employeeWorkShift.findMany({
        where: {
          employeeId: employee.id,
          status: 'ACTIVE',
          deletedAt: null,
          effectiveFrom: { lte: monthEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
          policy: { status: 'ACTIVE', deletedAt: null },
        },
        include: {
          policy: {
            include: {
              sessionRules: {
                where: { deletedAt: null, status: 'ACTIVE' },
                orderBy: [{ sortOrder: 'asc' }, { openTime: 'asc' }],
              },
            },
          },
        },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.attendancePolicy.findMany({
        where: {
          companyId: employee.companyId,
          status: 'ACTIVE',
          deletedAt: null,
          effectiveFrom: { lte: monthEnd },
          AND: [
            { OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }] },
            employee.branchId
              ? { OR: [{ branchId: employee.branchId }, { branchId: null }] }
              : { branchId: null },
            employee.employeeTypeId
              ? {
                  OR: [
                    { employeeTypeId: employee.employeeTypeId },
                    { employeeTypeId: null },
                  ],
                }
              : { employeeTypeId: null },
          ],
        },
        include: {
          sessionRules: {
            where: { deletedAt: null, status: 'ACTIVE' },
            orderBy: [{ sortOrder: 'asc' }, { openTime: 'asc' }],
          },
        },
        orderBy: [
          { priority: 'desc' },
          { branchId: { sort: 'desc', nulls: 'last' } },
          { employeeTypeId: { sort: 'desc', nulls: 'last' } },
          { effectiveFrom: 'desc' },
          { updatedAt: 'desc' },
        ],
      }),
    ]);

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [] as Array<{ date: string; shift: Record<string, unknown> }>;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const workDate = new Date(Date.UTC(year, month - 1, day));
      const assignment = assignments.find((item: any) =>
        this.isEffectiveOn(item, workDate),
      );
      const scopePolicy = assignment
        ? null
        : scopePolicies.find((item: any) => this.isEffectiveOn(item, workDate));
      const policy = assignment?.policy ?? scopePolicy ?? null;

      days.push({
        date: this.toUtcDateKey(workDate),
        shift: policy
          ? this.mapShiftPolicy(
              policy,
              assignment ? 'EMPLOYEE' : 'SCOPE',
            )
          : this.buildDefaultShiftProjection(),
      });
    }

    return { year, month, days };
  }

  private isEffectiveOn(item: any, workDate: Date) {
    const from = new Date(item.effectiveFrom);
    const to = item.effectiveTo ? new Date(item.effectiveTo) : null;
    return from <= workDate && (!to || to >= workDate);
  }

  private mapShiftPolicy(policy: any, source: 'EMPLOYEE' | 'SCOPE') {
    return {
      id: policy.id,
      code: policy.code ?? null,
      name: policy.name ?? null,
      source,
      morningCheckInDeadline: policy.morningCheckInDeadline ?? '08:00',
      afternoonCheckInDeadline: policy.afternoonCheckInDeadline ?? '13:00',
      checkoutAllowedFrom: policy.checkoutAllowedFrom ?? '17:00',
      sessionRules: (policy.sessionRules ?? []).map((rule: any) => ({
        id: rule.id,
        sessionCode: rule.sessionCode,
        label: rule.label,
        punchType: rule.punchType,
        openTime: rule.openTime,
        expectedTime: rule.expectedTime,
        closeTime: rule.closeTime,
        requirePunch: Boolean(rule.requirePunch),
      })),
    };
  }

  private buildDefaultShiftProjection() {
    return {
      id: 'default-attendance-policy',
      code: 'DEFAULT_ATTENDANCE_POLICY',
      name: 'นโยบายเวลาเข้าออกงานมาตรฐาน',
      source: 'DEFAULT' as const,
      morningCheckInDeadline: '08:00',
      afternoonCheckInDeadline: '13:00',
      checkoutAllowedFrom: '17:00',
      sessionRules: [],
    };
  }

  private toUtcDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private buildDays(params: {
    year: number;
    month: number;
    dateFrom: Date;
    dateTo: Date;
    weeklyHolidays: string[];
    holidayByDay?: Map<
      number,
      { isHoliday: boolean; name: string | null; isWorkingHoliday: boolean }
    >;
    attendanceLogs: any[];
    leaveRequests: any[];
    overtimeRequests: any[];
    timeAdjustRequests: any[];
  }) {
    const result: {
      date: string;
      dayOfMonth: number;
      dayName: string;
      isWeekend: boolean;
      isHoliday: boolean;
      holidayName: string | null;
      types: ScheduleDayType[];
      status: ScheduleDayStatus;
      attendanceLogs: any[];
      leaveRequests: any[];
      overtimeRequests: any[];
      timeAdjustRequests: any[];
    }[] = [];

    const daysInMonth = new Date(params.year, params.month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(params.year, params.month - 1, day);
      const dateKey = this.toDateKey(date);
      const dayOfWeek = date.getDay();
      const isWeekend = params.weeklyHolidays.includes(WEEKDAY_BY_DAY[dayOfWeek]);

      const attendanceLogs = params.attendanceLogs.filter((item) =>
        this.isSameDate(item.workDate, date),
      );

      const leaveRequests = params.leaveRequests.filter((item) =>
        this.isDateInRange(date, item.startDate, item.endDate),
      );

      const overtimeRequests = params.overtimeRequests.filter((item) =>
        this.isSameDate(item.workDate, date),
      );

      const timeAdjustRequests = params.timeAdjustRequests.filter((item) =>
        this.isSameDate(item.requestedLogTime, date),
      );

      const holiday = params.holidayByDay?.get(day) ?? {
        isHoliday: false,
        name: null,
        isWorkingHoliday: false,
      };
      // วันหยุดที่สั่งให้มาทำงาน (work override) ถือเป็นวันทำงานตามเดิม
      const isHoliday = holiday.isHoliday && !holiday.isWorkingHoliday;

      const types: ScheduleDayType[] = [];

      if (isHoliday) types.push('HOLIDAY');
      types.push(isWeekend ? 'WEEKEND' : 'WORKDAY');

      if (attendanceLogs.length > 0) types.push('ATTENDANCE');
      if (leaveRequests.length > 0) types.push('LEAVE');
      if (overtimeRequests.length > 0) types.push('OVERTIME');
      if (timeAdjustRequests.length > 0) types.push('TIME_ADJUST');

      result.push({
        date: dateKey,
        dayOfMonth: day,
        dayName: this.dayNameTh(date),
        isWeekend,
        isHoliday,
        holidayName: isHoliday ? holiday.name : null,
        types,
        status: this.resolveStatus({
          attendanceLogs,
          leaveRequests,
          overtimeRequests,
          timeAdjustRequests,
        }),
        attendanceLogs,
        leaveRequests,
        overtimeRequests,
        timeAdjustRequests,
      });
    }

    return result;
  }

  private resolveStatus(params: {
    attendanceLogs: any[];
    leaveRequests: any[];
    overtimeRequests: any[];
    timeAdjustRequests: any[];
  }): ScheduleDayStatus {
    const count =
      (params.attendanceLogs.length > 0 ? 1 : 0) +
      (params.leaveRequests.length > 0 ? 1 : 0) +
      (params.overtimeRequests.length > 0 ? 1 : 0) +
      (params.timeAdjustRequests.length > 0 ? 1 : 0);

    if (count > 1) return 'MIXED';
    if (params.leaveRequests.length > 0) return 'ON_LEAVE';
    if (params.overtimeRequests.length > 0) return 'HAS_OT';
    if (params.timeAdjustRequests.length > 0) return 'HAS_TIME_ADJUST';
    if (params.attendanceLogs.length > 0) return 'HAS_ATTENDANCE';

    return 'NORMAL';
  }

  private async resolveMyEmployee(currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        employeeType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        profile: true,
      },
    } as any);

    if (!employee) {
      throw new NotFoundException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถดูตารางงานได้',
      );
    }

    return employee;
  }

  private mapEmployee(employee: any) {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName:
        employee.displayName ||
        [employee.firstName, employee.lastName].filter(Boolean).join(' '),
      position: employee.position ?? null,
      company: employee.company ?? null,
      branch: employee.branch ?? null,
      department: employee.department ?? null,
      employeeType: employee.employeeType ?? null,
    };
  }

  private getMonthPeriod(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw new BadRequestException('ปีไม่ถูกต้อง');
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('เดือนไม่ถูกต้อง');
    }

    return {
      dateFrom: new Date(year, month - 1, 1),
      dateTo: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }

  private isDateInRange(value: Date, start: unknown, end: unknown) {
    if (!start || !end) return false;

    const startDate = new Date(String(start));
    const endDate = new Date(String(end));

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return value >= startDate && value <= endDate;
  }

  private isSameDate(value: unknown, target: Date) {
    if (!value) return false;

    const date = new Date(String(value));

    if (Number.isNaN(date.getTime())) return false;

    return this.toDateKey(date) === this.toDateKey(target);
  }

  private toDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private dayNameTh(value: Date) {
    return value.toLocaleDateString('th-TH', {
      weekday: 'long',
    });
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    }

    return actorId;
  }
}