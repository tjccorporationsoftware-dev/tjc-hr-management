import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EssScheduleService } from '../../ess/ess-schedule.service';
import { OffsiteWorkService } from '../../offsite-work/offsite-work.service';
import type { MobileScheduleQueryDto } from '../dto/mobile-schedule.dto';

type OffsitePage = {
  items?: Record<string, unknown>[];
  meta?: { page?: number; totalPages?: number };
};

type ScheduleDay = Record<string, any> & {
  date: string;
  types?: string[];
};

/**
 * Aggregate query ของปฏิทินมือถือ
 *
 * กติกา ADR-001:
 * - ไม่ query Prisma จาก MobileModule
 * - ไม่คำนวณ business rule ชุดใหม่
 * - ดึงข้อมูลจาก service เจ้าของ domain แล้วทำเพียง mobile projection/aggregation
 */
@Injectable()
export class MobileScheduleOrchestrator {
  constructor(
    private readonly essSchedule: EssScheduleService,
    private readonly offsiteWork: OffsiteWorkService,
  ) {}

  async getMySchedule(
    user: AuthenticatedUser,
    query: MobileScheduleQueryDto,
  ) {
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [base, shifts, offsiteRequests] = await Promise.all([
      this.essSchedule.getMySchedule(user, { year, month }),
      this.essSchedule.getMyEffectiveShiftCalendar(user, { year, month }),
      this.findMyOffsiteForMonth(user, dateFrom, dateTo),
    ]);

    const offsiteByDate = new Map<string, Record<string, unknown>[]>();
    for (const item of offsiteRequests) {
      const key = this.dateKey(item.workDate);
      if (!key) continue;
      const current = offsiteByDate.get(key) ?? [];
      current.push(this.mapOffsite(item));
      offsiteByDate.set(key, current);
    }

    const shiftByDate = new Map(
      shifts.days.map((day) => [day.date, day.shift] as const),
    );

    const days = ((base.days ?? []) as ScheduleDay[]).map((day) => {
      const offsite = offsiteByDate.get(day.date) ?? [];
      const types = [...(day.types ?? [])];
      if (offsite.length > 0 && !types.includes('OFFSITE')) types.push('OFFSITE');

      return {
        date: day.date,
        dayOfMonth: day.dayOfMonth,
        dayName: day.dayName,
        isWeekend: Boolean(day.isWeekend),
        isHoliday: Boolean(day.isHoliday),
        holidayName: day.holidayName ?? null,
        status: day.status,
        types,
        shift: shiftByDate.get(day.date) ?? null,
        attendanceLogs: (day.attendanceLogs ?? []).map((item: any) =>
          this.mapAttendance(item),
        ),
        leaveRequests: (day.leaveRequests ?? []).map((item: any) =>
          this.mapLeave(item),
        ),
        overtimeRequests: (day.overtimeRequests ?? []).map((item: any) =>
          this.mapOvertime(item),
        ),
        timeAdjustRequests: (day.timeAdjustRequests ?? []).map((item: any) =>
          this.mapTimeAdjust(item),
        ),
        offsiteRequests: offsite,
      };
    });

    const offsiteDays = days.filter(
      (day) => day.offsiteRequests.length > 0,
    ).length;

    return {
      employee: base.employee,
      year: base.year,
      month: base.month,
      period: base.period,
      summary: {
        ...base.summary,
        offsiteDays,
      },
      days,
      warning: base.warning,
    };
  }

  private async findMyOffsiteForMonth(
    user: AuthenticatedUser,
    dateFrom: string,
    dateTo: string,
  ) {
    const statuses = [
      'SUBMITTED',
      'MANAGER_APPROVED',
      'HR_APPROVED',
      'APPROVED',
    ] as const;
    const results: Record<string, unknown>[] = [];

    for (const status of statuses) {
      let page = 1;
      let totalPages = 1;

      do {
        const result = (await this.offsiteWork.findMy(
          {
            page,
            pageSize: 100,
            dateFrom,
            dateTo,
            status: status as never,
          },
          user,
        )) as OffsitePage;

        results.push(...(result.items ?? []));
        totalPages = Math.max(Number(result.meta?.totalPages ?? 1), 1);
        page += 1;
      } while (page <= totalPages);
    }

    return results;
  }

  private mapAttendance(item: any) {
    return {
      id: String(item.id),
      logTime: item.logTime,
      logType: item.logType ?? null,
      session: item.session ?? null,
      status: item.status ?? null,
      locationName: item.location?.nameTh ?? null,
      deviceName: item.device?.name ?? null,
    };
  }

  private mapLeave(item: any) {
    return {
      id: String(item.id),
      requestNo: item.requestNo ?? null,
      status: item.status ?? null,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      totalDays: Number(item.totalDays ?? 0),
      leaveTypeName:
        item.leaveType?.nameTh ?? item.leaveType?.nameEn ?? item.leaveType?.code ?? null,
      reason: item.reason ?? null,
    };
  }

  private mapOvertime(item: any) {
    return {
      id: String(item.id),
      requestNo: item.requestNo ?? null,
      status: item.status ?? null,
      workDate: item.workDate ?? null,
      startTime: item.startTime ?? null,
      endTime: item.endTime ?? null,
      requestedHours: Number(item.totalHours ?? 0),
      reason: item.reason ?? null,
    };
  }

  private mapTimeAdjust(item: any) {
    return {
      id: String(item.id),
      requestNo: item.requestNo ?? null,
      status: item.status ?? null,
      requestedLogTime: item.requestedLogTime ?? null,
      requestedLogType: item.targetLogType ?? null,
      reason: item.reason ?? null,
    };
  }

  private mapOffsite(item: Record<string, unknown>) {
    return {
      id: String(item.id),
      requestNo: item.requestNo ?? null,
      status: item.status ?? null,
      workDate: item.workDate ?? null,
      locationName: item.locationName ?? null,
      locationType: item.locationType ?? null,
      reason: item.reason ?? null,
    };
  }

  private dateKey(value: unknown) {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
