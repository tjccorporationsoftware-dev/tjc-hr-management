import { Injectable, Logger } from '@nestjs/common';

import { AttendanceSummaryQueueService } from './attendance-summary-queue.service';
import type { AttendanceRecalculationSourceType } from './attendance-summary-queue.service';

export type AttendanceRecalculationDateRangeInput = {
  employeeId: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  requestedById: string;
  sourceType: AttendanceRecalculationSourceType;
  sourceId?: string | null;
  sourceAction: string;
};

@Injectable()
export class AttendanceRecalculationTriggerService {
  private readonly logger = new Logger(
    AttendanceRecalculationTriggerService.name,
  );

  constructor(
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
  ) {}

  async enqueueDateRange(input: AttendanceRecalculationDateRangeInput) {
    const startDate = this.toDateOnly(input.startDate);
    const endDate = this.toDateOnly(input.endDate ?? input.startDate);

    if (endDate.getTime() < startDate.getTime()) {
      this.logger.warn(
        `ข้ามการส่งงานคำนวณ Attendance เพราะช่วงวันที่ไม่ถูกต้อง employeeId=${input.employeeId}`,
      );
      return { queued: 0, failed: 0 };
    }

    // ป้องกัน request ผิดปกติสร้างงานจำนวนมากเกินไป แต่ยังรองรับใบลาระยะยาวได้ 1 ปี
    const maxDays = 366;
    let queued = 0;
    let failed = 0;
    const cursor = new Date(startDate);

    for (let dayIndex = 0; dayIndex < maxDays && cursor <= endDate; dayIndex += 1) {
      const workDate = this.toDateKey(cursor);

      try {
        await this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
          employeeId: input.employeeId,
          workDate,
          requestedById: input.requestedById,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          sourceAction: input.sourceAction,
        });
        queued += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `ไม่สามารถส่งงานคำนวณ Attendance employeeId=${input.employeeId} workDate=${workDate}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (cursor <= endDate) {
      this.logger.warn(
        `ช่วงวันที่คำนวณ Attendance เกิน ${maxDays} วัน จึงส่งงานเฉพาะ ${maxDays} วันแรก employeeId=${input.employeeId}`,
      );
    }

    return { queued, failed };
  }

  async enqueueDate(
    input: Omit<AttendanceRecalculationDateRangeInput, 'endDate'>,
  ) {
    return this.enqueueDateRange(input);
  }

  private toDateOnly(value: Date | string) {
    const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const date = new Date(`${raw}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid attendance recalculation date: ${String(value)}`);
    }

    return date;
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
