import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { TimeAdjustRequestActionDto } from "../dto/time-adjust-request-action.dto";
import { TimeAdjustAttendanceApplyService } from "./time-adjust-attendance-apply.service";
import { ApprovalMatrixResolverService } from "../../approval-workflow/services/approval-matrix-resolver.service";
import {
  canActOnApprovalStep,
  canApproveOwnRequest,
  isOwnRequest,
  type ApprovalRequestOwner,
  loadActorRoleCodes,
} from "../../approval-workflow/utils/approval-step-authorization.util";
import { AttendanceSummaryQueueService } from "../../attendance/attendance-summary-queue.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { toTimeAdjustDateOnlyFromDate } from "../utils/time-adjust-date.util";
import {
  delegatedUserIds,
  loadActiveDelegations,
} from "../../approval-workflow/utils/approval-delegation.util";

/*
 * TimeAdjustApprovalService
 * ---------------------------------------------------------
 * รวม logic อนุมัติของคำขอแก้เวลาไว้ที่เดียว
 *
 * หน้าที่หลัก:
 * - submit: หา Approval Matrix และสร้าง TimeAdjustApprovalStep
 * - approve: ตรวจสิทธิ์ผู้อนุมัติ, อนุมัติ step ปัจจุบัน, ส่งต่อ step ถัดไป
 * - reject: reject step ปัจจุบันและปิด step ที่เหลือ
 * - cancel: ยกเลิกคำขอและ step ที่ยังรออยู่
 *
 * จุดสำคัญ:
 * การแก้ AttendanceLog จริงจะเกิดเฉพาะเมื่ออนุมัติครบทุก step แล้วเท่านั้น
 */
@Injectable()
export class TimeAdjustApprovalService {
  private readonly logger = new Logger(TimeAdjustApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceApplyService: TimeAdjustAttendanceApplyService,
    private readonly approvalMatrixResolver: ApprovalMatrixResolverService,
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async submit(id: string, actorId: string) {
    const current = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลา");
    }

    if (current.status === "APPROVED") {
      throw new BadRequestException("คำขอนี้อนุมัติแล้ว");
    }

    if (current.status === "SUBMITTED") {
      throw new BadRequestException("คำขอนี้ถูกส่งขออนุมัติแล้ว");
    }

    await this.prisma.$transaction(async (tx) => {
      const approvalMatrix = await this.findApplicableApprovalMatrix(
        tx,
        current.employee,
      );

      if (!approvalMatrix) {
        throw new BadRequestException(
          "ยังไม่ได้ตั้งค่าสายอนุมัติสำหรับคำขอแก้เวลานี้ กรุณาตั้งค่า Approval Matrix ก่อน",
        );
      }

      await tx.timeAdjustRequest.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          submittedById: actorId,
        },
      });

      // ลบ step เก่าเพื่อรองรับกรณีคำขอเคยถูกดึงกลับมาแก้แล้ว submit ใหม่
      await tx.timeAdjustApprovalStep.deleteMany({
        where: {
          timeAdjustRequestId: id,
        },
      });

      await this.createTimeAdjustApprovalSteps(tx, {
        timeAdjustRequestId: id,
        employee: current.employee,
        matrix: approvalMatrix,
      });

      await tx.timeAdjustLog.create({
        data: {
          timeAdjustRequestId: id,
          action: "SUBMIT",
          oldStatus: current.status,
          newStatus: "SUBMITTED",
          reason: `ส่งคำขอแก้เวลาเพื่อขออนุมัติผ่านสายอนุมัติ ${approvalMatrix.nameTh}`,
          actedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceSummaryRecalculation({
      employeeId: current.employeeId,
      workDate: toTimeAdjustDateOnlyFromDate(current.requestedLogTime),
      requestedById: actorId,
      sourceAction: "SUBMIT",
      sourceId: current.id,
    });

    await this.notifyTimeAdjustSafely("แจ้งเตือนคำขอแก้เวลารออนุมัติ", () =>
      this.notificationsService.notifyTimeAdjustPendingApproval(id),
    );
  }

  async approve(id: string, dto: TimeAdjustRequestActionDto, actorId: string) {
    let summaryRecalculationTarget: {
      employeeId: string;
      workDate: Date;
      requestedById: string;
      sourceAction: string;
      sourceId: string;
    } | null = null;

    const current = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        originalAttendanceLog: true,
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลา");
    }

    if (current.status !== "SUBMITTED") {
      throw new BadRequestException("อนุมัติได้เฉพาะคำขอที่รออนุมัติเท่านั้น");
    }

    await this.prisma.$transaction(async (tx) => {
      const currentStep = await this.getCurrentTimeAdjustApprovalStep(tx, id);

      if (!currentStep) {
        throw new BadRequestException(
          "ไม่พบขั้นตอนอนุมัติคำขอแก้เวลาที่กำลังรอดำเนินการ",
        );
      }

      await this.ensureActorCanActCurrentStep(tx, currentStep, actorId, {
        requesterUserId: current.submittedById,
        subjectEmployeeId: current.employeeId,
      });

      const nextStep = await tx.timeAdjustApprovalStep.findFirst({
        where: {
          timeAdjustRequestId: id,
          status: "WAITING",
          stepNo: {
            gt: currentStep.stepNo,
          },
        },
        orderBy: {
          stepNo: "asc",
        },
      });

      await tx.timeAdjustApprovalStep.update({
        where: {
          id: currentStep.id,
        },
        data: {
          status: "APPROVED",
          approvedCount: {
            increment: 1,
          },
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      if (nextStep) {
        await tx.timeAdjustApprovalStep.update({
          where: {
            id: nextStep.id,
          },
          data: {
            status: "PENDING",
          },
        });

        await tx.timeAdjustLog.create({
          data: {
            timeAdjustRequestId: id,
            action: "APPROVE",
            oldStatus: "SUBMITTED",
            newStatus: "SUBMITTED",
            reason:
              dto.reason?.trim() ||
              `อนุมัติขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
            note:
              dto.note?.trim() ||
              `ส่งต่อไปยังขั้นตอนที่ ${nextStep.stepNo}: ${nextStep.nameTh}`,
            actedById: actorId,
          },
        });

        return;
      }

      // ไม่มี step ถัดไป แปลว่าอนุมัติครบทุกขั้นแล้ว จึง apply ไป Attendance จริง
      const appliedAttendanceLogId =
        await this.attendanceApplyService.applyApprovedTimeAdjust(tx, {
          current,
          actorId,
          dto,
        });

      await tx.timeAdjustRequest.update({
        where: {
          id,
        },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedById: actorId,
          appliedAttendanceLogId,
        },
      });

      await tx.timeAdjustLog.create({
        data: {
          timeAdjustRequestId: id,
          action: "APPROVE",
          oldStatus: "SUBMITTED",
          newStatus: "APPROVED",
          reason:
            dto.reason?.trim() ||
            `อนุมัติครบทุกขั้นตอน สิ้นสุดที่ขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note: dto.note?.trim() || null,
          actedById: actorId,
        },
      });

      summaryRecalculationTarget = {
        employeeId: current.employeeId,
        workDate: toTimeAdjustDateOnlyFromDate(current.requestedLogTime),
        requestedById: actorId,
        sourceAction: "APPROVE",
        sourceId: current.id,
      };
    });

    if (summaryRecalculationTarget) {
      await this.enqueueAttendanceSummaryRecalculation(
        summaryRecalculationTarget,
      );
    }

    await this.refreshTimeAdjustApprovalNotificationsAfterApprove(id);
  }

  async reject(id: string, dto: TimeAdjustRequestActionDto, actorId: string) {
    const current = await this.findCurrentRaw(id);

    if (current.status !== "SUBMITTED") {
      throw new BadRequestException(
        "ไม่อนุมัติได้เฉพาะคำขอที่รออนุมัติเท่านั้น",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const currentStep = await this.getCurrentTimeAdjustApprovalStep(tx, id);

      if (!currentStep) {
        throw new BadRequestException(
          "ไม่พบขั้นตอนอนุมัติคำขอแก้เวลาที่กำลังรอดำเนินการ",
        );
      }

      await this.ensureActorCanActCurrentStep(tx, currentStep, actorId, {
        requesterUserId: current.submittedById,
        subjectEmployeeId: current.employeeId,
      });

      await tx.timeAdjustApprovalStep.update({
        where: {
          id: currentStep.id,
        },
        data: {
          status: "REJECTED",
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      await tx.timeAdjustApprovalStep.updateMany({
        where: {
          timeAdjustRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
          id: {
            not: currentStep.id,
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.timeAdjustRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectedById: actorId,
        },
      });

      await tx.timeAdjustLog.create({
        data: {
          timeAdjustRequestId: id,
          action: "REJECT",
          oldStatus: "SUBMITTED",
          newStatus: "REJECTED",
          reason:
            dto.reason?.trim() ||
            `ไม่อนุมัติในขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note: dto.note?.trim() || null,
          actedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceSummaryRecalculation({
      employeeId: current.employeeId,
      workDate: toTimeAdjustDateOnlyFromDate(current.requestedLogTime),
      requestedById: actorId,
      sourceAction: "REJECT",
      sourceId: current.id,
    });

    await this.notifyTimeAdjustSafely("แจ้งเตือนคำขอแก้เวลาถูกปฏิเสธ", async () => {
      await this.notificationsService.closeTimeAdjustPendingNotifications(id);
      await this.notificationsService.notifyTimeAdjustRejected(id);
    });
  }

  async returnForReview(
    id: string,
    dto: TimeAdjustRequestActionDto,
    actorId: string,
  ) {
    const current = await this.findCurrentRaw(id);

    if (current.status !== "SUBMITTED") {
      throw new BadRequestException(
        "ส่งกลับให้ตรวจสอบใหม่ได้เฉพาะคำขอแก้เวลาที่รออนุมัติเท่านั้น",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const currentStep = await this.getCurrentTimeAdjustApprovalStep(tx, id);

      if (!currentStep) {
        throw new BadRequestException(
          "ไม่พบขั้นตอนอนุมัติคำขอแก้เวลาที่กำลังรอดำเนินการ",
        );
      }

      await this.ensureActorCanActCurrentStep(tx, currentStep, actorId, {
        requesterUserId: current.submittedById,
        subjectEmployeeId: current.employeeId,
      });

      await tx.timeAdjustApprovalStep.update({
        where: { id: currentStep.id },
        data: {
          status: "CANCELLED",
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      await tx.timeAdjustApprovalStep.updateMany({
        where: {
          timeAdjustRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
          id: {
            not: currentStep.id,
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.timeAdjustRequest.update({
        where: { id },
        data: {
          status: "DRAFT",
          submittedAt: null,
          submittedById: null,
          approvedAt: null,
          approvedById: null,
          rejectedAt: null,
          rejectedById: null,
          cancelledAt: null,
          cancelledById: null,
          appliedAttendanceLogId: null,
        },
      });

      await tx.timeAdjustLog.create({
        data: {
          timeAdjustRequestId: id,
          action: "CANCEL",
          oldStatus: "SUBMITTED",
          newStatus: "DRAFT",
          reason:
            dto.reason?.trim() ||
            `ส่งกลับให้ตรวจสอบใหม่ในขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note: dto.note?.trim() || "ผู้ยื่นสามารถแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่ได้",
          actedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceSummaryRecalculation({
      employeeId: current.employeeId,
      workDate: toTimeAdjustDateOnlyFromDate(current.requestedLogTime),
      requestedById: actorId,
      sourceAction: "RETURN_FOR_REVIEW",
      sourceId: current.id,
    });

    await this.notifyTimeAdjustSafely(
      "แจ้งเตือนคำขอแก้เวลาถูกส่งกลับให้ตรวจสอบ",
      async () => {
        await this.notificationsService.closeTimeAdjustPendingNotifications(id);
        await this.notificationsService.notifyTimeAdjustReturnedForReview(id);
      },
    );
  }

  async withdrawSubmittedToDraft(
    id: string,
    dto: TimeAdjustRequestActionDto,
    actorId: string,
  ) {
    const current = await this.findCurrentRaw(id);

    if (current.status !== "SUBMITTED") {
      throw new BadRequestException(
        "ยกเลิกการส่งได้เฉพาะคำขอแก้เวลาที่รออนุมัติเท่านั้น",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.timeAdjustApprovalStep.updateMany({
        where: {
          timeAdjustRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.timeAdjustRequest.update({
        where: { id },
        data: {
          status: "DRAFT",
          submittedAt: null,
          submittedById: null,
          approvedAt: null,
          approvedById: null,
          rejectedAt: null,
          rejectedById: null,
          cancelledAt: null,
          cancelledById: null,
          appliedAttendanceLogId: null,
        },
      });

      await tx.timeAdjustLog.create({
        data: {
          timeAdjustRequestId: id,
          action: "CANCEL",
          oldStatus: "SUBMITTED",
          newStatus: "DRAFT",
          reason:
            dto.reason?.trim() || "ยกเลิกการส่งเพื่อแก้ไขและส่งใหม่",
          note:
            dto.note?.trim() ||
            "ผู้ยื่นดึงคำขอกลับมาแก้ไขก่อนอนุมัติ",
          actedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceSummaryRecalculation({
      employeeId: current.employeeId,
      workDate: toTimeAdjustDateOnlyFromDate(current.requestedLogTime),
      requestedById: actorId,
      sourceAction: "WITHDRAW_TO_DRAFT",
      sourceId: current.id,
    });

    await this.notifyTimeAdjustSafely(
      "ปิดแจ้งเตือนคำขอแก้เวลาที่ถูกยกเลิกการส่ง",
      () => this.notificationsService.closeTimeAdjustPendingNotifications(id),
    );
  }

  async cancel(id: string, dto: TimeAdjustRequestActionDto, actorId: string) {
    const current = await this.findCurrentRaw(id);

    if (current.status === "APPROVED") {
      throw new BadRequestException("ไม่สามารถยกเลิกคำขอที่อนุมัติแล้ว");
    }

    if (current.status === "CANCELLED") {
      throw new BadRequestException("คำขอนี้ถูกยกเลิกแล้ว");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.timeAdjustRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: actorId,
        },
      });

      await tx.timeAdjustApprovalStep.updateMany({
        where: {
          timeAdjustRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.timeAdjustLog.create({
        data: {
          timeAdjustRequestId: id,
          action: "CANCEL",
          oldStatus: current.status,
          newStatus: "CANCELLED",
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
          actedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceSummaryRecalculation({
      employeeId: current.employeeId,
      workDate: toTimeAdjustDateOnlyFromDate(current.requestedLogTime),
      requestedById: actorId,
      sourceAction: "CANCEL",
      sourceId: current.id,
    });

    await this.notifyTimeAdjustSafely("ปิดแจ้งเตือนคำขอแก้เวลาที่ถูกยกเลิก", () =>
      this.notificationsService.closeTimeAdjustPendingNotifications(id),
    );
  }


  private async refreshTimeAdjustApprovalNotificationsAfterApprove(id: string) {
    await this.notifyTimeAdjustSafely("อัปเดตแจ้งเตือนหลังอนุมัติคำขอแก้เวลา", async () => {
      await this.notificationsService.closeTimeAdjustPendingNotifications(id);

      const nextPendingStep = await this.prisma.timeAdjustApprovalStep.findFirst({
        where: {
          timeAdjustRequestId: id,
          status: "PENDING",
        },
        select: {
          id: true,
        },
      });

      if (nextPendingStep) {
        await this.notificationsService.notifyTimeAdjustPendingApproval(id);
        return;
      }

      const latestRequest = await this.prisma.timeAdjustRequest.findFirst({
        where: {
          id,
          deletedAt: null,
        },
        select: {
          status: true,
        },
      });

      if (latestRequest?.status === "APPROVED") {
        await this.notificationsService.notifyTimeAdjustApproved(id);
      }
    });
  }

  private notifyTimeAdjustSafely(
    description: string,
    task: () => Promise<void>,
  ) {
    void Promise.resolve()
      .then(task)
      .catch((error) => {
        this.logger.warn(
          `${description} ไม่สำเร็จ: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private async enqueueAttendanceSummaryRecalculation(params: {
    employeeId: string;
    workDate: Date;
    requestedById: string;
    sourceAction?: string;
    sourceId?: string;
  }) {
    try {
      await this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
        employeeId: params.employeeId,
        workDate: this.toDateKey(params.workDate),
        requestedById: params.requestedById,
        sourceType: "TIME_ADJUST_REQUEST",
        sourceId: params.sourceId ?? null,
        sourceAction: params.sourceAction ?? "UPDATE",
      });
    } catch (error) {
      this.logger.warn(
        `ไม่สามารถส่งงานคำนวณสรุปเวลาใหม่หลังอนุมัติคำขอแก้เวลาได้ employeeId=${params.employeeId} workDate=${this.toDateKey(
          params.workDate,
        )}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private async findApplicableApprovalMatrix(
    tx: Prisma.TransactionClient,
    employee: {
      companyId: string;
      branchId: string | null;
      departmentId: string | null;
      employeeTypeId: string | null;
    },
  ) {
    /*
     * ใช้ resolver กลางเพื่อให้การเลือก Approval Matrix ของ Time Adjust
     * ตรงกับ Leave และ OT
     */
    return this.approvalMatrixResolver.findApplicableMatrix(tx, {
      targetType: "TIME_ADJUST_REQUEST",
      employee,
    });
  }

  private async createTimeAdjustApprovalSteps(
    tx: Prisma.TransactionClient,
    params: {
      timeAdjustRequestId: string;
      employee: Prisma.EmployeeGetPayload<{}>;
      matrix: Prisma.ApprovalMatrixGetPayload<{
        include: {
          steps: true;
        };
      }>;
    },
  ) {
    const resolvedSteps = await this.approvalMatrixResolver.resolveSteps(tx, {
      employee: params.employee,
      matrix: params.matrix,
    });

    for (let index = 0; index < resolvedSteps.length; index += 1) {
      const resolvedStep = resolvedSteps[index];
      const step = resolvedStep.step;

      await tx.timeAdjustApprovalStep.create({
        data: {
          timeAdjustRequestId: params.timeAdjustRequestId,
          matrixId: params.matrix.id,
          matrixStepId: step.id,
          stepNo: step.stepNo,
          nameTh: step.nameTh,
          description: step.description,
          approverType: step.approverType,
          expectedApproverId: resolvedStep.expectedApproverId,
          expectedEmployeeId: resolvedStep.expectedEmployeeId,
          positionId: step.positionId,
          roleCode: step.roleCode,
          minApproverCount: step.minApproverCount || 1,
          status: index === 0 ? "PENDING" : "WAITING",
        },
      });
    }
  }

  private async getCurrentTimeAdjustApprovalStep(
    tx: Prisma.TransactionClient,
    timeAdjustRequestId: string,
  ) {
    return tx.timeAdjustApprovalStep.findFirst({
      where: {
        timeAdjustRequestId,
        status: "PENDING",
      },
      orderBy: {
        stepNo: "asc",
      },
      include: {
        expectedApprover: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });
  }

  private async ensureActorCanActCurrentStep(
    tx: Prisma.TransactionClient,
    currentStep: {
      id: string;
      expectedApproverId: string | null;
      nameTh: string;
      stepNo: number;
      roleCode: string | null;
    },
    actorId: string,
    owner?: ApprovalRequestOwner,
  ) {
    const actorEmployee = await tx.employee.findFirst({
      where: { userId: actorId, deletedAt: null },
      select: { id: true },
    });

    /*
     * กันอนุมัติคำขอแก้เวลาของตัวเอง — ต้องเช็คก่อนทุกทางลัด
     * คำขอนี้เขียนเวลาทำงานจริงลงระบบ อนุมัติเองได้เท่ากับแก้เวลาตัวเองได้อิสระ
     */
    const actorRoleCodes = await loadActorRoleCodes(tx, actorId);

    /* ฝ่ายบุคคลอนุมัติของตัวเองได้ — นิยามเดียวกับ canActOnApprovalStep */
    if (
      isOwnRequest(owner, actorId, actorEmployee?.id ?? null) &&
      !canApproveOwnRequest(actorRoleCodes)
    ) {
      throw new BadRequestException(
        "ไม่สามารถอนุมัติหรือไม่อนุมัติคำขอแก้เวลาของตนเองได้",
      );
    }

    if (currentStep.expectedApproverId === actorId) return;

    // ผู้อนุมัติตัวจริงไม่อยู่ ให้คนที่รับมอบอำนาจกดแทนได้
    const delegations = await loadActiveDelegations(
      tx,
      actorId,
      'TIME_ADJUST_REQUEST',
    );

    if (
      canActOnApprovalStep({
        step: currentStep,
        actorId,
        actorRoleCodes,
        owner,
        actorEmployeeId: actorEmployee?.id ?? null,
        delegatedFromUserIds: delegatedUserIds(delegations),
      })
    ) {
      return;
    }

    throw new BadRequestException(
      `คุณไม่ใช่ผู้อนุมัติของขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
    );
  }

  private async findCurrentRaw(id: string) {
    const current = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลา");
    }

    return current;
  }
}
