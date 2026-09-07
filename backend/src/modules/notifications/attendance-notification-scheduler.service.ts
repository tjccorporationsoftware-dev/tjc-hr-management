import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationNudgeService } from './notification-nudge.service';
import { NotificationsService } from './notifications.service';

/* เวลาที่ยิงงานสะกิดประจำวัน — เช้าพอที่หัวหน้ายังจัดคนแทนทัน */
const DAILY_NUDGE_SCHEDULE_TIME = '08:30';

const ATTENDANCE_NOTIFICATION_SCHEDULE_TIMES = new Set([
  '08:30',
  '09:30',
  '13:30',
  '17:30',
  '18:00',
  '23:00',
]);

const PAYROLL_REVIEW_NOTIFICATION_SCHEDULE_TIMES = new Set(['18:00', '23:00']);

const ATTENDANCE_NOTIFICATION_SCHEDULER_INTERVAL_MS = 60_000;

/**
 * AttendanceNotificationSchedulerService
 * -----------------------------------------------------------------------------
 * Phase 3B ของ Notification Center
 * - ตรวจ AttendanceDailySummary ตามเวลาที่กำหนดโดยไม่ต้องรอผู้ใช้เปิดกระดิ่ง
 * - ไม่เพิ่ม dependency ใหม่ และไม่เพิ่ม migration
 * - ใช้ sourceKey เดิมของ Attendance Alert เพื่อกันแจ้งเตือนซ้ำ
 * - Phase 3C เพิ่มการ sync แจ้งเตือนตรวจสอบก่อนเข้าเงินเดือนในรอบเย็น/ปิดท้ายวัน
 * - ถ้ามีหลาย instance ทำงานพร้อมกัน ตาราง Notification/sourceKey จะช่วยกันซ้ำอีกชั้น
 */
@Injectable()
export class AttendanceNotificationSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    AttendanceNotificationSchedulerService.name,
  );
  private intervalId: NodeJS.Timeout | null = null;
  private lastRunKey: string | null = null;
  private isRunning = false;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly nudgeService: NotificationNudgeService,
  ) {}

  onModuleInit() {
    this.intervalId = setInterval(() => {
      void this.tick();
    }, ATTENDANCE_NOTIFICATION_SCHEDULER_INTERVAL_MS);
    this.intervalId.unref?.();

    void this.tick();
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

    if (!ATTENDANCE_NOTIFICATION_SCHEDULE_TIMES.has(timeKey)) {
      return;
    }

    const runKey = `${this.formatDateKey(now)}:${timeKey}`;

    if (this.lastRunKey === runKey || this.isRunning) {
      return;
    }

    this.lastRunKey = runKey;
    this.isRunning = true;

    try {
      if (timeKey === DAILY_NUDGE_SCHEDULE_TIME) {
        await this.nudgeService.syncDailyNudges(now);
      }

      const result = await this.notificationsService.syncScheduledAttendanceAlerts(
        now,
      );
      this.logger.log(
        `Synced attendance notifications at ${timeKey} for ${result.workDate}: employees=${result.syncedEmployeeCount}, changed=${result.changedNotificationCount}, closed=${result.closedNotificationCount}, hrRecipients=${result.hrRecipientCount}`,
      );

      if (PAYROLL_REVIEW_NOTIFICATION_SCHEDULE_TIMES.has(timeKey)) {
        const payrollResult =
          await this.notificationsService.syncScheduledPayrollReviewAlerts(now);
        this.logger.log(
          `Synced payroll review notifications at ${timeKey} for ${payrollResult.periodKey}: activeItems=${payrollResult.activeItemCount}, changed=${payrollResult.changedNotificationCount}, closed=${payrollResult.closedNotificationCount}, recipients=${payrollResult.recipientCount}`,
        );
      }
    } catch (error) {
      this.lastRunKey = null;
      this.logger.error(
        `Failed to sync attendance notifications at ${timeKey}`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
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
