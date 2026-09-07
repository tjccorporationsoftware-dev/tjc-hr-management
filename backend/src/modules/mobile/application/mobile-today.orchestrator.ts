import { Injectable } from '@nestjs/common';

import { AttendanceService } from '../../attendance/attendance.service';
import type { MobileFeatureFlags, MobileHeroState } from '../types/mobile-context.types';

type TodayLog = {
  id: string;
  isOffsite?: boolean | null;
  logTime: Date;
  logType: string;
  session: string | null;
  status: string;
};

type QuickAction = {
  code: string;
  enabled: boolean;
  label: string;
};

/**
 * BE-MOB-003 (ส่วน Today) — รวมข้อมูลหน้าแรกจาก Service เดิม
 *
 * หน้าที่ที่นี่มีแค่ "เรียก + ปั้นรูปแบบ" เท่านั้น
 * สถานะทั้งหมดคำนวณจากข้อมูลที่ AttendanceService ตอบมา ไม่เดาจากนาฬิกาเครื่อง
 */
@Injectable()
export class MobileTodayOrchestrator {
  constructor(private readonly attendanceService: AttendanceService) {}

  async getToday(userId: string, featureFlags: MobileFeatureFlags) {
    const today = await this.attendanceService.findMyToday(userId);

    const logs = (today.logs ?? []) as unknown as TodayLog[];
    const activeLogs = logs.filter((log) => log.status !== 'CANCELLED');

    return {
      workDate: today.workDate,
      holiday: today.holiday,
      heroState: this.resolveHeroState({
        activeLogs,
        canCheckIn: today.canCheckIn,
        canCheckOut: today.canCheckOut,
        isHoliday: Boolean(today.holiday?.isHoliday),
      }),
      canCheckIn: today.canCheckIn,
      canCheckOut: today.canCheckOut,
      timeline: activeLogs.map((log) => ({
        id: log.id,
        logType: log.logType,
        session: log.session,
        status: log.status,
        isOffsite: Boolean(log.isOffsite),
        logTime: log.logTime,
      })),
      latestLog: today.latestLog ?? null,
      quickActions: this.resolveQuickActions(today, featureFlags),
    };
  }

  private resolveHeroState(params: {
    activeLogs: TodayLog[];
    canCheckIn: boolean;
    canCheckOut: boolean;
    isHoliday: boolean;
  }): MobileHeroState {
    if (params.isHoliday) {
      return 'DAY_OFF';
    }

    const hasOffsite = params.activeLogs.some((log) => log.isOffsite);
    const hasMissingLog = params.activeLogs.some(
      (log) => log.status === 'MISSING_CHECKIN' || log.status === 'MISSING_CHECKOUT',
    );

    if (hasMissingLog) {
      return 'MISSING_LOG';
    }

    if (params.activeLogs.length === 0) {
      return params.canCheckIn ? 'NOT_CHECKED_IN' : 'NO_SHIFT';
    }

    if (hasOffsite && params.canCheckOut) {
      return 'OFFSITE_ACTIVE';
    }

    if (params.canCheckOut) {
      const checkedInAfternoon = params.activeLogs.some(
        (log) => log.session === 'AFTERNOON_IN',
      );

      return checkedInAfternoon ? 'AFTERNOON_CHECKED_IN' : 'MORNING_CHECKED_IN';
    }

    // ลงเวลาออกแล้วแต่ยังเปิดรอบถัดไปได้ = รอบบ่ายยังรออยู่
    if (params.canCheckIn) {
      return 'AFTERNOON_REQUIRED';
    }

    return 'COMPLETED';
  }

  private resolveQuickActions(
    today: { canCheckIn: boolean; canCheckOut: boolean },
    featureFlags: MobileFeatureFlags,
  ): QuickAction[] {
    return [
      {
        code: 'PUNCH_IN',
        label: 'ลงเวลาเข้างาน',
        enabled: featureFlags.attendancePunch && today.canCheckIn,
      },
      {
        code: 'PUNCH_OUT',
        label: 'ลงเวลาออกงาน',
        enabled: featureFlags.attendancePunch && today.canCheckOut,
      },
      {
        code: 'LEAVE_CREATE',
        label: 'ยื่นลา',
        enabled: featureFlags.leave,
      },
      {
        code: 'OVERTIME_CREATE',
        label: 'ขอ OT',
        enabled: featureFlags.overtime,
      },
      {
        code: 'TIME_ADJUST_CREATE',
        label: 'ขอแก้เวลา',
        enabled: featureFlags.timeAdjust,
      },
    ];
  }
}
