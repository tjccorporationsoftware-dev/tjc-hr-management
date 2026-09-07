import { BadRequestException, Injectable } from '@nestjs/common';
import { ApprovalMatrixTargetType, Prisma } from '../../../generated/prisma/client';
import {
  ApprovalMatrixWithSteps,
  ApprovalRequesterEmployee,
  ResolvedApprovalStep,
} from '../types/approval-workflow.types';

/**
 * ระดับตำแหน่งสูงสุดที่ถือว่าเป็นผู้บริหาร ใช้เป็นชั้นสำรองเท่านั้น
 * Position.level ของระบบนี้ 1 = สูงสุด (ดู scripts/fix-position-levels.ts)
 */
const EXECUTIVE_POSITION_MAX_LEVEL = 2;

/**
 * ApprovalMatrixResolverService
 * -----------------------------------------------------------------------------
 * Service กลางสำหรับหา Approval Matrix และหา approver ของแต่ละ step
 *
 * ใช้ร่วมกันโดย:
 * - Leave Request
 * - Overtime Request
 * - Time Adjust Request
 * - Workflow อื่นในอนาคต
 *
 * เหตุผลที่แยกออกมา:
 * เดิมแต่ละ module มี logic หา matrix / หา supervisor / หา HR / หา Executive
 * ซ้ำกันหลายชุด ทำให้แก้ยากและเสี่ยง behavior ไม่เหมือนกัน
 *
 * กติกาในการใช้งาน:
 * - Service นี้ไม่ create LeaveApprovalStep / OvertimeApprovalStep / TimeAdjustApprovalStep เอง
 * - Service นี้มีหน้าที่ resolve plan ให้เท่านั้น
 * - แต่ละ module ยังคงเป็นเจ้าของ table step ของตัวเองเหมือนเดิม
 */
@Injectable()
export class ApprovalMatrixResolverService {
  /**
   * หา Approval Matrix ที่เหมาะสมที่สุดตามประเภทคำขอและข้อมูลพนักงาน
   *
   * หลักการเลือก:
   * 1. companyId ต้องตรงกัน
   * 2. targetType ต้องตรง เช่น LEAVE_REQUEST / OVERTIME_REQUEST / TIME_ADJUST_REQUEST
   * 3. matrix ต้อง active และยังไม่ถูกลบ
   * 4. ถ้า matrix ระบุรายชื่อผู้ขออนุมัติ ต้องมี employee.id อยู่ในรายชื่อนั้น
   * 5. ถ้า matrix ระบุ departmentId ต้องตรงกับพนักงาน
   * 6. ถ้า matrix ระบุ employeeTypeId ต้องตรงกับพนักงาน
   * 7. เลือก priority น้อยก่อน
   * 8. ถ้า priority เท่ากัน เลือกเงื่อนไขที่ specific กว่า เช่น รายชื่อพนักงาน > department + employeeType
   */
  async findApplicableMatrix(
    tx: Prisma.TransactionClient,
    params: {
      targetType: ApprovalMatrixTargetType;
      employee: ApprovalRequesterEmployee;
    },
  ): Promise<ApprovalMatrixWithSteps | null> {
    const matrices = (await (tx.approvalMatrix as any).findMany({
      where: {
        companyId: params.employee.companyId,
        targetType: params.targetType,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        requesters: {
          select: {
            employeeId: true,
          },
        },
        // สาขาเพิ่มเติมที่ใช้สายเดียวกัน (สาขาแรกยังอยู่ที่ matrix.branchId)
        extraBranches: {
          select: {
            branchId: true,
          },
        },
        steps: {
          where: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          orderBy: {
            stepNo: 'asc',
          },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
    })) as Array<
      ApprovalMatrixWithSteps & {
        requesters?: Array<{ employeeId: string }>;
        extraBranches?: Array<{ branchId: string }>;
      }
    >;

    /** สาขาทั้งหมดที่สายนี้ครอบ — ว่าง = ทุกสาขา */
    const branchIdsOf = (matrix: {
      branchId?: string | null;
      extraBranches?: Array<{ branchId: string }>;
    }) =>
      [
        matrix.branchId,
        ...(matrix.extraBranches?.map((item) => item.branchId) ?? []),
      ].filter((branchId): branchId is string => Boolean(branchId));

    const matched = matrices
      .filter((matrix) => {
        // Matrix ที่ไม่มี step ใช้งานจริงไม่ได้
        if (matrix.steps.length === 0) return false;

        const requesterIds = matrix.requesters?.map((item) => item.employeeId) ?? [];

        // ถ้ามีรายชื่อผู้ขออนุมัติเฉพาะ Matrix นี้จะใช้เฉพาะคนในรายชื่อเท่านั้น
        if (requesterIds.length > 0) {
          return Boolean(params.employee.id && requesterIds.includes(params.employee.id));
        }

        // ถ้า matrix ระบุสาขา ต้องตรงกับสาขาของพนักงาน (ปล่อยว่าง = ทุกสาขา)
        const branchIds = branchIdsOf(matrix);
        if (
          branchIds.length > 0 &&
          !(
            params.employee.branchId &&
            branchIds.includes(params.employee.branchId)
          )
        ) {
          return false;
        }

        if (
          matrix.departmentId &&
          matrix.departmentId !== params.employee.departmentId
        ) {
          return false;
        }

        if (
          matrix.employeeTypeId &&
          matrix.employeeTypeId !== params.employee.employeeTypeId
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;

        const scoreA =
          ((a.requesters?.length ?? 0) > 0 ? 8 : 0) +
          (branchIdsOf(a).length > 0 ? 4 : 0) +
          (a.departmentId ? 2 : 0) +
          (a.employeeTypeId ? 1 : 0);
        const scoreB =
          ((b.requesters?.length ?? 0) > 0 ? 8 : 0) +
          (branchIdsOf(b).length > 0 ? 4 : 0) +
          (b.departmentId ? 2 : 0) +
          (b.employeeTypeId ? 1 : 0);

        // score สูงกว่า = เงื่อนไขเจาะจงกว่า
        return scoreB - scoreA;
      });

    return matched[0] ?? null;
  }

  /**
   * หา matrix พร้อม resolve approver ทุก step ในครั้งเดียว
   *
   * เหมาะใช้ตอน submit คำขอ เพราะต้องรู้ทั้ง matrix และ approver
   * ก่อนสร้าง step ของ request นั้น ๆ
   */
  async resolvePlan(
    tx: Prisma.TransactionClient,
    params: {
      targetType: ApprovalMatrixTargetType;
      employee: ApprovalRequesterEmployee;
      missingMatrixMessage: string;
    },
  ) {
    const matrix = await this.findApplicableMatrix(tx, {
      targetType: params.targetType,
      employee: params.employee,
    });

    if (!matrix) {
      throw new BadRequestException(params.missingMatrixMessage);
    }

    const steps = await this.resolveSteps(tx, {
      employee: params.employee,
      matrix,
    });

    return {
      matrix,
      steps,
    };
  }

  /**
   * Resolve approver ของทุก step ใน matrix
   *
   * return list นี้ให้แต่ละ module เอาไป create record ใน table step ของตัวเอง
   */
  async resolveSteps(
    tx: Prisma.TransactionClient,
    params: {
      employee: ApprovalRequesterEmployee;
      matrix: ApprovalMatrixWithSteps;
    },
  ): Promise<ResolvedApprovalStep[]> {
    const resolvedSteps: ResolvedApprovalStep[] = [];

    for (const step of params.matrix.steps) {
      const resolvedApprover = await this.resolveStepApprover(tx, {
        employee: params.employee,
        step,
      });

      if (!resolvedApprover) {
        throw new BadRequestException(
          `ไม่พบผู้อนุมัติสำหรับขั้น "${step.nameTh}"`,
        );
      }

      resolvedSteps.push({
        step,
        expectedApproverId: resolvedApprover.expectedApproverId,
        expectedEmployeeId: resolvedApprover.expectedEmployeeId,
      });
    }

    return resolvedSteps;
  }

  /**
   * หา approver ของ step เดียว
   * -----------------------------------------------------------------------
   * ลำดับการหา:
   *   1. ผู้อนุมัติหลักที่ตั้งไว้ในขั้นนั้น
   *   2. ถ้าคนที่ได้คือ "คนยื่นเอง" -> ใช้ผู้อนุมัติแทนที่ตั้งไว้ในขั้นเดียวกัน
   *   3. ถ้ายังไม่ได้อีก -> ตกไป HR แล้วผู้บริหาร โดยข้ามคนยื่นเสมอ
   *
   * ข้อ 2-3 มีเพราะหัวหน้าแผนกกับเจ้าหน้าที่ HR ก็เป็นลูกจ้างที่ต้องยื่นใบเหมือนกัน
   * เดิมระบบผูกผู้อนุมัติเป็นตัวเขาเองได้ แล้วตัวกันอนุมัติงานตัวเองบล็อกทีหลัง
   * ผลคือใบค้างถาวรจนต้องให้แอดมินเข้าไปกดปลด
   */
  private async resolveStepApprover(
    tx: Prisma.TransactionClient,
    params: {
      employee: ApprovalRequesterEmployee;
      step: Prisma.ApprovalMatrixStepGetPayload<{}>;
    },
  ): Promise<{
    expectedApproverId: string;
    expectedEmployeeId: string | null;
  } | null> {
    const { employee, step } = params;

    const primary = await this.resolveByDefinition(tx, employee, {
      approverType: step.approverType,
      positionId: step.positionId,
      employeeId: step.employeeId,
      roleCode: step.roleCode,
      stepName: step.nameTh,
    });

    if (primary && !this.isRequester(primary, employee)) return primary;

    // ผู้อนุมัติแทนที่ผู้ดูแลตั้งไว้เองในสายอนุมัติ
    let fallbackAlsoRequester = false;

    if (step.fallbackApproverType) {
      const fallback = await this.resolveByDefinition(
        tx,
        employee,
        {
          approverType: step.fallbackApproverType,
          positionId: step.fallbackPositionId,
          employeeId: step.fallbackEmployeeId,
          roleCode: step.fallbackRoleCode,
          stepName: `${step.nameTh} (ผู้อนุมัติแทน)`,
        },
        { allowNull: true },
      );

      if (fallback && !this.isRequester(fallback, employee)) return fallback;

      /* ตั้งไว้แล้วแต่ชี้กลับมาที่คนยื่นเอง — คนละปัญหากับ "ยังไม่ได้ตั้ง" */
      fallbackAlsoRequester = Boolean(fallback);
    }

    // ชั้นสำรองของระบบ เผื่อผู้ดูแลยังไม่ได้ตั้งผู้อนุมัติแทนไว้
    const hr = await this.resolveHrApprover(tx, employee.companyId, step.nameTh, {
      excludeEmployeeId: employee.id,
      allowNull: true,
    });
    if (hr && !this.isRequester(hr, employee)) return hr;

    const executive = await this.resolveExecutiveApprover(
      tx,
      employee.companyId,
      step.nameTh,
      { excludeEmployeeId: employee.id, allowNull: true },
    );
    if (executive && !this.isRequester(executive, employee)) return executive;

    /*
     * แยกสองกรณีให้ชัด — เดิมบอกว่า "กรุณาตั้งผู้อนุมัติแทน" ทั้งสองกรณี
     * ซึ่งสั่งให้ผู้ดูแลไปทำสิ่งที่ทำไปแล้วเมื่อเขาตั้งไว้แต่มันชี้กลับมาที่ตัวเอง
     * (เกิดจริงกับบริษัทเล็กที่คนเดียวถือทั้ง HR และผู้บริหาร)
     */
    throw new BadRequestException(
      fallbackAlsoRequester
        ? `ขั้น "${step.nameTh}" อนุมัติไม่ได้เพราะทั้งผู้อนุมัติและผู้อนุมัติแทน` +
            'เป็นคนเดียวกับผู้ยื่น — ต้องมีพนักงานอีกคนถือสิทธิ์อนุมัติ ' +
            'หรือเลือกชื่อคนอื่นเป็น "ผู้อนุมัติแทน" ของขั้นนี้'
        : `ขั้น "${step.nameTh}" หาผู้อนุมัติที่ไม่ใช่ผู้ขอเองไม่ได้ — ` +
            'กรุณาตั้ง "ผู้อนุมัติแทน" ของขั้นนี้ในสายอนุมัติ',
    );
  }

  /** ผู้อนุมัติที่หาได้คือคนยื่นเองหรือไม่ */
  private isRequester(
    resolved: { expectedEmployeeId: string | null },
    employee: ApprovalRequesterEmployee,
  ) {
    return Boolean(
      employee.id &&
        resolved.expectedEmployeeId &&
        resolved.expectedEmployeeId === employee.id,
    );
  }

  /**
   * หาผู้อนุมัติจาก "นิยามหนึ่งชุด" ใช้ร่วมกันทั้งผู้อนุมัติหลักและผู้อนุมัติแทน
   */
  private async resolveByDefinition(
    tx: Prisma.TransactionClient,
    employee: ApprovalRequesterEmployee,
    definition: {
      approverType: Prisma.ApprovalMatrixStepGetPayload<{}>['approverType'];
      positionId?: string | null;
      employeeId?: string | null;
      roleCode?: string | null;
      stepName: string;
    },
    options: { allowNull?: boolean } = {},
  ): Promise<{
    expectedApproverId: string;
    expectedEmployeeId: string | null;
  } | null> {
    const { approverType, stepName } = definition;

    if (approverType === 'SUPERVISOR') {
      return this.resolveSupervisorApprover(tx, employee, stepName);
    }

    if (approverType === 'EMPLOYEE') {
      if (!definition.employeeId) {
        if (options.allowNull) return null;
        throw new BadRequestException(
          `ขั้นอนุมัติ "${stepName}" ต้องระบุพนักงานผู้อนุมัติ`,
        );
      }

      return this.resolveFixedEmployeeApprover(tx, {
        employeeId: definition.employeeId,
        stepName,
        allowNull: options.allowNull,
      });
    }

    if (approverType === 'POSITION') {
      if (!definition.positionId) {
        if (options.allowNull) return null;
        throw new BadRequestException(
          `ขั้นอนุมัติ "${stepName}" ต้องระบุตำแหน่งผู้อนุมัติ`,
        );
      }

      return this.resolvePositionApprover(tx, employee, {
        positionId: definition.positionId,
        stepName,
        allowNull: options.allowNull,
      });
    }

    if (approverType === 'ROLE') {
      if (!definition.roleCode) {
        if (options.allowNull) return null;
        throw new BadRequestException(
          `ขั้นอนุมัติ "${stepName}" ต้องระบุ Role Code`,
        );
      }

      return this.findUserApproverByRoleCodes(tx, {
        companyId: employee.companyId,
        roleCodes: [definition.roleCode],
        errorMessage: `ไม่พบผู้ใช้งานที่มี Role ${definition.roleCode} สำหรับขั้น "${stepName}"`,
        allowNull: options.allowNull,
        excludeEmployeeId: employee.id,
      });
    }

    if (approverType === 'HR_ADMIN') {
      return this.resolveHrApprover(tx, employee.companyId, stepName, {
        allowNull: options.allowNull,
      });
    }

    if (approverType === 'EXECUTIVE') {
      return this.resolveExecutiveApprover(tx, employee.companyId, stepName, {
        allowNull: options.allowNull,
      });
    }

    throw new BadRequestException(
      `ประเภทผู้อนุมัติของขั้น "${stepName}" ไม่ถูกต้อง`,
    );
  }

  /**
   * ผู้อนุมัติขั้น "หัวหน้าโดยตรง"
   *
   * ถ้าไม่มีหัวหน้าให้ตกไปที่ฝ่ายบุคคลแทน ไม่ใช่ปฏิเสธทั้งใบ
   *
   * คนที่เป็นต้นสายของสาขาหรือผู้บริหารสูงสุดจะไม่มีผู้บังคับบัญชาโดยธรรมชาติ
   * (ยิ่งเมื่อระบบบังคับว่าหัวหน้าต้องอยู่สาขาเดียวกัน) เดิมคนกลุ่มนี้ยื่นใบลา
   * ใบ OT หรือคำขอปรับเวลาไม่ได้เลย ต้องไปสร้าง Approval Matrix รายคนให้ก่อน
   */
  private async resolveSupervisorApprover(
    tx: Prisma.TransactionClient,
    employee: ApprovalRequesterEmployee,
    stepName: string,
  ) {
    if (!employee.supervisorId) {
      return this.resolveHrApprover(tx, employee.companyId, stepName);
    }

    const supervisor = await tx.employee.findFirst({
      where: {
        id: employee.supervisorId,
        deletedAt: null,
        status: {
          in: ['ACTIVE', 'PROBATION'],
        },
        userId: {
          not: null,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!supervisor?.userId) {
      // หัวหน้ามีตัวตนแต่ยังไม่มีบัญชีผู้ใช้ ก็ให้ HR รับงานไปก่อนเช่นกัน
      return this.resolveHrApprover(tx, employee.companyId, stepName);
    }

    return {
      expectedApproverId: supervisor.userId,
      expectedEmployeeId: supervisor.id,
    };
  }

  private async resolveFixedEmployeeApprover(
    tx: Prisma.TransactionClient,
    params: { employeeId: string; stepName: string; allowNull?: boolean },
  ) {
    const approver = await tx.employee.findFirst({
      where: {
        id: params.employeeId,
        deletedAt: null,
        status: {
          in: ['ACTIVE', 'PROBATION'],
        },
        userId: {
          not: null,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!approver?.userId) {
      if (params.allowNull) return null;
      throw new BadRequestException(
        `พนักงานที่กำหนดในขั้น "${params.stepName}" ยังไม่ได้ผูกบัญชีผู้ใช้งาน`,
      );
    }

    return {
      expectedApproverId: approver.userId,
      expectedEmployeeId: approver.id,
    };
  }

  private async resolvePositionApprover(
    tx: Prisma.TransactionClient,
    employee: ApprovalRequesterEmployee,
    params: { positionId: string; stepName: string; allowNull?: boolean },
  ) {
    const approver =
      (employee.departmentId
        ? await this.findEmployeeApproverByPosition(tx, {
            companyId: employee.companyId,
            departmentId: employee.departmentId,
            positionId: params.positionId,
            excludeEmployeeId: employee.id,
          })
        : null) ??
      (await this.findEmployeeApproverByPosition(tx, {
        companyId: employee.companyId,
        departmentId: null,
        positionId: params.positionId,
        excludeEmployeeId: employee.id,
      }));

    if (!approver?.userId) {
      if (params.allowNull) return null;
      throw new BadRequestException(
        `ไม่พบผู้อนุมัติในตำแหน่งที่กำหนดสำหรับขั้น "${params.stepName}"`,
      );
    }

    return {
      expectedApproverId: approver.userId,
      expectedEmployeeId: approver.id,
    };
  }

  private async resolveHrApprover(
    tx: Prisma.TransactionClient,
    companyId: string,
    stepName: string,
    options: { excludeEmployeeId?: string | null; allowNull?: boolean } = {},
  ) {
    const userApprover = await this.findUserApproverByRoleCodes(tx, {
      companyId,
      roleCodes: ['HR_ADMIN', 'HR_MANAGER', 'ADMIN', 'SUPER_ADMIN'],
      errorMessage: '',
      allowNull: true,
      excludeEmployeeId: options.excludeEmployeeId,
    });

    if (userApprover) return userApprover;

    const employeeApprover = await tx.employee.findFirst({
      where: {
        companyId,
        ...(options.excludeEmployeeId
          ? { id: { not: options.excludeEmployeeId } }
          : {}),
        deletedAt: null,
        status: {
          in: ['ACTIVE', 'PROBATION'],
        },
        userId: {
          not: null,
        },
        OR: [
          {
            position: {
              contains: 'HR',
              mode: 'insensitive',
            },
          },
          {
            positionMaster: {
              is: {
                code: {
                  contains: 'HR',
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        userId: true,
      },
      orderBy: {
        employeeCode: 'asc',
      },
    });

    if (!employeeApprover?.userId) {
      if (options.allowNull) return null;
      throw new BadRequestException(`ไม่พบ HR Admin สำหรับขั้น "${stepName}"`);
    }

    return {
      expectedApproverId: employeeApprover.userId,
      expectedEmployeeId: employeeApprover.id,
    };
  }

  /**
   * ผู้อนุมัติขั้น "ผู้บริหาร"
   *
   * ค้นจากบทบาทก่อนเสมอ แล้วค่อยตกไปดูระดับตำแหน่ง ให้เป็นลำดับเดียวกับ
   * resolveHrApprover เดิมทำกลับกัน คือดูระดับตำแหน่งก่อนโดยไม่ตรวจบทบาทเลย
   * ผลคือบริษัทที่ตั้ง Position.level กลับด้าน (ระบบใช้ 1 = สูงสุด) จะมอบอำนาจ
   * อนุมัติให้พนักงานระดับล่างสุดแบบเงียบ ๆ ไม่มีข้อความเตือนใด ๆ
   *
   * ชั้นสำรองที่ใช้ระดับตำแหน่งยังเก็บไว้สำหรับบริษัทที่ยังไม่ผูกบทบาทให้ใคร
   * แต่เรียงจากตำแหน่งสูงสุดลงมา ไม่ใช่เรียงตามรหัสพนักงานเหมือนเดิม
   */
  private async resolveExecutiveApprover(
    tx: Prisma.TransactionClient,
    companyId: string,
    stepName: string,
    options: { excludeEmployeeId?: string | null; allowNull?: boolean } = {},
  ) {
    const userApprover = await this.findUserApproverByRoleCodes(tx, {
      companyId,
      roleCodes: ['EXECUTIVE', 'PRESIDENT', 'CEO', 'ADMIN', 'SUPER_ADMIN'],
      errorMessage: '',
      allowNull: true,
      excludeEmployeeId: options.excludeEmployeeId,
    });

    if (userApprover) return userApprover;

    const executiveEmployee = await tx.employee.findFirst({
      where: {
        companyId,
        ...(options.excludeEmployeeId
          ? { id: { not: options.excludeEmployeeId } }
          : {}),
        deletedAt: null,
        status: {
          in: ['ACTIVE', 'PROBATION'],
        },
        userId: {
          not: null,
        },
        positionMaster: {
          is: {
            status: 'ACTIVE',
            deletedAt: null,
            level: {
              lte: EXECUTIVE_POSITION_MAX_LEVEL,
            },
          },
        },
      },
      select: {
        id: true,
        userId: true,
      },
      // Position.level 1 = สูงสุด จึงเรียงจากน้อยไปมากเพื่อได้ตำแหน่งสูงสุดก่อน
      orderBy: [{ positionMaster: { level: 'asc' } }, { employeeCode: 'asc' }],
    });

    if (executiveEmployee?.userId) {
      return {
        expectedApproverId: executiveEmployee.userId,
        expectedEmployeeId: executiveEmployee.id,
      };
    }

    if (options.allowNull) return null;

    throw new BadRequestException(
      `ไม่พบผู้บริหารสำหรับขั้น "${stepName}" — กรุณาผูกบทบาทผู้บริหารให้ผู้ใช้งานอย่างน้อยหนึ่งคน`,
    );
  }

  private async findEmployeeApproverByPosition(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      departmentId: string | null;
      positionId: string;
      excludeEmployeeId?: string | null;
    },
  ) {
    return tx.employee.findFirst({
      where: {
        companyId: params.companyId,
        ...(params.excludeEmployeeId
          ? { id: { not: params.excludeEmployeeId } }
          : {}),
        ...(params.departmentId ? { departmentId: params.departmentId } : {}),
        positionId: params.positionId,
        deletedAt: null,
        status: {
          in: ['ACTIVE', 'PROBATION'],
        },
        userId: {
          not: null,
        },
      },
      select: {
        id: true,
        userId: true,
      },
      orderBy: {
        employeeCode: 'asc',
      },
    });
  }

  private async findUserApproverByRoleCodes(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      roleCodes: string[];
      errorMessage: string;
      allowNull?: boolean;
      /** ข้ามคนยื่น จะได้ไม่ผูกผู้อนุมัติเป็นตัวเขาเอง */
      excludeEmployeeId?: string | null;
    },
  ) {
    const users = await tx.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              code: {
                in: params.roleCodes,
              },
              isActive: true,
            },
          },
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            companyId: true,
          },
        },
      },
      orderBy: {
        displayName: 'asc',
      },
      take: 20,
    });

    const candidates = params.excludeEmployeeId
      ? users.filter((user) => user.employee?.id !== params.excludeEmployeeId)
      : users;

    const preferredUser =
      candidates.find(
        (user) => !user.employee || user.employee.companyId === params.companyId,
      ) ?? candidates[0];

    if (!preferredUser) {
      if (params.allowNull) return null;
      throw new BadRequestException(params.errorMessage);
    }

    return {
      expectedApproverId: preferredUser.id,
      expectedEmployeeId: preferredUser.employee?.id ?? null,
    };
  }
}