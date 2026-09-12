import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { toPageMeta } from '../helpers/payroll-page-meta.helper';
import { toMoney } from '../utils/payroll-money.util';
import { resolveOutstandingBalance } from '../utils/payroll-deduction-plan.util';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../../common/tenant/tenant-scope.util';
import {
  CreateEmployeeDeductionPlanDto,
  EmployeeDeductionPlanQueryDto,
  UpdateEmployeeDeductionPlanDto,
} from '../dto/employee-deduction-plan.dto';

/** กยศ. เป็นหน้าที่ตามกฎหมาย ควรได้หักก่อนหนี้ประเภทอื่นเสมอ */
const DEFAULT_PRIORITY_BY_TYPE: Record<string, number> = {
  STUDENT_LOAN: 10,
  COOPERATIVE: 40,
  EMPLOYEE_LOAN: 50,
  /*
   * เงินประกันการทำงาน (ม.10) และค่าเสียหาย (ม.76) หักทีหลังหนี้ที่ลูกจ้าง
   * สมัครใจทำไว้ก่อน เพราะสองรายการนี้เป็นประโยชน์ของนายจ้างเอง
   * ไม่ควรไปเบียดคิวหนี้ที่ลูกจ้างผูกพันไว้ก่อนแล้ว
   */
  WORK_GUARANTEE: 60,
  DAMAGE_PAYMENT: 70,
  OTHER: 100,
};

/**
 * EmployeeDeductionPlansService
 * -----------------------------------------------------------------------------
 * จัดการแผนหักเงินเดือนแบบผ่อนงวด — กยศ./กรอ. เงินกู้พนักงาน สหกรณ์
 *
 * ส่วนที่ "หักจริง" อยู่ที่ PayrollDeductionPlanService ตอนคำนวณ payroll run
 * ไฟล์นี้รับผิดชอบเฉพาะการสร้าง/แก้ไข/พัก/ยกเลิกแผน และรายงานสรุป
 */
@Injectable()
export class EmployeeDeductionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly employeeSelect = {
    id: true,
    employeeCode: true,
    nickname: true,
    firstName: true,
    lastName: true,
    displayName: true,
    branchId: true,
    departmentId: true,
    branch: { select: { id: true, code: true, nameTh: true } },
    department: { select: { id: true, code: true, nameTh: true } },
  };

  async findAll(query: EmployeeDeductionPlanQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Prisma.EmployeeDeductionPlanWhereInput = { deletedAt: null };

    const companyId = effectiveCompanyId(scope, query.companyId);
    if (companyId) where.companyId = companyId;

    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.planType) where.planType = query.planType;
    if (query.status) where.status = query.status;

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { referenceNo: { contains: q, mode: 'insensitive' } },
        {
          employee: {
            is: {
              OR: [
                { employeeCode: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { nickname: { contains: q, mode: 'insensitive' } },
                { displayName: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const [items, total, active, completed, suspended] =
      await this.prisma.$transaction([
        this.prisma.employeeDeductionPlan.findMany({
          where,
          include: { employee: { select: this.employeeSelect } },
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.employeeDeductionPlan.count({ where }),
        this.prisma.employeeDeductionPlan.count({
          where: { ...where, status: 'ACTIVE' },
        }),
        this.prisma.employeeDeductionPlan.count({
          where: { ...where, status: 'COMPLETED' },
        }),
        this.prisma.employeeDeductionPlan.count({
          where: { ...where, status: 'SUSPENDED' },
        }),
      ]);

    return {
      data: items.map((item) => this.format(item)),
      meta: toPageMeta(page, pageSize, total),
      summary: {
        total,
        active,
        completed,
        suspended,
        outstandingTotal: toMoney(
          items.reduce((sum, item) => sum + (this.outstandingOf(item) ?? 0), 0),
        ),
      },
    };
  }

  async findOne(id: string, scope: TenantScope) {
    const plan = await this.prisma.employeeDeductionPlan.findFirst({
      where: { id, deletedAt: null },
      include: {
        employee: { select: this.employeeSelect },
        entries: {
          orderBy: { createdAt: 'desc' },
          include: {
            payrollRun: {
              select: {
                id: true,
                runNo: true,
                status: true,
                paidAt: true,
                period: { select: { paymentDate: true } },
              },
            },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('ไม่พบแผนหักเงินเดือนนี้');
    }

    assertWithinScope(scope, { companyId: plan.companyId });

    const entries = plan.entries.map((entry) => ({
      id: entry.id,
      payrollRunId: entry.payrollRunId,
      payrollRunNo: entry.payrollRun?.runNo ?? null,
      payrollRunStatus: entry.payrollRun?.status ?? null,
      paymentDate:
        entry.payrollRun?.period?.paymentDate ??
        entry.payrollRun?.paidAt ??
        null,
      amount: toMoney(entry.amount),
      balanceBefore: toMoney(entry.balanceBefore),
      balanceAfter: toMoney(entry.balanceAfter),
      isPartial: entry.isPartial,
      note: entry.note,
      createdAt: entry.createdAt,
    }));

    return { ...this.format(plan), entries };
  }

  async create(dto: CreateEmployeeDeductionPlanDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId, deletedAt: null },
      select: { id: true, branchId: true },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบพนักงานในบริษัทนี้');
    }

    assertWithinScope(scope, {
      companyId,
      branchId: employee.branchId,
    });

    this.assertAmounts(dto.totalAmount, dto.installmentAmount, dto.paidAmount);

    const duplicated = await this.prisma.employeeDeductionPlan.findFirst({
      where: {
        employeeId: dto.employeeId,
        code: dto.code.trim().toUpperCase(),
        deletedAt: null,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException(
        'พนักงานคนนี้มีแผนหักรหัสนี้ที่ยังใช้งานอยู่แล้ว',
      );
    }

    const created = await this.prisma.employeeDeductionPlan.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        planType: dto.planType,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        referenceNo: dto.referenceNo?.trim() || null,
        totalAmount: dto.totalAmount ?? null,
        installmentAmount: dto.installmentAmount,
        paidAmount: dto.paidAmount ?? 0,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        priority: dto.priority ?? DEFAULT_PRIORITY_BY_TYPE[dto.planType] ?? 100,
        allowPartialDeduction: dto.allowPartialDeduction ?? true,
        note: dto.note?.trim() || null,
      },
      include: { employee: { select: this.employeeSelect } },
    });

    return this.format(created);
  }

  async update(
    id: string,
    dto: UpdateEmployeeDeductionPlanDto,
    scope: TenantScope,
  ) {
    const current = await this.requirePlan(id, scope);

    if (current.status === 'CANCELLED') {
      throw new BadRequestException('แผนที่ยกเลิกแล้วแก้ไขไม่ได้');
    }

    const nextTotal =
      dto.totalAmount === undefined
        ? current.totalAmount === null
          ? null
          : toMoney(current.totalAmount)
        : dto.totalAmount;
    const nextInstallment =
      dto.installmentAmount ?? toMoney(current.installmentAmount);

    this.assertAmounts(nextTotal, nextInstallment, toMoney(current.paidAmount));

    const updated = await this.prisma.employeeDeductionPlan.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        referenceNo:
          dto.referenceNo === undefined
            ? undefined
            : dto.referenceNo?.trim() || null,
        totalAmount:
          dto.totalAmount === undefined ? undefined : dto.totalAmount,
        installmentAmount: dto.installmentAmount,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate:
          dto.endDate === undefined
            ? undefined
            : dto.endDate
              ? new Date(dto.endDate)
              : null,
        priority: dto.priority,
        allowPartialDeduction: dto.allowPartialDeduction,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
      include: { employee: { select: this.employeeSelect } },
    });

    return this.format(updated);
  }

  /** พักการหักชั่วคราว — งวดถัดไปจะข้ามแผนนี้ */
  async suspend(id: string, scope: TenantScope, reason?: string) {
    const plan = await this.requirePlan(id, scope);

    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException('พักได้เฉพาะแผนที่กำลังใช้งานอยู่');
    }

    return this.setStatus(id, 'SUSPENDED', reason);
  }

  async resume(id: string, scope: TenantScope) {
    const plan = await this.requirePlan(id, scope);

    if (plan.status !== 'SUSPENDED') {
      throw new BadRequestException('กลับมาใช้งานได้เฉพาะแผนที่พักอยู่');
    }

    return this.setStatus(id, 'ACTIVE');
  }

  /** ยกเลิกแผน — ประวัติการหักที่เกิดขึ้นแล้วยังอยู่ครบ */
  async cancel(id: string, scope: TenantScope, reason?: string) {
    const plan = await this.requirePlan(id, scope);

    if (plan.status === 'CANCELLED') {
      throw new BadRequestException('แผนนี้ถูกยกเลิกไปแล้ว');
    }

    return this.setStatus(id, 'CANCELLED', reason);
  }

  async remove(id: string, scope: TenantScope) {
    const plan = await this.requirePlan(id, scope);

    const deductedCount = await this.prisma.employeeDeductionPlanEntry.count({
      where: { planId: plan.id },
    });

    if (deductedCount > 0) {
      throw new BadRequestException(
        `แผนนี้เคยหักเงินไปแล้ว ${deductedCount.toLocaleString('th-TH')} งวด ลบไม่ได้ ให้ใช้การยกเลิกแทนเพื่อเก็บประวัติไว้`,
      );
    }

    await this.prisma.employeeDeductionPlan.update({
      where: { id },
      data: { status: 'CANCELLED', deletedAt: new Date() },
    });

    return { id, deleted: true };
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  private async requirePlan(id: string, scope: TenantScope) {
    const plan = await this.prisma.employeeDeductionPlan.findFirst({
      where: { id, deletedAt: null },
    });

    if (!plan) {
      throw new NotFoundException('ไม่พบแผนหักเงินเดือนนี้');
    }

    assertWithinScope(scope, { companyId: plan.companyId });

    return plan;
  }

  private async setStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED',
    reason?: string,
  ) {
    const updated = await this.prisma.employeeDeductionPlan.update({
      where: { id },
      data: {
        status,
        note: reason?.trim() ? reason.trim() : undefined,
      },
      include: { employee: { select: this.employeeSelect } },
    });

    return this.format(updated);
  }

  /**
   * ยอดผ่อนต่องวดต้องไม่มากกว่ายอดหนี้ที่เหลือ ไม่งั้นตั้งค่ามาแล้วหักไม่ได้จริง
   */
  private assertAmounts(
    totalAmount: number | null | undefined,
    installmentAmount: number,
    paidAmount = 0,
  ) {
    if (installmentAmount <= 0) {
      throw new BadRequestException('ยอดหักต่องวดต้องมากกว่า 0');
    }

    if (totalAmount === null || totalAmount === undefined) return;

    if (totalAmount <= 0) {
      throw new BadRequestException('ยอดหนี้ทั้งหมดต้องมากกว่า 0');
    }

    if (paidAmount > totalAmount) {
      throw new BadRequestException(
        'ยอดที่หักไปแล้วมากกว่ายอดหนี้ทั้งหมด กรุณาตรวจสอบตัวเลข',
      );
    }
  }

  private outstandingOf(plan: {
    totalAmount: Prisma.Decimal | null;
    paidAmount: Prisma.Decimal;
  }) {
    return resolveOutstandingBalance({
      totalAmount: plan.totalAmount === null ? null : toMoney(plan.totalAmount),
      paidAmount: toMoney(plan.paidAmount),
    });
  }

  private format(plan: {
    id: string;
    companyId: string;
    employeeId: string;
    planType: string;
    code: string;
    name: string;
    referenceNo: string | null;
    totalAmount: Prisma.Decimal | null;
    installmentAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    startDate: Date;
    endDate: Date | null;
    priority: number;
    allowPartialDeduction: boolean;
    status: string;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    employee?: unknown;
  }) {
    const outstanding = this.outstandingOf(plan);
    const total = plan.totalAmount === null ? null : toMoney(plan.totalAmount);
    const installment = toMoney(plan.installmentAmount);

    return {
      id: plan.id,
      companyId: plan.companyId,
      employeeId: plan.employeeId,
      employee: plan.employee ?? null,
      planType: plan.planType,
      code: plan.code,
      name: plan.name,
      referenceNo: plan.referenceNo,
      totalAmount: total,
      installmentAmount: installment,
      paidAmount: toMoney(plan.paidAmount),
      outstandingAmount: outstanding,
      /** ประมาณการว่าเหลืออีกกี่งวดจึงหักครบ (null = ไม่กำหนดยอดเต็ม) */
      remainingInstallments:
        outstanding === null || installment <= 0
          ? null
          : Math.ceil(outstanding / installment),
      progressPercent:
        total === null || total <= 0
          ? null
          : Math.min(Math.round((toMoney(plan.paidAmount) / total) * 100), 100),
      startDate: plan.startDate,
      endDate: plan.endDate,
      priority: plan.priority,
      allowPartialDeduction: plan.allowPartialDeduction,
      status: plan.status,
      note: plan.note,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }
}
