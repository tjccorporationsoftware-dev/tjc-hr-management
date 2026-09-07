import { Injectable, NotFoundException } from "@nestjs/common";

export type AttendanceRecalculationProgressStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLING"
  | "CANCELLED";

export type AttendanceRecalculationProgressResult = {
  calculated: number;
  skippedLocked: number;
  errorCount: number;
};

export type AttendanceRecalculationProgressSnapshot = {
  progressId: string;
  status: AttendanceRecalculationProgressStatus;
  step: string;
  message: string;
  percent: number;
  processedItems: number;
  totalItems: number;
  employeeCount: number;
  dayCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  errorMessage: string | null;
  result: AttendanceRecalculationProgressResult | null;
};

type AttendanceRecalculationProgressRecord = Omit<
  AttendanceRecalculationProgressSnapshot,
  "startedAt" | "updatedAt" | "completedAt" | "elapsedMs"
> & {
  ownerUserId: string;
  startedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type AttendanceRecalculationProgressUpdate = Partial<
  Pick<
    AttendanceRecalculationProgressRecord,
    | "step"
    | "message"
    | "percent"
    | "processedItems"
    | "totalItems"
    | "employeeCount"
    | "dayCount"
    | "errorMessage"
    | "result"
  >
>;

@Injectable()
export class AttendanceProgressService {
  private readonly progressById = new Map<
    string,
    AttendanceRecalculationProgressRecord
  >();

  start(progressId: string, ownerUserId: string) {
    const now = new Date();
    const record: AttendanceRecalculationProgressRecord = {
      progressId,
      ownerUserId,
      status: "RUNNING",
      step: "PREPARE",
      message: "กำลังเตรียมการคำนวณ Attendance",
      percent: 2,
      processedItems: 0,
      totalItems: 0,
      employeeCount: 0,
      dayCount: 0,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
      result: null,
    };

    this.progressById.set(progressId, record);
    return this.toSnapshot(record);
  }

  update(
    progressId: string,
    ownerUserId: string,
    input: AttendanceRecalculationProgressUpdate,
  ) {
    const record = this.getOwnedRecord(progressId, ownerUserId);

    /* ระหว่างรอหยุด ยังให้เดินความคืบหน้าต่อได้ แต่ห้ามแตะสถานะ */
    if (record.status !== "RUNNING" && record.status !== "CANCELLING") {
      return this.toSnapshot(record);
    }

    record.step = input.step ?? record.step;
    record.message = input.message ?? record.message;
    record.percent = this.normalizePercent(input.percent ?? record.percent);
    record.processedItems = this.normalizeCount(
      input.processedItems ?? record.processedItems,
    );
    record.totalItems = this.normalizeCount(
      input.totalItems ?? record.totalItems,
    );
    record.employeeCount = this.normalizeCount(
      input.employeeCount ?? record.employeeCount,
    );
    record.dayCount = this.normalizeCount(input.dayCount ?? record.dayCount);
    record.errorMessage = input.errorMessage ?? record.errorMessage;
    record.result = input.result ?? record.result;
    record.updatedAt = new Date();

    return this.toSnapshot(record);
  }

  updateItemProgress(
    progressId: string,
    ownerUserId: string,
    processedItems: number,
    totalItems: number,
    message?: string,
  ) {
    const safeTotal = Math.max(this.normalizeCount(totalItems), 1);
    const safeProcessed = Math.min(
      this.normalizeCount(processedItems),
      safeTotal,
    );
    const percent = 35 + Math.round((safeProcessed / safeTotal) * 58);

    return this.update(progressId, ownerUserId, {
      step: "CALCULATE",
      message:
        message ?? `คำนวณ Attendance ${safeProcessed}/${safeTotal} รายการ`,
      processedItems: safeProcessed,
      totalItems: safeTotal,
      percent,
    });
  }

  complete(
    progressId: string,
    ownerUserId: string,
    result: AttendanceRecalculationProgressResult,
    message = "คำนวณ Attendance เสร็จสิ้น",
  ) {
    const record = this.getOwnedRecord(progressId, ownerUserId);
    const now = new Date();

    record.status = "COMPLETED";
    record.step = "COMPLETED";
    record.message = message;
    record.percent = 100;
    record.processedItems = Math.max(record.processedItems, record.totalItems);
    record.updatedAt = now;
    record.completedAt = now;
    record.errorMessage = null;
    record.result = result;

    return this.toSnapshot(record);
  }

  fail(progressId: string, ownerUserId: string, errorMessage: string) {
    const record = this.getOwnedRecord(progressId, ownerUserId);
    const now = new Date();

    record.status = "FAILED";
    record.step = "FAILED";
    record.message = "คำนวณ Attendance ไม่สำเร็จ";
    record.updatedAt = now;
    record.completedAt = now;
    record.errorMessage = errorMessage;

    return this.toSnapshot(record);
  }

  /**
   * ขอยกเลิก — ไม่หยุดกลางคัน แต่ตั้งธงให้ลูปคำนวณเห็นแล้วหยุดที่ขอบของกลุ่มถัดไป
   *
   * หยุดกลางกลุ่มไม่ได้เพราะแต่ละรายการกำลังเขียนสรุปรายวันอยู่
   * ตัดทิ้งกลางทางจะได้ข้อมูลค้างครึ่ง ๆ กลาง ๆ ที่แย่กว่าปล่อยให้จบกลุ่ม
   */
  requestCancel(progressId: string, ownerUserId: string) {
    const record = this.getOwnedRecord(progressId, ownerUserId);

    if (record.status !== "RUNNING") return this.toSnapshot(record);

    record.status = "CANCELLING";
    record.message = "กำลังหยุดการคำนวณ รอรายการที่ค้างอยู่ให้จบก่อน";
    record.updatedAt = new Date();

    return this.toSnapshot(record);
  }

  /** ลูปคำนวณเรียกถามระหว่างทาง — ไม่โยน error ถ้าไม่เจอ เพราะไม่อยากล้มงานที่ทำอยู่ */
  isCancelRequested(progressId: string) {
    return this.progressById.get(progressId)?.status === "CANCELLING";
  }

  cancelled(
    progressId: string,
    ownerUserId: string,
    result: AttendanceRecalculationProgressResult,
  ) {
    const record = this.getOwnedRecord(progressId, ownerUserId);
    const now = new Date();

    record.status = "CANCELLED";
    record.step = "CANCELLED";
    record.message = `หยุดการคำนวณแล้ว — คำนวณไปได้ ${result.calculated.toLocaleString("th-TH")} รายการ`;
    record.updatedAt = now;
    record.completedAt = now;
    record.result = result;

    return this.toSnapshot(record);
  }

  get(progressId: string, ownerUserId: string) {
    return this.toSnapshot(this.getOwnedRecord(progressId, ownerUserId));
  }

  private getOwnedRecord(progressId: string, ownerUserId: string) {
    const record = this.progressById.get(progressId);

    if (!record || record.ownerUserId !== ownerUserId) {
      throw new NotFoundException("ไม่พบสถานะการคำนวณ Attendance");
    }

    return record;
  }

  private toSnapshot(
    record: AttendanceRecalculationProgressRecord,
  ): AttendanceRecalculationProgressSnapshot {
    const now = Date.now();
    const completedAtMs = record.completedAt?.getTime() ?? null;

    return {
      progressId: record.progressId,
      status: record.status,
      step: record.step,
      message: record.message,
      percent: record.percent,
      processedItems: record.processedItems,
      totalItems: record.totalItems,
      employeeCount: record.employeeCount,
      dayCount: record.dayCount,
      startedAt: record.startedAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
      elapsedMs: Math.max(
        0,
        (completedAtMs ?? now) - record.startedAt.getTime(),
      ),
      errorMessage: record.errorMessage,
      result: record.result,
    };
  }

  private normalizePercent(value: unknown) {
    const percent = Number(value ?? 0);
    if (!Number.isFinite(percent)) return 0;
    return Math.min(Math.max(Math.round(percent), 0), 100);
  }

  private normalizeCount(value: unknown) {
    const count = Number(value ?? 0);
    if (!Number.isFinite(count)) return 0;
    return Math.max(Math.trunc(count), 0);
  }
}
