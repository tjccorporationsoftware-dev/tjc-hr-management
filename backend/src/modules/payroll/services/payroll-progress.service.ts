import { Injectable } from '@nestjs/common';

export type PayrollProgressStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type PayrollProgressOperation =
  | 'CALCULATION'
  | 'ATTENDANCE_RECALCULATION';

export type PayrollProgressSnapshot = {
  runId: string;
  operation: PayrollProgressOperation | null;
  status: PayrollProgressStatus;
  step: string | null;
  message: string;
  percent: number;
  processedEmployees: number;
  totalEmployees: number;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  elapsedMs: number;
  errorMessage: string | null;
};

type ProgressRecord = Omit<
  PayrollProgressSnapshot,
  'startedAt' | 'updatedAt' | 'completedAt' | 'elapsedMs'
> & {
  startedAt: Date | null;
  updatedAt: Date | null;
  completedAt: Date | null;
};

type ProgressStartInput = {
  operation: PayrollProgressOperation;
  step: string;
  message: string;
  percent?: number;
  processedEmployees?: number;
  totalEmployees?: number;
};

type ProgressUpdateInput = Partial<
  Pick<
    ProgressRecord,
    | 'step'
    | 'message'
    | 'percent'
    | 'processedEmployees'
    | 'totalEmployees'
    | 'errorMessage'
  >
>;

@Injectable()
export class PayrollProgressService {
  private readonly progressByRunId = new Map<string, ProgressRecord>();

  start(runId: string, input: ProgressStartInput) {
    const now = new Date();
    const record: ProgressRecord = {
      runId,
      operation: input.operation,
      status: 'RUNNING',
      step: input.step,
      message: input.message,
      percent: this.normalizePercent(input.percent ?? 1),
      processedEmployees: this.normalizeCount(input.processedEmployees),
      totalEmployees: this.normalizeCount(input.totalEmployees),
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
    };

    this.progressByRunId.set(runId, record);
    return this.toSnapshot(record);
  }

  update(runId: string, input: ProgressUpdateInput) {
    const current = this.getOrCreateIdleRecord(runId);
    const now = new Date();

    current.status = current.status === 'IDLE' ? 'RUNNING' : current.status;
    current.step = input.step ?? current.step;
    current.message = input.message ?? current.message;
    current.percent = this.normalizePercent(input.percent ?? current.percent);
    current.processedEmployees = this.normalizeCount(
      input.processedEmployees ?? current.processedEmployees,
    );
    current.totalEmployees = this.normalizeCount(
      input.totalEmployees ?? current.totalEmployees,
    );
    current.errorMessage = input.errorMessage ?? current.errorMessage;
    current.updatedAt = now;
    if (!current.startedAt) current.startedAt = now;

    this.progressByRunId.set(runId, current);
    return this.toSnapshot(current);
  }

  updateEmployeeProgress(
    runId: string,
    processedEmployees: number,
    totalEmployees: number,
    message?: string,
  ) {
    const safeTotal = Math.max(this.normalizeCount(totalEmployees), 1);
    const safeProcessed = Math.min(
      this.normalizeCount(processedEmployees),
      safeTotal,
    );
    const percent = 30 + Math.round((safeProcessed / safeTotal) * 58);

    return this.update(runId, {
      step: 'EMPLOYEE_PROCESSING',
      message:
        message ?? `ประมวลผลพนักงาน ${safeProcessed}/${safeTotal} ราย`,
      processedEmployees: safeProcessed,
      totalEmployees: safeTotal,
      percent,
    });
  }

  complete(runId: string, message = 'ดำเนินการเสร็จสิ้น') {
    const current = this.getOrCreateIdleRecord(runId);
    const now = new Date();

    current.status = 'COMPLETED';
    current.step = 'COMPLETED';
    current.message = message;
    current.percent = 100;
    current.updatedAt = now;
    current.completedAt = now;
    current.errorMessage = null;
    if (!current.startedAt) current.startedAt = now;

    this.progressByRunId.set(runId, current);
    return this.toSnapshot(current);
  }

  fail(runId: string, errorMessage: string) {
    const current = this.getOrCreateIdleRecord(runId);
    const now = new Date();

    current.status = 'FAILED';
    current.step = 'FAILED';
    current.message = 'ดำเนินการไม่สำเร็จ';
    current.updatedAt = now;
    current.completedAt = now;
    current.errorMessage = errorMessage;
    if (!current.startedAt) current.startedAt = now;

    this.progressByRunId.set(runId, current);
    return this.toSnapshot(current);
  }

  get(runId: string) {
    return this.toSnapshot(this.getOrCreateIdleRecord(runId));
  }

  private getOrCreateIdleRecord(runId: string): ProgressRecord {
    const current = this.progressByRunId.get(runId);
    if (current) return current;

    const record: ProgressRecord = {
      runId,
      operation: null,
      status: 'IDLE',
      step: null,
      message: 'ยังไม่มีการประมวลผลที่กำลังทำงาน',
      percent: 0,
      processedEmployees: 0,
      totalEmployees: 0,
      startedAt: null,
      updatedAt: null,
      completedAt: null,
      errorMessage: null,
    };

    this.progressByRunId.set(runId, record);
    return record;
  }

  private toSnapshot(record: ProgressRecord): PayrollProgressSnapshot {
    const now = Date.now();
    const startedAtMs = record.startedAt?.getTime() ?? null;
    const completedAtMs = record.completedAt?.getTime() ?? null;
    const elapsedMs = startedAtMs
      ? Math.max(0, (completedAtMs ?? now) - startedAtMs)
      : 0;

    return {
      ...record,
      startedAt: record.startedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      elapsedMs,
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
