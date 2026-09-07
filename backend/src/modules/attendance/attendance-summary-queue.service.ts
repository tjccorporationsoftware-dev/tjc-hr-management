import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Job, Queue } from "bullmq";
import {
  AttendanceReviewStatus,
  type AuditAction,
  type Prisma,
} from "../../generated/prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  ATTENDANCE_SUMMARY_QUEUE,
  ATTENDANCE_SUMMARY_QUEUE_JOB_RECALCULATE_DAILY,
} from "./attendance-summary-queue.constants";

export type AttendanceRecalculationSourceType =
  | "ATTENDANCE_LOG"
  | "ATTENDANCE_IMPORT"
  | "LEAVE_REQUEST"
  | "OVERTIME_REQUEST"
  | "OFFSITE_REQUEST"
  | "TIME_ADJUST_REQUEST"
  | "HOLIDAY"
  | "ATTENDANCE_POLICY"
  | "MANUAL_RECALCULATE"
  | "SYSTEM";

export type AttendanceSummaryRecalculationPayload = {
  employeeId: string;
  workDate: string;
  requestedById: string;
  sourceType?: AttendanceRecalculationSourceType;
  sourceId?: string | null;
  sourceAction?: string | null;
};

type RecalculationMarkerStatus =
  | "PENDING"
  | "PROCESSING"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED";

const PENDING_JOB_STATES = [
  "active",
  "delayed",
  "prioritized",
  "waiting",
  "waiting-children",
] as const;

const PENDING_MARKER_STATUSES = new Set<RecalculationMarkerStatus>([
  "PENDING",
  "PROCESSING",
  "RETRYING",
]);

@Injectable()
export class AttendanceSummaryQueueService {
  constructor(
    @InjectQueue(ATTENDANCE_SUMMARY_QUEUE)
    private readonly attendanceSummaryQueue: Queue<AttendanceSummaryRecalculationPayload>,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async enqueueDailySummaryRecalculation(
    params: AttendanceSummaryRecalculationPayload,
  ) {
    const normalized = this.normalizePayload(params);
    const primaryJobId = this.buildJobId(
      normalized.employeeId,
      normalized.workDate,
    );
    const primaryJob = await this.attendanceSummaryQueue.getJob(primaryJobId);

    if (primaryJob) {
      const primaryState = await primaryJob.getState();

      if (primaryState === "active") {
        return this.enqueueOrMergeFollowUpJob(normalized, primaryJobId);
      }

      if (
        PENDING_JOB_STATES.includes(
          primaryState as (typeof PENDING_JOB_STATES)[number],
        )
      ) {
        await primaryJob.updateData(normalized).catch(() => undefined);
        await this.markSummaryRecalculationPending(
          normalized,
          String(primaryJob.id ?? primaryJobId),
        );
        await this.writeQueueAudit({
          eventCode: "ATTENDANCE_AUTO_RECALCULATE_DEDUPLICATED",
          description: "รวมงานคำนวณ Attendance ที่ซ้ำกันไว้ใน Queue เดิม",
          params: normalized,
          job: primaryJob,
          deduplicated: true,
        });
        return primaryJob;
      }

      await primaryJob.remove().catch(() => undefined);
    }

    return this.addJob(normalized, primaryJobId, false);
  }

  async findPendingRecalculationKeys() {
    const jobs = await this.attendanceSummaryQueue.getJobs(
      [...PENDING_JOB_STATES],
      0,
      -1,
      true,
    );

    return new Set(
      jobs
        .filter((job) => job?.data?.employeeId && job?.data?.workDate)
        .map((job) =>
          this.buildSummaryKey(job.data.employeeId, job.data.workDate),
        ),
    );
  }

  async markRecalculationProcessing(
    job: Job<AttendanceSummaryRecalculationPayload>,
  ) {
    return this.updateRecalculationMarker({
      payload: this.normalizePayload(job.data),
      queueJobId: String(job.id ?? ""),
      status: "PROCESSING",
      metadata: {
        startedAt: new Date().toISOString(),
        attempt: job.attemptsMade + 1,
      },
    });
  }

  async markRecalculationCompleted(params: {
    job: Job<AttendanceSummaryRecalculationPayload>;
    summaryId?: string | null;
  }) {
    return this.updateRecalculationMarker({
      payload: this.normalizePayload(params.job.data),
      queueJobId: String(params.job.id ?? ""),
      summaryId: params.summaryId ?? null,
      status: "COMPLETED",
      metadata: {
        completedAt: new Date().toISOString(),
        attempt: params.job.attemptsMade + 1,
      },
    });
  }

  async markManualRecalculationCompleted(params: {
    employeeId: string;
    workDate: string;
    summaryId: string;
    requestedById: string;
  }) {
    return this.updateRecalculationMarker({
      payload: {
        employeeId: params.employeeId,
        workDate: params.workDate,
        requestedById: params.requestedById,
        sourceType: "MANUAL_RECALCULATE",
        sourceId: params.summaryId,
        sourceAction: "MANUAL_RECALCULATE_COMPLETED",
      },
      queueJobId: null,
      summaryId: params.summaryId,
      status: "COMPLETED",
      force: true,
      metadata: {
        completedAt: new Date().toISOString(),
        manual: true,
      },
    });
  }

  async markRecalculationFailed(params: {
    job: Job<AttendanceSummaryRecalculationPayload>;
    error: unknown;
    finalAttempt: boolean;
  }) {
    const attempt = params.job.attemptsMade + 1;
    const errorMessage =
      params.error instanceof Error
        ? params.error.message
        : String(params.error);

    return this.updateRecalculationMarker({
      payload: this.normalizePayload(params.job.data),
      queueJobId: String(params.job.id ?? ""),
      status: params.finalAttempt ? "FAILED" : "RETRYING",
      metadata: {
        failedAt: new Date().toISOString(),
        attempt,
        finalAttempt: params.finalAttempt,
        error: errorMessage,
      },
      markSummaryAsFailed: params.finalAttempt,
    });
  }

  isBlockingMarkerStatus(value: unknown) {
    const status = String(
      value ?? "",
    ).toUpperCase() as RecalculationMarkerStatus;
    return PENDING_MARKER_STATUSES.has(status) || status === "FAILED";
  }

  private async enqueueOrMergeFollowUpJob(
    params: AttendanceSummaryRecalculationPayload,
    primaryJobId: string,
  ) {
    const followUpJobId = `${primaryJobId}:followup`;
    const existingFollowUp =
      await this.attendanceSummaryQueue.getJob(followUpJobId);

    if (existingFollowUp) {
      const state = await existingFollowUp.getState();
      if (
        PENDING_JOB_STATES.includes(
          state as (typeof PENDING_JOB_STATES)[number],
        )
      ) {
        await existingFollowUp.updateData(params).catch(() => undefined);
        await this.markSummaryRecalculationPending(
          params,
          String(existingFollowUp.id ?? followUpJobId),
        );
        await this.writeQueueAudit({
          eventCode: "ATTENDANCE_AUTO_RECALCULATE_DEDUPLICATED",
          description:
            "รวมการเปลี่ยนแปลงล่าสุดไว้ในงานคำนวณ Attendance รอบถัดไป",
          params,
          job: existingFollowUp,
          deduplicated: true,
        });
        return existingFollowUp;
      }
      await existingFollowUp.remove().catch(() => undefined);
    }

    return this.addJob(params, followUpJobId, true);
  }

  private async addJob(
    params: AttendanceSummaryRecalculationPayload,
    jobId: string,
    followUp: boolean,
  ) {
    await this.markSummaryRecalculationPending(params, jobId);

    try {
      const job = await this.attendanceSummaryQueue.add(
        ATTENDANCE_SUMMARY_QUEUE_JOB_RECALCULATE_DAILY,
        params,
        {
          jobId,
          delay: 1000,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: {
            age: 60 * 60 * 24 * 7,
            count: 1000,
          },
        },
      );

      await this.writeQueueAudit({
        eventCode: followUp
          ? "ATTENDANCE_AUTO_RECALCULATE_FOLLOWUP_QUEUED"
          : "ATTENDANCE_AUTO_RECALCULATE_QUEUED",
        description: followUp
          ? "ส่งงานคำนวณ Attendance รอบถัดไปหลังงานเดิมกำลังประมวลผล"
          : "ส่งงานคำนวณ Attendance อัตโนมัติเข้า Queue",
        params,
        job,
        deduplicated: false,
      });

      return job;
    } catch (error) {
      await this.markQueueEnqueueFailed(params, jobId, error);
      throw error;
    }
  }

  private async markSummaryRecalculationPending(
    params: AttendanceSummaryRecalculationPayload,
    queueJobId: string,
  ) {
    const workDate = this.toDateOnly(params.workDate);
    const prisma = this.prisma as any;
    const existing = await prisma.attendanceDailySummary.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: params.employeeId,
          workDate,
        },
      },
      select: {
        id: true,
        reviewStatus: true,
        reviewedAt: true,
        readyForPayrollAt: true,
        lockedAt: true,
        sentToPayrollAt: true,
        payrollRunId: true,
        policySnapshot: true,
      },
    });

    if (!existing || this.isClosedSummary(existing)) return null;

    const queuedAt = new Date().toISOString();
    const policySnapshot = this.mergeRecalculationSnapshot(
      existing.policySnapshot,
      {
        status: "PENDING",
        queueJobId,
        queuedAt,
        requestedById: params.requestedById,
        sourceType: params.sourceType ?? "SYSTEM",
        sourceId: params.sourceId ?? null,
        sourceAction: params.sourceAction ?? null,
      },
      "RECALCULATION_PENDING",
    );

    await prisma.attendanceDailySummary.update({
      where: { id: existing.id },
      data: {
        reviewStatus: AttendanceReviewStatus.NEED_REVIEW,
        reviewedAt: null,
        reviewedById: null,
        readyForPayrollAt: null,
        readyForPayrollById: null,
        policySnapshot,
      },
    });

    if (
      [
        AttendanceReviewStatus.REVIEWED,
        AttendanceReviewStatus.READY_FOR_PAYROLL,
      ].includes(existing.reviewStatus)
    ) {
      await this.writeStandaloneAudit({
        eventCode: "ATTENDANCE_REVIEW_INVALIDATED",
        description:
          "ยกเลิกผลตรวจ Attendance เดิมทันที เนื่องจากมีข้อมูลต้นทางรอคำนวณใหม่",
        params,
        entityId: existing.id,
        metadata: {
          oldStatus: existing.reviewStatus,
          newStatus: AttendanceReviewStatus.NEED_REVIEW,
          queueJobId,
          queuedAt,
        },
      });
    }

    return existing.id as string;
  }

  private async markQueueEnqueueFailed(
    params: AttendanceSummaryRecalculationPayload,
    queueJobId: string,
    error: unknown,
  ) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await this.updateRecalculationMarker({
      payload: params,
      queueJobId,
      status: "FAILED",
      force: true,
      metadata: {
        failedAt: new Date().toISOString(),
        finalAttempt: true,
        stage: "QUEUE_ENQUEUE",
        error: errorMessage,
      },
      markSummaryAsFailed: true,
    });

    await this.writeStandaloneAudit({
      eventCode: "ATTENDANCE_AUTO_RECALCULATE_ENQUEUE_FAILED",
      description: "ส่งงานคำนวณ Attendance เข้า Queue ไม่สำเร็จ",
      params,
      entityId: null,
      metadata: { queueJobId, error: errorMessage },
    });
  }

  private async updateRecalculationMarker(params: {
    payload: AttendanceSummaryRecalculationPayload;
    queueJobId: string | null;
    status: RecalculationMarkerStatus;
    summaryId?: string | null;
    metadata?: Record<string, unknown>;
    force?: boolean;
    markSummaryAsFailed?: boolean;
  }) {
    const prisma = this.prisma as any;
    const workDate = this.toDateOnly(params.payload.workDate);
    const existing = await prisma.attendanceDailySummary.findFirst({
      where: params.summaryId
        ? { id: params.summaryId }
        : {
            employeeId: params.payload.employeeId,
            workDate,
          },
      select: {
        id: true,
        reviewStatus: true,
        lockedAt: true,
        sentToPayrollAt: true,
        payrollRunId: true,
        policySnapshot: true,
        calculationNote: true,
      },
    });

    if (!existing || this.isClosedSummary(existing)) return null;

    const base = this.asRecord(existing.policySnapshot);
    const currentMarker = this.asRecord(base.attendanceRecalculation);
    const currentJobId = String(currentMarker.queueJobId ?? "");

    if (
      !params.force &&
      params.queueJobId &&
      currentJobId &&
      currentJobId !== params.queueJobId
    ) {
      // มีงานใหม่กว่ารออยู่ ห้ามงานเก่าเขียนทับสถานะ PENDING ของงานล่าสุด
      return existing.id as string;
    }

    const reasonCode =
      params.status === "FAILED"
        ? "RECALCULATION_FAILED"
        : PENDING_MARKER_STATUSES.has(params.status)
          ? "RECALCULATION_PENDING"
          : null;
    const policySnapshot = this.mergeRecalculationSnapshot(
      existing.policySnapshot,
      {
        ...currentMarker,
        status: params.status,
        queueJobId: params.queueJobId ?? currentMarker.queueJobId ?? null,
        requestedById: params.payload.requestedById,
        sourceType:
          params.payload.sourceType ?? currentMarker.sourceType ?? "SYSTEM",
        sourceId: params.payload.sourceId ?? currentMarker.sourceId ?? null,
        sourceAction:
          params.payload.sourceAction ?? currentMarker.sourceAction ?? null,
        ...params.metadata,
      },
      reasonCode,
    );

    const data: Record<string, unknown> = { policySnapshot };
    if (params.markSummaryAsFailed) {
      data.reviewStatus = AttendanceReviewStatus.NEED_REVIEW;
      data.reviewedAt = null;
      data.reviewedById = null;
      data.readyForPayrollAt = null;
      data.readyForPayrollById = null;
      data.calculationStatus = "ERROR";
      data.calculationNote = this.appendCalculationNote(
        existing.calculationNote,
        "คำนวณ Attendance อัตโนมัติไม่สำเร็จ กรุณาตรวจสอบและคำนวณใหม่",
      );
    }

    await prisma.attendanceDailySummary.update({
      where: { id: existing.id },
      data,
    });

    return existing.id as string;
  }

  private mergeRecalculationSnapshot(
    snapshot: unknown,
    marker: Record<string, unknown>,
    reasonCode: "RECALCULATION_PENDING" | "RECALCULATION_FAILED" | null,
  ) {
    const base = this.asRecord(snapshot);
    const attendanceReview = this.asRecord(base.attendanceReview);
    const currentReasons = Array.isArray(attendanceReview.reviewReasons)
      ? attendanceReview.reviewReasons.filter(
          (reason: any) =>
            !["RECALCULATION_PENDING", "RECALCULATION_FAILED"].includes(
              String(reason?.code ?? ""),
            ),
        )
      : [];

    const reviewReasons = reasonCode
      ? [
          ...currentReasons,
          {
            code: reasonCode,
            label:
              reasonCode === "RECALCULATION_FAILED"
                ? "คำนวณ Attendance ไม่สำเร็จ"
                : "กำลังรอคำนวณ Attendance ใหม่",
            detail:
              reasonCode === "RECALCULATION_FAILED"
                ? "ต้องตรวจสอบข้อผิดพลาดและสั่งคำนวณใหม่ก่อนพร้อมล็อก"
                : "ข้อมูลต้นทางมีการเปลี่ยนแปลง ระบบยังประมวลผลไม่เสร็จ",
          },
        ]
      : currentReasons;

    return {
      ...base,
      attendanceReview: {
        ...attendanceReview,
        hasReviewIssue: reasonCode ? true : attendanceReview.hasReviewIssue,
        requiresReview: reasonCode ? true : attendanceReview.requiresReview,
        reviewReasons,
      },
      attendanceRecalculation: {
        ...this.asRecord(base.attendanceRecalculation),
        version: 1,
        ...marker,
      },
    } as Prisma.InputJsonValue;
  }

  private isClosedSummary(summary: any) {
    return Boolean(
      summary.lockedAt ||
      summary.sentToPayrollAt ||
      summary.payrollRunId ||
      summary.reviewStatus === AttendanceReviewStatus.LOCKED ||
      summary.reviewStatus === AttendanceReviewStatus.SENT_TO_PAYROLL,
    );
  }

  private normalizePayload(params: AttendanceSummaryRecalculationPayload) {
    return {
      employeeId: params.employeeId,
      workDate: String(params.workDate).slice(0, 10),
      requestedById: params.requestedById,
      sourceType: params.sourceType ?? "SYSTEM",
      sourceId: params.sourceId ?? null,
      sourceAction: params.sourceAction ?? null,
    } satisfies AttendanceSummaryRecalculationPayload;
  }

  private buildJobId(employeeId: string, workDate: string) {
    return `attendance-summary:${employeeId}:${String(workDate).slice(0, 10)}`;
  }

  private buildSummaryKey(employeeId: string, workDate: string) {
    return `${employeeId}:${String(workDate).slice(0, 10)}`;
  }

  private toDateOnly(value: string) {
    return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private appendCalculationNote(current: unknown, note: string) {
    const currentText = String(current ?? "").trim();
    if (!currentText) return note;
    if (currentText.includes(note)) return currentText;
    return `${currentText} | ${note}`;
  }

  private async writeQueueAudit(params: {
    eventCode: string;
    description: string;
    params: AttendanceSummaryRecalculationPayload;
    job: Job<AttendanceSummaryRecalculationPayload>;
    deduplicated: boolean;
  }) {
    return this.writeStandaloneAudit({
      eventCode: params.eventCode,
      description: params.description,
      params: params.params,
      entityId: null,
      metadata: {
        queueName: ATTENDANCE_SUMMARY_QUEUE,
        queueJobId: String(params.job.id ?? ""),
        deduplicated: params.deduplicated,
      },
    });
  }

  private async writeStandaloneAudit(params: {
    eventCode: string;
    description: string;
    params: AttendanceSummaryRecalculationPayload;
    entityId: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.auditService.createLog({
        action: "UPDATE" as AuditAction,
        entity: "AttendanceDailySummary",
        entityId: params.entityId,
        userId: params.params.requestedById,
        description: params.description,
        metadata: {
          eventCode: params.eventCode,
          queueName: ATTENDANCE_SUMMARY_QUEUE,
          employeeId: params.params.employeeId,
          workDate: params.params.workDate,
          sourceType: params.params.sourceType ?? "SYSTEM",
          sourceId: params.params.sourceId ?? null,
          sourceAction: params.params.sourceAction ?? null,
          ...(params.metadata ?? {}),
        } as Prisma.InputJsonValue,
      });
    } catch {
      // Queue ต้องทำงานต่อได้แม้การเขียน audit ชั่วคราวไม่สำเร็จ
    }
  }
}
