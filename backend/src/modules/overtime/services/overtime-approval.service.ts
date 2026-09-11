import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { ApprovalMatrixResolverService } from '../../approval-workflow/services/approval-matrix-resolver.service';
import {
  canActOnApprovalStep,
  canApproveOwnRequest,
  isOwnRequest,
  type ApprovalRequestOwner,
  loadActorRoleCodes,
} from '../../approval-workflow/utils/approval-step-authorization.util';
import {
  delegatedUserIds,
  loadActiveDelegations,
} from '../../approval-workflow/utils/approval-delegation.util';

/*
 * OvertimeApprovalService
 * ---------------------------------------------------------
 * Responsibilities:
 * - Resolve the Approval Matrix for an OT request.
 * - Create OvertimeApprovalStep records when a request is submitted.
 * - Resolve who should approve each step.
 * - Validate that the current user is allowed to approve/reject the current step.
 *
 * Keep all Approval Matrix related logic here. This prevents the main
 * OvertimeRequestsService from becoming too long and difficult to maintain.
 */
@Injectable()
export class OvertimeApprovalService {
  constructor(
    private readonly approvalMatrixResolver: ApprovalMatrixResolverService,
  ) {}

  async findApplicableApprovalMatrix(
    tx: Prisma.TransactionClient,
    employee: {
      companyId: string;
      branchId: string | null;
      departmentId: string | null;
      employeeTypeId: string | null;
    },
  ) {
    /*
     * ใช้ ApprovalMatrixResolverService กลางแทน logic เดิมที่เคยอยู่ซ้ำใน OT
     * ทำให้เงื่อนไขการเลือก matrix ตรงกับ Leave และ Time Adjust
     */
    return this.approvalMatrixResolver.findApplicableMatrix(tx, {
      targetType: 'OVERTIME_REQUEST',
      employee,
    });
  }

  async createOvertimeApprovalSteps(
    tx: Prisma.TransactionClient,
    params: {
      overtimeRequestId: string;
      employee: Prisma.EmployeeGetPayload<{}>;
      matrix: Prisma.ApprovalMatrixGetPayload<{
        include: {
          steps: true;
        };
      }>;
    },
  ) {
    /*
     * Resolve approver ทุก step จาก service กลางก่อน แล้วค่อยสร้าง
     * OvertimeApprovalStep ของ OT เอง เพื่อให้ OT ยังเป็นเจ้าของ table ตัวเอง
     */
    const resolvedSteps = await this.approvalMatrixResolver.resolveSteps(tx, {
      employee: params.employee,
      matrix: params.matrix,
    });

    for (let index = 0; index < resolvedSteps.length; index += 1) {
      const resolvedStep = resolvedSteps[index];
      const step = resolvedStep.step;

      await tx.overtimeApprovalStep.create({
        data: {
          overtimeRequestId: params.overtimeRequestId,
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
          status: index === 0 ? 'PENDING' : 'WAITING',
        },
      });
    }
  }

  async getCurrentOvertimeApprovalStep(
    tx: Prisma.TransactionClient,
    overtimeRequestId: string,
  ) {
    return tx.overtimeApprovalStep.findFirst({
      where: {
        overtimeRequestId,
        status: 'PENDING',
      },
      orderBy: {
        stepNo: 'asc',
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

  async ensureActorCanActCurrentStep(
    tx: Prisma.TransactionClient,
    currentStep: {
      id: string;
      expectedApproverId: string | null;
      nameTh: string;
      stepNo: number;
      roleCode: string | null;
      approverType?: string | null;
    },
    actorId: string,
    owner?: ApprovalRequestOwner,
  ) {
    const actorEmployee = await tx.employee.findFirst({
      where: { userId: actorId, deletedAt: null },
      select: { id: true },
    });

    /*
     * กันอนุมัติ OT ของตัวเอง — ต้องเช็คก่อนทุกทางลัด
     * หัวหน้างานที่มีสิทธิ์อนุมัติ OT ก็ทำ OT เองได้ และมักถูกผูกเป็นผู้อนุมัติ
     * ของสายงานตัวเอง จึงอนุมัติ OT ตัวเองผ่านได้ทั้งที่เป็นเงินของบริษัท
     */
    const actorRoleCodes = await loadActorRoleCodes(tx, actorId);

    /* ฝ่ายบุคคลอนุมัติของตัวเองได้ — นิยามเดียวกับ canActOnApprovalStep */
    if (
      isOwnRequest(owner, actorId, actorEmployee?.id ?? null) &&
      !canApproveOwnRequest(actorRoleCodes)
    ) {
      throw new BadRequestException(
        'ไม่สามารถอนุมัติหรือไม่อนุมัติคำขอทำงานล่วงเวลาของตนเองได้',
      );
    }

    if (currentStep.expectedApproverId === actorId) {
      return;
    }

    // ผู้อนุมัติตัวจริงไม่อยู่ ให้คนที่รับมอบอำนาจกดแทนได้
    const delegations = await loadActiveDelegations(
      tx,
      actorId,
      'OVERTIME_REQUEST',
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
}
