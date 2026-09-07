import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import type { AuditAction, Prisma } from "../../generated/prisma/client";

import { AuditService } from "../audit/audit.service";
import { AttendanceService } from "./attendance.service";
import {
  ATTENDANCE_SUMMARY_QUEUE,
  ATTENDANCE_SUMMARY_QUEUE_JOB_RECALCULATE_DAILY,
} from "./attendance-summary-queue.constants";
import {
  AttendanceSummaryQueueService,
  type AttendanceSummaryRecalculationPayload,
} from "./attendance-summary-queue.service";

@Processor(ATTENDANCE_SUMMARY_QUEUE)
export class AttendanceSummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceSummaryProcessor.name);

  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async process(job: Job<AttendanceSummaryRecalculationPayload>) {
    if (job.name !== ATTENDANCE_SUMMARY_QUEUE_JOB_RECALCULATE_DAILY) {
      throw new Error(`Unsupported attendance summary queue job: ${job.name}`);
    }

    await this.attendanceSummaryQueue.markRecalculationProcessing(job);
    await job.updateProgress(10);

    /*
     * ถ่ายลายนิ้วมือของข้อมูลก่อนเริ่มคำนวณ เพื่อรู้ทีหลังว่ามีอะไรเปลี่ยน
     * ระหว่างที่กำลังคำนวณอยู่หรือไม่ ถ้ามีแปลว่าผลที่เพิ่งคำนวณไปใช้ข้อมูลไม่ครบ
     *
     * ใช้ลายนิ้วมือแทนการเทียบเวลา เพราะ `@updatedAt` ถูก stamp ตอนรันคำสั่ง
     * ไม่ใช่ตอน commit ธุรกรรมที่ stamp ก่อนแต่ commit ทีหลังจึงหลุดการตรวจ
     */
    const fingerprintBefore = await this.readFingerprintSafely(job);

    try {
      const result =
        await this.attendanceService.recalculateDailySummaryFromQueue({
          employeeId: job.data.employeeId,
          workDate: job.data.workDate,
          requestedById: job.data.requestedById,
        });

      if (!result.skipped) {
        await this.requeueIfDataChangedDuringRun(job, fingerprintBefore);
      }

      if (!result.skipped) {
        await this.attendanceSummaryQueue.markRecalculationCompleted({
          job,
          summaryId: result.summaryId,
        });
      }

      await job.updateProgress(100);

      const eventCode = result.skipped
        ? result.reason === "SUMMARY_LOCKED_OR_SENT_TO_PAYROLL"
          ? "ATTENDANCE_CHANGE_BLOCKED_BY_LOCK"
          : "ATTENDANCE_AUTO_RECALCULATE_SKIPPED"
        : "ATTENDANCE_AUTO_RECALCULATED";

      await this.writeAudit(
        job,
        eventCode,
        result.skipped
          ? "ข้ามการคำนวณ Attendance อัตโนมัติ"
          : "คำนวณ Attendance อัตโนมัติสำเร็จ",
        {
          ...result,
          completedAt: new Date().toISOString(),
        },
      );

      return {
        ...result,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      const configuredAttempts = Math.max(Number(job.opts.attempts ?? 1), 1);
      const currentAttempt = job.attemptsMade + 1;
      const finalAttempt = currentAttempt >= configuredAttempts;

      await this.attendanceSummaryQueue.markRecalculationFailed({
        job,
        error,
        finalAttempt,
      });

      await this.writeAudit(
        job,
        "ATTENDANCE_AUTO_RECALCULATE_FAILED",
        finalAttempt
          ? "คำนวณ Attendance อัตโนมัติไม่สำเร็จหลัง Retry ครบแล้ว"
          : "คำนวณ Attendance อัตโนมัติไม่สำเร็จและกำลังรอ Retry",
        {
          error: error instanceof Error ? error.message : String(error),
          attempt: currentAttempt,
          configuredAttempts,
          finalAttempt,
        },
      );
      throw error;
    }
  }

  /**
   * ถ้ามีรายการลงเวลาถูกเขียนหลังจากงานนี้เริ่มอ่านข้อมูลไปแล้ว ให้คำนวณใหม่อีกรอบ
   *
   * เคสที่เจอจริง: บันทึกเวลาทั้งวันของพนักงาน 8 คนรวดเดียว แล้วมี 1 คน
   * ติดค่าปรับลืมสแกนออก 50 บาทค้างไว้ ทั้งที่กรอกเวลาออกครบ
   * กดคำนวณใหม่ด้วยมือแล้วหาย แปลว่าผลที่ผิดมาจากการอ่านข้อมูลไม่ครบ
   * ไม่ใช่สูตรคำนวณผิด
   *
   * รอบใหม่จะเข้าคิวเป็นงานต่อเนื่อง (followup) เพราะงานปัจจุบันยังทำงานอยู่
   * และจะหยุดเองเมื่อไม่มีการเขียนใหม่ระหว่างรอบ จึงไม่วนไม่รู้จบ
   */
  /** อ่านลายนิ้วมือแบบไม่ให้ล้มงานหลัก — อ่านไม่ได้ = ข้ามการตรวจรอบนี้ */
  private async readFingerprintSafely(
    job: Job<AttendanceSummaryRecalculationPayload>,
  ) {
    try {
      return await this.attendanceService.getAttendanceLogFingerprint(
        job.data.employeeId,
        job.data.workDate,
      );
    } catch (error) {
      this.logger.warn(
        `อ่านลายนิ้วมือข้อมูลลงเวลาไม่สำเร็จ employee=${job.data.employeeId} date=${job.data.workDate}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async requeueIfDataChangedDuringRun(
    job: Job<AttendanceSummaryRecalculationPayload>,
    fingerprintBefore: string | null,
  ) {
    // อ่านลายนิ้วมือตอนเริ่มไม่ได้ ก็เทียบอะไรไม่ได้ ข้ามไปดีกว่าเข้าคิวมั่ว
    if (fingerprintBefore === null) return;

    try {
      const fingerprintAfter =
        await this.attendanceService.getAttendanceLogFingerprint(
          job.data.employeeId,
          job.data.workDate,
        );

      if (fingerprintAfter === fingerprintBefore) return;

      await this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
        employeeId: job.data.employeeId,
        workDate: job.data.workDate,
        requestedById: job.data.requestedById,
        sourceType: "ATTENDANCE_LOG",
        sourceId: job.data.sourceId ?? null,
        sourceAction: "RECALCULATE_AFTER_CONCURRENT_WRITE",
      });

      await this.writeAudit(
        job,
        "ATTENDANCE_AUTO_RECALCULATE_REQUEUED",
        "มีรายการลงเวลาเปลี่ยนระหว่างคำนวณ จึงสั่งคำนวณใหม่อีกรอบ",
        {
          fingerprintBefore,
          fingerprintAfter,
        },
      );
    } catch (error) {
      /*
       * คำนวณรอบนี้สำเร็จแล้ว ห้ามให้การเข้าคิวรอบถัดไปพลาดแล้วทำให้ทั้งงานล้ม
       * แต่ต้องเห็นใน log ว่าพลาด ไม่งั้นสรุปที่ค้างผิดจะไม่มีใครรู้ว่าเกิดจากอะไร
       */
      this.logger.warn(
        `เข้าคิวคำนวณซ้ำหลังพบข้อมูลเปลี่ยนไม่สำเร็จ employee=${job.data.employeeId} date=${job.data.workDate}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async writeAudit(
    job: Job<AttendanceSummaryRecalculationPayload>,
    eventCode: string,
    description: string,
    result: Record<string, unknown>,
  ) {
    try {
      await this.auditService.createLog({
        action: "UPDATE" as AuditAction,
        entity: "AttendanceDailySummary",
        entityId:
          typeof result.summaryId === "string" ? result.summaryId : null,
        userId: job.data.requestedById,
        description,
        metadata: {
          eventCode,
          queueName: ATTENDANCE_SUMMARY_QUEUE,
          queueJobId: String(job.id ?? ""),
          employeeId: job.data.employeeId,
          workDate: job.data.workDate,
          sourceType: job.data.sourceType ?? "SYSTEM",
          sourceId: job.data.sourceId ?? null,
          sourceAction: job.data.sourceAction ?? null,
          ...result,
        } as Prisma.InputJsonValue,
      });
    } catch {
      // ไม่ให้ audit failure ทำให้ worker retry งานคำนวณที่สำเร็จแล้ว
    }
  }
}
