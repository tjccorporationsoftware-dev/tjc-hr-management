import { Injectable, Logger } from '@nestjs/common';
import {
  PayrollLineSourceType,
  PayrollLineType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { PayrollExtraLine } from '../types/payroll-extra-lines.types';
import { toMoney } from '../utils/payroll-money.util';
import { resolveDeductionsForPeriod } from '../utils/payroll-deduction-plan.util';

export type DeductionPlanLineSummary = {
  deductionLines: PayrollExtraLine[];
  /** ใช้บันทึกลง entry หลังสร้าง PayrollItem แล้ว */
  pendingEntries: Array<{
    planId: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    isPartial: boolean;
    completed: boolean;
    note: string | null;
  }>;
  totalDeducted: number;
};

const PLAN_TYPE_LABEL: Record<string, string> = {
  STUDENT_LOAN: 'กยศ./กรอ.',
  EMPLOYEE_LOAN: 'เงินกู้พนักงาน',
  COOPERATIVE: 'สหกรณ์',
  WORK_GUARANTEE: 'เงินประกันการทำงาน',
  DAMAGE_PAYMENT: 'ชำระค่าเสียหาย',
  OTHER: 'รายการผ่อนอื่น ๆ',
};

const PLAN_TYPE_SORT_ORDER: Record<string, number> = {
  STUDENT_LOAN: 720,
  EMPLOYEE_LOAN: 730,
  COOPERATIVE: 740,
  WORK_GUARANTEE: 745,
  DAMAGE_PAYMENT: 747,
  OTHER: 750,
};

/**
 * PayrollDeductionPlanService
 * -----------------------------------------------------------------------------
 * หักเงินเดือนแบบผ่อนงวด — กยศ./กรอ. เงินกู้พนักงาน สหกรณ์
 *
 * รายการเหล่านี้เป็นการหักจากเงินที่ลูกจ้างได้รับแล้ว
 * จึง "ไม่" ลดฐานภาษีและฐานประกันสังคม (ต่างจากลาไม่รับค่าจ้าง)
 *
 * กันหักซ้ำด้วย unique(planId, payrollRunId) ที่ตาราง entry
 * คำนวณ payroll run เดิมซ้ำกี่ครั้ง ยอดหนี้ก็ไม่ลดเกินจริง
 */
@Injectable()
export class PayrollDeductionPlanService {
  private readonly logger = new Logger(PayrollDeductionPlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * สร้างรายการหักของงวดนี้จากแผนที่ยังใช้งานอยู่
   *
   * `availableNetPay` คือเงินสุทธิที่เหลือหลังหักภาษี ประกันสังคม และรายการอื่นแล้ว
   * เพื่อไม่ให้หักหนี้จนเงินสุทธิติดลบ
   */
  async collectEmployeeDeductionPlanLines(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      employeeId: string;
      payrollRunId: string;
      periodEndDate: Date;
      availableNetPay: number;
    },
  ): Promise<DeductionPlanLineSummary> {
    const plans = await tx.employeeDeductionPlan.findMany({
      where: {
        companyId: params.companyId,
        employeeId: params.employeeId,
        deletedAt: null,
        status: 'ACTIVE',
        startDate: { lte: params.periodEndDate },
        OR: [{ endDate: null }, { endDate: { gte: params.periodEndDate } }],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    if (plans.length === 0) {
      return { deductionLines: [], pendingEntries: [], totalDeducted: 0 };
    }

    /*
     * งวดนี้เคยหักไปแล้วหรือยัง — เกิดได้เมื่อ HR กดคำนวณ payroll run ซ้ำ
     * ถ้าเคยหักแล้วต้องใช้ยอดเดิม ไม่ใช่หักเพิ่มอีกรอบ
     */
    const existingEntries = await tx.employeeDeductionPlanEntry.findMany({
      where: {
        payrollRunId: params.payrollRunId,
        planId: { in: plans.map((plan) => plan.id) },
      },
    });
    const existingByPlanId = new Map(
      existingEntries.map((entry) => [entry.planId, entry]),
    );

    const deductionLines: PayrollExtraLine[] = [];
    const pendingEntries: DeductionPlanLineSummary['pendingEntries'] = [];
    let totalDeducted = 0;

    const freshPlans = plans.filter((plan) => !existingByPlanId.has(plan.id));

    // แผนที่เคยหักในงวดนี้แล้ว ใช้ยอดเดิมทั้งหมด
    for (const plan of plans) {
      const existing = existingByPlanId.get(plan.id);
      if (!existing) continue;

      const amount = toMoney(existing.amount);
      if (amount <= 0) continue;

      deductionLines.push(this.buildLine(plan, amount, existing.isPartial));
      totalDeducted = toMoney(totalDeducted + amount);
    }

    const roomAfterExisting = Math.max(
      toMoney(params.availableNetPay) - totalDeducted,
      0,
    );

    const { results } = resolveDeductionsForPeriod(
      freshPlans.map((plan) => ({
        id: plan.id,
        priority: plan.priority,
        totalAmount:
          plan.totalAmount === null ? null : toMoney(plan.totalAmount),
        installmentAmount: toMoney(plan.installmentAmount),
        paidAmount: toMoney(plan.paidAmount),
        allowPartialDeduction: plan.allowPartialDeduction,
      })),
      roomAfterExisting,
    );

    const planById = new Map(freshPlans.map((plan) => [plan.id, plan]));

    for (const { plan: resolved, result } of results) {
      const plan = planById.get(resolved.id);
      if (!plan || result.amount <= 0) continue;

      deductionLines.push(
        this.buildLine(plan, result.amount, result.isPartial),
      );
      totalDeducted = toMoney(totalDeducted + result.amount);

      pendingEntries.push({
        planId: plan.id,
        amount: result.amount,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        isPartial: result.isPartial,
        completed: result.completed,
        note: result.isPartial
          ? 'หักได้ไม่เต็มงวดเพราะเงินสุทธิเหลือไม่พอ'
          : null,
      });
    }

    return { deductionLines, pendingEntries, totalDeducted };
  }

  /**
   * บันทึกผลการหักลงประวัติ และเดินยอดคงเหลือของแผน
   * เรียกหลังจากสร้าง PayrollItem ของงวดนั้นแล้ว
   */
  async commitDeductionPlanEntries(
    tx: Prisma.TransactionClient,
    params: {
      payrollRunId: string;
      payrollItemId: string;
      entries: DeductionPlanLineSummary['pendingEntries'];
    },
  ) {
    for (const entry of params.entries) {
      // unique(planId, payrollRunId) กันไม่ให้บันทึกซ้ำถ้ามีการคำนวณพร้อมกัน
      const created = await tx.employeeDeductionPlanEntry.createMany({
        data: [
          {
            planId: entry.planId,
            payrollRunId: params.payrollRunId,
            payrollItemId: params.payrollItemId,
            amount: entry.amount,
            balanceBefore: entry.balanceBefore,
            balanceAfter: entry.balanceAfter,
            isPartial: entry.isPartial,
            note: entry.note,
          },
        ],
        skipDuplicates: true,
      });

      if (created.count === 0) continue;

      await tx.employeeDeductionPlan.update({
        where: { id: entry.planId },
        data: {
          paidAmount: { increment: entry.amount },
          status: entry.completed ? 'COMPLETED' : undefined,
        },
      });
    }
  }

  /**
   * ยกเลิกผลการหักของงวดนั้น ใช้ตอน HR ยกเลิก/คำนวณ payroll run ใหม่
   * คืนยอดหนี้กลับให้ตรงกับความจริง
   */
  /**
   * คืนยอดหนี้ของแผนผ่อนที่หักไปในรอบนี้
   *
   * @param employeeIds จำกัดเฉพาะบางคน — ใช้ตอนคำนวณใหม่รายคน ถ้าไม่ส่งมาคือทั้งรอบ
   *   ถ้าคำนวณคนเดียวแล้วคืนยอดทั้งรอบ คนอื่นจะถูกคืนยอดหนี้ทิ้งไปเฉย ๆ
   *   โดยไม่มีการหักกลับ เพราะรอบนี้ไม่ได้คำนวณคนเหล่านั้นใหม่
   */
  async revertDeductionPlanEntries(
    tx: Prisma.TransactionClient,
    payrollRunId: string,
    employeeIds?: string[],
  ) {
    const entries = await tx.employeeDeductionPlanEntry.findMany({
      where: {
        payrollRunId,
        ...(employeeIds?.length
          ? { plan: { employeeId: { in: employeeIds } } }
          : {}),
      },
    });

    if (entries.length === 0) return 0;

    for (const entry of entries) {
      await tx.employeeDeductionPlan.update({
        where: { id: entry.planId },
        data: {
          paidAmount: { decrement: toMoney(entry.amount) },
          // เคยปิดแผนไปเพราะหักครบ พอคืนยอดต้องกลับมาใช้งานได้อีก
          status: 'ACTIVE',
        },
      });
    }

    await tx.employeeDeductionPlanEntry.deleteMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
    });

    this.logger.log(
      `revert deduction plan entries run=${payrollRunId} count=${entries.length}`,
    );

    return entries.length;
  }

  private buildLine(
    plan: {
      id: string;
      planType: string;
      code: string;
      name: string;
      referenceNo: string | null;
      totalAmount: Prisma.Decimal | null;
      paidAmount: Prisma.Decimal;
    },
    amount: number,
    isPartial: boolean,
  ): PayrollExtraLine {
    const label = PLAN_TYPE_LABEL[plan.planType] ?? 'รายการผ่อน';
    const outstanding =
      plan.totalAmount === null
        ? null
        : Math.max(toMoney(plan.totalAmount) - toMoney(plan.paidAmount), 0);

    const noteParts = [label];
    if (plan.referenceNo) noteParts.push(`เลขที่ ${plan.referenceNo}`);
    if (outstanding !== null) {
      noteParts.push(
        `คงเหลือก่อนหัก ${outstanding.toLocaleString('th-TH', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} บาท`,
      );
    }
    if (isPartial) noteParts.push('หักได้ไม่เต็มงวด');

    return {
      code: plan.code,
      name: plan.name,
      type: PayrollLineType.DEDUCTION,
      sourceType: PayrollLineSourceType.ADJUSTMENT,
      sourceId: plan.id,
      componentId: null,
      quantity: 1,
      rate: amount,
      amount,
      // หักจากเงินที่ได้รับแล้ว จึงไม่ลดฐานภาษี/ประกันสังคม
      isTaxable: false,
      isSocialSecurityBase: false,
      sortOrder: PLAN_TYPE_SORT_ORDER[plan.planType] ?? 750,
      note: noteParts.join(' | '),
    };
  }
}
