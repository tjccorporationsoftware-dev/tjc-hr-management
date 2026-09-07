import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SystemSettingsService } from '../settings/system-settings.service';

import { AttendanceService } from './attendance.service';

/**
 * AttendanceNudgeService
 * -----------------------------------------------------------------------------
 * เตือนเรื่องลงเวลา **ตอนที่ยังแก้ทัน** ไม่ใช่ตอนสรุปจบวันแล้ว
 *
 * ต่างจาก `AttendanceNotificationSchedulerService` ที่อ่าน `AttendanceDailySummary`
 * ซึ่งเกิดหลังคำนวณ (มักเป็นเย็นหรือวันรุ่งขึ้น) — ของสองอย่างในไฟล์นี้อ่าน
 * `AttendanceLog` สด ๆ จึงเตือนได้ตั้งแต่ยังกดเองทัน:
 *
 *   1. เลยเวลาเข้างานตามกะ 15 นาที แล้วยังไม่มีเวลาเข้า
 *   2. สองทุ่มแล้วยังไม่มีเวลาออก (ลืมกดตอนกลับ)
 *
 * ทั้งคู่ยิงผ่าน `NotificationsService.notifyNudge` ซึ่งเด้ง push เข้าเครื่อง
 * ต่างจาก Attendance Alert เดิมที่เขียนลงตารางเฉย ๆ
 *
 * **กันเด้งซ้ำด้วย `sourceKey` ที่ผูกกับ (พนักงาน + วัน + เรื่อง)** งานนี้จึง
 * วิ่งซ้ำได้ทุกนาทีและหลาย instance พร้อมกันโดยผู้ใช้ยังได้แจ้งเตือนครั้งเดียว
 */

/** นาทีหลังเวลาเข้างานตามกะที่ถือว่า "ยังไม่มา" — สั้นกว่านี้เตือนคนที่กำลังเดินเข้า */
const LATE_CHECK_IN_GRACE_MINUTES = 15;

/** เวลาเตือนคนที่ยังไม่ได้ลงเวลาออก — ดึกกว่านี้คนหลับแล้ว เร็วกว่านี้ยังทำงานอยู่ */
const MISSING_CHECKOUT_TIME = '20:00';

const TICK_INTERVAL_MS = 60_000;

/** ดึงพนักงานทีละหน้า ไม่โหลดทั้งบริษัทขึ้นหน่วยความจำพร้อมกัน */
const PAGE_SIZE = 200;

@Injectable()
export class AttendanceNudgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttendanceNudgeService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private lastRunKey: string | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  onModuleInit() {
    this.intervalId = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    this.intervalId.unref?.();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async tick() {
    const now = new Date();
    const timeKey = this.formatTimeKey(now);
    const runKey = `${this.formatDateKey(now)}:${timeKey}`;

    if (this.lastRunKey === runKey || this.isRunning) {
      return;
    }

    this.lastRunKey = runKey;
    this.isRunning = true;

    try {
      const lateResult = await this.syncMissingCheckInNudges(now);

      if (lateResult.notifiedCount > 0) {
        this.logger.log(
          `เตือนยังไม่ลงเวลาเข้า ${lateResult.notifiedCount} คน เวลา ${timeKey}`,
        );
      }

      if (timeKey === MISSING_CHECKOUT_TIME) {
        const checkoutResult = await this.syncMissingCheckoutNudges(now);
        this.logger.log(
          `เตือนยังไม่ลงเวลาออก ${checkoutResult.notifiedCount} คน เวลา ${timeKey}`,
        );
      }
    } catch (error) {
      /* ปล่อยให้รอบถัดไปลองใหม่ — งานเตือนล้มต้องไม่ทำให้ระบบลงเวลาสะดุด */
      this.lastRunKey = null;
      this.logger.error(
        `งานเตือนลงเวลาไม่สำเร็จที่เวลา ${timeKey}`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * เลยเวลาเข้างานตามกะ 15 นาทีแล้วยังไม่มีเวลาเข้า
   *
   * เริ่มจาก "ใครยังไม่มีเวลาเข้าวันนี้" ก่อน แล้วค่อยหากะของคนกลุ่มนั้น —
   * ไม่ใช่ไล่หากะของพนักงานทุกคนทุกนาที เพราะกลุ่มที่ยังไม่ลงเวลาเป็นส่วนน้อย
   * และการหากะต้องอ่านหลายตาราง (ผูกรายคน → สาขา → ค่าเริ่มต้นบริษัท)
   */
  async syncMissingCheckInNudges(now: Date = new Date()) {
    const workDate = this.startOfDay(now);
    const dateKey = this.formatDateKey(workDate);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let notifiedCount = 0;
    let cursorId: string | null = null;

    for (;;) {
      const employees = await this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          status: { in: ['ACTIVE', 'PROBATION'] },
          userId: { not: null },
          /* ยังไม่มีรายการลงเวลาของวันนี้เลย */
          attendanceLogs: {
            none: {
              workDate,
              deletedAt: null,
              status: { not: 'CANCELLED' },
            },
          },
        },
        take: PAGE_SIZE,
        orderBy: { id: 'asc' },
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          branchId: true,
          companyId: true,
          employeeTypeId: true,
          id: true,
          userId: true,
        },
      });

      if (employees.length === 0) break;

      cursorId = employees[employees.length - 1]?.id ?? null;

      for (const employee of employees) {
        const holiday =
          await this.systemSettings.getEmployeeAttendanceHolidayInfo(
            workDate,
            employee as never,
          );

        /* วันหยุดกดลงเวลาได้ก็จริง แต่ไม่ใช่วันที่ต้องมา จึงไม่เตือน */
        if (holiday.isHoliday) continue;

        const onLeave = await this.hasApprovedLeave(employee.id, workDate);

        if (onLeave) continue;

        const { rules } = await this.attendance.getEffectivePunchSessions(
          employee,
          workDate,
        );

        const morningRule = rules.find(
          (rule: { punchType?: string; sessionCode?: string }) =>
            rule.sessionCode === 'MORNING_IN' || rule.punchType === 'CHECK_IN',
        );

        if (!morningRule?.expectedTime) continue;

        const expectedMinutes = this.toMinutes(
          String(morningRule.expectedTime),
        );

        if (expectedMinutes === null) continue;

        /*
         * เตือนเฉพาะ "นาทีที่ครบพอดี" ไม่ใช่ทุกนาทีหลังจากนั้น — ถ้าเช็คแบบ
         * มากกว่าหรือเท่ากับ คนที่ลาป่วยกะทันหันจะโดนเตือนซ้ำทั้งวัน
         * (sourceKey กันซ้ำอยู่แล้ว แต่ก็ไม่ควรไปอ่านตารางกะทุกนาทีเปล่า ๆ)
         */
        if (nowMinutes !== expectedMinutes + LATE_CHECK_IN_GRACE_MINUTES) {
          continue;
        }

        await this.notifications.notifyNudge([employee.userId], {
          entityId: `${employee.id}:${dateKey}`,
          entityType: 'AttendanceLog',
          link: '/attendance',
          message: `เลยเวลาเข้างาน (${morningRule.expectedTime}) มาแล้ว ${LATE_CHECK_IN_GRACE_MINUTES} นาที กดลงเวลาเข้างานได้จากแอป`,
          severity: 'WARNING',
          sourceKey: `attendance-nudge:check-in:${employee.id}:${dateKey}`,
          title: 'ยังไม่ได้ลงเวลาเข้างาน',
          type: 'ATTENDANCE_MISSING_CHECK_IN_NUDGE',
        });

        notifiedCount += 1;
      }

      if (employees.length < PAGE_SIZE) break;
    }

    return { dateKey, notifiedCount };
  }

  /**
   * สองทุ่มแล้วยังไม่มีเวลาออก
   *
   * เงื่อนไขคือ "มีเวลาเข้าแล้วแต่ไม่มีเวลาออก" — คนที่ไม่ได้มาทำงานเลยไม่เข้า
   * ข่ายนี้ (เป็นเรื่องของการเตือนตอนเช้า) และไม่ต้องดูปฏิทินวันหยุดด้วย
   * เพราะการมีเวลาเข้าแปลว่าวันนั้นเขามาทำงานจริงไม่ว่าปฏิทินจะว่าอย่างไร
   */
  async syncMissingCheckoutNudges(now: Date = new Date()) {
    const workDate = this.startOfDay(now);
    const dateKey = this.formatDateKey(workDate);

    let notifiedCount = 0;
    let cursorId: string | null = null;

    for (;;) {
      const employees = await this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          userId: { not: null },
          attendanceLogs: {
            some: {
              workDate,
              deletedAt: null,
              logType: 'CHECK_IN',
              status: { not: 'CANCELLED' },
            },
            none: {
              workDate,
              deletedAt: null,
              logType: 'CHECK_OUT',
              status: { not: 'CANCELLED' },
            },
          },
        },
        take: PAGE_SIZE,
        orderBy: { id: 'asc' },
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: { id: true, userId: true },
      });

      if (employees.length === 0) break;

      cursorId = employees[employees.length - 1]?.id ?? null;

      for (const employee of employees) {
        await this.notifications.notifyNudge([employee.userId], {
          entityId: `${employee.id}:${dateKey}`,
          entityType: 'AttendanceLog',
          link: '/attendance',
          message:
            'วันนี้มีเวลาเข้างานแต่ยังไม่มีเวลาออกงาน กดลงเวลาออก หรือยื่นขอแก้เวลาถ้าลืมกด',
          severity: 'WARNING',
          sourceKey: `attendance-nudge:check-out:${employee.id}:${dateKey}`,
          title: 'ยังไม่ได้ลงเวลาออกงาน',
          type: 'ATTENDANCE_MISSING_CHECK_OUT_NUDGE',
        });

        notifiedCount += 1;
      }

      if (employees.length < PAGE_SIZE) break;
    }

    return { dateKey, notifiedCount };
  }

  /** ลาที่อนุมัติแล้วครอบวันนี้ — คนกลุ่มนี้ไม่ต้องเตือนว่ายังไม่มา */
  private async hasApprovedLeave(employeeId: string, workDate: Date) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        status: 'APPROVED',
        startDate: { lte: workDate },
        endDate: { gte: workDate },
      },
      select: { id: true },
    });

    return leave !== null;
  }

  private toMinutes(value: string) {
    const [hours, minutes] = value.split(':');
    const hour = Number(hours);
    const minute = Number(minutes);

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

    return hour * 60 + minute;
  }

  private startOfDay(value: Date) {
    const next = new Date(value);
    next.setHours(0, 0, 0, 0);

    return next;
  }

  private formatDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private formatTimeKey(value: Date) {
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }
}
