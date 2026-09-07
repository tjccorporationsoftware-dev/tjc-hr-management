import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { PayrollExtraLineSummary } from '../types/payroll-extra-lines.types';

/**
 * PayrollAttendanceDeductionImportService
 * ------------------------------------------------------------
 * แปลงข้อมูลจาก attendance_daily_summaries เป็นรายการหักเงินเดือน
 *
 * หลักสำคัญหลัง Batch 5:
 * - attendance_daily_summaries คือ source of truth ของ late/missing penalty
 * - Payroll ไม่คำนวณค่าปรับใหม่จาก raw log เพื่อลดความเสี่ยงยอดไม่ตรงกับหน้า /attendance
 * - unpaid leave แสดงเป็นข้อมูล reconcile เท่านั้น เพราะรายการหักเงินจริงมาจาก HR Review / Leave Handoff
 *   เพื่อป้องกันการหักซ้ำ
 */

type AttendancePayrollRuleKind =
  | 'LATE'
  | 'EARLY_LEAVE'
  | 'MISSING_CHECK_IN'
  | 'MISSING_CHECK_OUT'
  | 'ABSENCE';

type AttendancePayrollRuleLike = {
  id: string;
  code: string;
  name: string;
  kind: AttendancePayrollRuleKind;
  componentId: string | null;
  componentCode: string | null;
  isTaxable: boolean | null;
  isSocialSecurityBase: boolean | null;
  sortOrder: number | null;
};

/**
 * ค่าตั้งต้นของรายการหักจาก PayrollComponent ของบริษัท
 *
 * ใช้เมื่อยังไม่ได้ตั้ง attendance_payroll_rules — เดิม fallback เป็น false ตายตัว
 * ทำให้รายการที่ "หักเพราะไม่ได้ทำงาน" (ขาดงาน ลาไม่รับค่าจ้าง) ไม่ลดฐานภาษี
 * กลายเป็นเก็บภาษีจากค่าจ้างที่ลูกจ้างไม่ได้รับ จึงต้องอ่านธงจาก component
 *
 * ส่วนฐานประกันสังคม ผู้ใช้เลือกให้คิดจากเงินเดือนเต็ม รายการพวกนี้จึงไม่ลดฐาน
 * (ดูเหตุผลที่ payroll-default-components.ts) สองฐานไม่เท่ากันโดยตั้งใจ
 */
type AttendanceComponentDefault = {
  id: string;
  code: string;
  isTaxable: boolean | null;
  isSocialSecurityBase: boolean | null;
  sortOrder: number | null;
};

/** component ที่รายการหักจากเวลาทำงานอ้างถึง */
export const ATTENDANCE_DEDUCTION_COMPONENT_CODES = [
  'LATE_DEDUCTION',
  'MISSING_LOG_DEDUCTION',
  'EARLY_LEAVE_DEDUCTION',
  'ABSENCE_DEDUCTION',
  'ATTENDANCE_UNPAID_LEAVE_DEDUCTION',
] as const;

type AttendanceDailySummaryLike = {
  id: string;
  employeeId: string;
  workDate: Date;
  morningInAt?: Date | null;
  afternoonInAt?: Date | null;
  checkOutAt?: Date | null;
  totalLateMinutes: number;
  isMorningMissing: boolean;
  isAfternoonMissing: boolean;
  isCheckoutMissing: boolean;
  hasMissingLog: boolean;
  latePenaltyAmount: Prisma.Decimal | number | string | null;
  missingLogPenaltyAmount: Prisma.Decimal | number | string | null;
  isAbsent?: boolean | null;
  absentDays?: Prisma.Decimal | number | string | null;
  absentDeductionAmount?: Prisma.Decimal | number | string | null;
  unpaidLeaveDeductionAmount: Prisma.Decimal | number | string | null;
  earlyCheckoutMinutes?: number | null;
  earlyCheckoutPenaltyAmount?: Prisma.Decimal | number | string | null;
  totalDeductionAmount: Prisma.Decimal | number | string | null;
  leaveIsPaid: boolean | null;
  leaveDurationDays: Prisma.Decimal | number | string | null;
  lockedAt?: Date | null;
};

export type PayrollAttendanceDeductionBreakdown = {
  employeeId: string;
  dailySummaryIds: string[];
  dailySummaryCount: number;
  lockedSummaryCount: number;
  lateMinutes: number;
  lateDays: number;
  missingLogDays: number;
  missingLogOccurrences: number;
  earlyCheckoutMinutes: number;
  earlyCheckoutDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  /** วันที่มีการสแกนเวลาจริงและไม่ได้ขาดงาน — วันหยุด/วันลาเต็มวันไม่นับ */
  workedDays: number;
  latePenaltyAmount: number;
  missingLogPenaltyAmount: number;
  absentDeductionAmount: number;
  earlyCheckoutPenaltyAmount: number;
  unpaidLeaveDeductionAmount: number;
  payrollAttendanceDeductionAmount: number;
  totalDeductionAmount: number;
};

@Injectable()
export class PayrollAttendanceDeductionImportService {
  /**
   * ใช้ระหว่าง calculate payroll run เพื่อสร้าง PayrollLine จาก daily summary
   */
  async collectEmployeeAttendanceDeductions(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      employeeId: string;
      periodStartDate: Date;
      periodEndDate: Date;
      baseSalary: number;
      activeRules?: AttendancePayrollRuleLike[];
      activeComponents?: AttendanceComponentDefault[];
      hasLeaveHandoffUnpaidLeaveDeduction?: boolean;
    },
  ): Promise<PayrollExtraLineSummary> {
    const summary: PayrollExtraLineSummary = {
      earningLines: [],
      deductionLines: [],
      infoLines: [],
      lateMinutes: 0,
      absentDays: 0,
    };

    const [rules, components, breakdown] = await Promise.all([
      params.activeRules
        ? Promise.resolve(params.activeRules)
        : this.findActiveRulesForCompany(tx, params.companyId),
      params.activeComponents
        ? Promise.resolve(params.activeComponents)
        : this.findAttendanceComponentsForCompany(tx, params.companyId),
      this.collectEmployeeAttendanceDeductionBreakdown(tx, params),
    ]);

    const componentByCode = new Map(
      components.map((component) => [component.code, component]),
    );

    summary.lateMinutes = breakdown.lateMinutes;
    summary.absentDays = breakdown.absentDays;
    summary.workedDays = breakdown.workedDays;

    if (breakdown.latePenaltyAmount > 0) {
      const rule = this.findRule(rules, ['LATE']);
      const component = componentByCode.get(
        rule?.componentCode || 'LATE_DEDUCTION',
      );

      summary.deductionLines.push({
        code: rule?.componentCode || rule?.code || 'LATE_DEDUCTION',
        name: rule?.name || 'หักมาสาย',
        type: 'DEDUCTION',
        sourceType: 'ATTENDANCE',
        sourceId: this.buildSourceId(breakdown.dailySummaryIds),
        componentId: rule?.componentId ?? component?.id ?? null,
        quantity: breakdown.lateMinutes,
        rate: breakdown.lateMinutes > 0 ? this.roundMoney(breakdown.latePenaltyAmount / breakdown.lateMinutes) : breakdown.latePenaltyAmount,
        amount: breakdown.latePenaltyAmount,
        isTaxable: rule?.isTaxable ?? component?.isTaxable ?? false,
        isSocialSecurityBase:
          rule?.isSocialSecurityBase ?? component?.isSocialSecurityBase ?? false,
        sortOrder: rule?.sortOrder ?? 610,
        note: `Attendance daily summaries: มาสาย ${breakdown.lateMinutes} นาที / ${breakdown.lateDays} วัน`,
      });
    }

    if (breakdown.missingLogPenaltyAmount > 0) {
      const rule = this.findRule(rules, ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']);
      const component = componentByCode.get(
        rule?.componentCode || 'MISSING_LOG_DEDUCTION',
      );

      summary.deductionLines.push({
        code: rule?.componentCode || rule?.code || 'MISSING_LOG_DEDUCTION',
        name: rule?.name || 'หักลืมสแกนเวลา',
        type: 'DEDUCTION',
        sourceType: 'ATTENDANCE',
        sourceId: this.buildSourceId(breakdown.dailySummaryIds),
        componentId: rule?.componentId ?? component?.id ?? null,
        quantity: breakdown.missingLogDays,
        rate: breakdown.missingLogDays > 0 ? this.roundMoney(breakdown.missingLogPenaltyAmount / breakdown.missingLogDays) : breakdown.missingLogPenaltyAmount,
        amount: breakdown.missingLogPenaltyAmount,
        isTaxable: rule?.isTaxable ?? component?.isTaxable ?? false,
        isSocialSecurityBase:
          rule?.isSocialSecurityBase ?? component?.isSocialSecurityBase ?? false,
        sortOrder: rule?.sortOrder ?? 620,
        note: `Attendance daily summaries: ลืมสแกน ${breakdown.missingLogDays} วัน / ${breakdown.missingLogOccurrences} จุด`,
      });
    }

    if (breakdown.earlyCheckoutPenaltyAmount > 0) {
      const rule = this.findRule(rules, ['EARLY_LEAVE']);
      const component = componentByCode.get(
        rule?.componentCode || 'EARLY_LEAVE_DEDUCTION',
      );

      summary.deductionLines.push({
        code: rule?.componentCode || 'EARLY_LEAVE_DEDUCTION',
        name: rule?.name || 'หักออกก่อนเวลา',
        type: 'DEDUCTION',
        sourceType: 'ATTENDANCE',
        sourceId: this.buildSourceId(breakdown.dailySummaryIds),
        componentId: rule?.componentId ?? component?.id ?? null,
        quantity: breakdown.earlyCheckoutMinutes || breakdown.earlyCheckoutDays,
        rate: breakdown.earlyCheckoutMinutes > 0
          ? this.roundMoney(breakdown.earlyCheckoutPenaltyAmount / breakdown.earlyCheckoutMinutes)
          : breakdown.earlyCheckoutPenaltyAmount,
        amount: breakdown.earlyCheckoutPenaltyAmount,
        isTaxable: rule?.isTaxable ?? component?.isTaxable ?? false,
        isSocialSecurityBase:
          rule?.isSocialSecurityBase ?? component?.isSocialSecurityBase ?? false,
        sortOrder: rule?.sortOrder ?? 625,
        note: `Attendance daily summaries: ออกก่อนเวลา ${breakdown.earlyCheckoutMinutes} นาที / ${breakdown.earlyCheckoutDays} วัน`,
      });
    }

    if (breakdown.absentDeductionAmount > 0) {
      const rule = this.findRule(rules, ['ABSENCE']);
      const component = componentByCode.get(
        rule?.componentCode || 'ABSENCE_DEDUCTION',
      );

      summary.deductionLines.push({
        code: rule?.componentCode || rule?.code || 'ABSENCE_DEDUCTION',
        name: rule?.name || 'หักขาดงาน',
        type: 'DEDUCTION',
        sourceType: 'ATTENDANCE',
        sourceId: this.buildSourceId(breakdown.dailySummaryIds),
        componentId: rule?.componentId ?? component?.id ?? null,
        quantity: breakdown.absentDays,
        rate: breakdown.absentDays > 0 ? this.roundMoney(breakdown.absentDeductionAmount / breakdown.absentDays) : breakdown.absentDeductionAmount,
        amount: breakdown.absentDeductionAmount,
        isTaxable: rule?.isTaxable ?? component?.isTaxable ?? false,
        isSocialSecurityBase:
          rule?.isSocialSecurityBase ?? component?.isSocialSecurityBase ?? false,
        sortOrder: rule?.sortOrder ?? 630,
        note: `Attendance daily summaries: ขาดงาน ${breakdown.absentDays} วัน`,
      });
    }

    /**
     * unpaid leave ต้องกันหักซ้ำกับ Leave/HR Review handoff
     * - ถ้ามี UNPAID_LEAVE_DEDUCTION จาก LEAVE แล้ว ให้เก็บเป็น INFO reconcile เท่านั้น
     * - ถ้าไม่มี Leave handoff ที่ match แต่ AttendanceDailySummary มียอดลาไม่รับค่าจ้าง ให้สร้าง DEDUCTION จาก Attendance
     */
    if (breakdown.unpaidLeaveDeductionAmount > 0) {
      if (params.hasLeaveHandoffUnpaidLeaveDeduction) {
        summary.infoLines.push({
          code: 'ATTENDANCE_UNPAID_LEAVE_RECONCILE',
          name: 'ข้อมูลลาไม่รับค่าจ้างจาก Attendance',
          type: 'INFO',
          sourceType: 'ATTENDANCE',
          sourceId: this.buildSourceId(breakdown.dailySummaryIds),
          componentId: null,
          quantity: breakdown.unpaidLeaveDays,
          rate: 0,
          amount: 0,
          isTaxable: false,
          isSocialSecurityBase: false,
          sortOrder: 830,
          note: `ยอด unpaid leave จาก attendance summary ${this.roundMoney(breakdown.unpaidLeaveDeductionAmount).toLocaleString('th-TH')} บาท ใช้ reconcile กับ Leave Handoff เพื่อกันหักซ้ำ`,
        });
      } else {
        // ลาไม่รับค่าจ้าง = ลูกจ้างไม่ได้รับค่าจ้างส่วนนั้นจริง ต้องลดทั้งฐานภาษี
        // และฐานประกันสังคมตามที่ payroll-default-components.ts กำหนดไว้
        const component = componentByCode.get('ATTENDANCE_UNPAID_LEAVE_DEDUCTION');

        summary.deductionLines.push({
          code: 'ATTENDANCE_UNPAID_LEAVE_DEDUCTION',
          name: 'หักลาไม่รับค่าจ้าง',
          type: 'DEDUCTION',
          sourceType: 'ATTENDANCE',
          sourceId: this.buildSourceId(breakdown.dailySummaryIds),
          componentId: component?.id ?? null,
          quantity: breakdown.unpaidLeaveDays,
          rate: breakdown.unpaidLeaveDays > 0
            ? this.roundMoney(breakdown.unpaidLeaveDeductionAmount / breakdown.unpaidLeaveDays)
            : breakdown.unpaidLeaveDeductionAmount,
          amount: breakdown.unpaidLeaveDeductionAmount,
          isTaxable: component?.isTaxable ?? true,
          /*
           * ไม่ลดฐานประกันสังคม — ผู้ใช้เลือกให้คิดเงินสมทบจากเงินเดือนเต็ม
           * (2569-08-25) ต้องตรงกับธงใน payroll-default-components.ts
           * ไม่งั้นบริษัทที่ยังไม่เคยรันเงินเดือน (ยังไม่มี component) จะได้คนละกติกา
           */
          isSocialSecurityBase: component?.isSocialSecurityBase ?? false,
          sortOrder: 640,
          note: `Attendance daily summaries: ลาไม่รับค่าจ้าง ${breakdown.unpaidLeaveDays} วัน (fallback เมื่อไม่มี Leave Handoff)`,
        });
      }
    }

    return summary;
  }

  /**
   * นับ "วันที่ต้องจ่ายค่าจ้าง" ของพนักงานรายวัน/รายชั่วโมง โดยไม่สนสถานะรีวิว
   *
   * ต่างจาก workedDays ใน breakdown ที่นับเฉพาะ summary ที่ล็อกแล้ว เพราะอันนั้น
   * ใช้คุมไม่ให้ "ค่าปรับ" ที่ HR ยังไม่รีวิวไหลเข้าเงินเดือน
   *
   * แต่ค่าจ้างของพนักงานรายวัน/รายชั่วโมงคิดจากจำนวนวันโดยตรง ถ้าไปใช้ตัวที่
   * กรองสถานะด้วย พอ HR ยังไม่ล็อกเวลา ค่าจ้างจะกลายเป็นศูนย์เงียบ ๆ ทั้งที่
   * พนักงานมาทำงานครบเดือน ซึ่งอันตรายกว่าการเอาตัวเลขที่ยังไม่รีวิวมาใช้มาก
   *
   * นับวันที่เข้าเงื่อนไขอย่างใดอย่างหนึ่ง
   *   - มีการสแกนเวลาอย่างน้อยหนึ่งรอบ = มาทำงานจริง
   *   - เป็นวันลาที่ได้รับค่าจ้าง = กฎหมายบังคับให้จ่ายแม้ไม่ได้มาทำงาน
   *     (ลาป่วย ม.57 · ลาพักร้อน ม.56 ใช้กับลูกจ้างรายวันเหมือนกัน)
   *
   * ถ้าไม่นับวันลาที่ได้รับค่าจ้าง พนักงานรายวันที่ลาป่วยมีใบรับรองแพทย์
   * จะไม่ได้ค่าจ้างวันนั้นเลย ซึ่งผิดกฎหมายและมองไม่ออกจากยอดรวม
   *
   * วันหยุดประจำสัปดาห์ไม่นับ เพราะลูกจ้างรายวันไม่ได้รับค่าจ้างวันหยุดประจำสัปดาห์
   * โดยปริยาย (ม.56 วรรคท้าย) ถ้าบริษัทตกลงจ่ายต้องใส่เป็นรายการเพิ่มเอง
   */
  async countPayableDaysForPeriod(
    tx: Prisma.TransactionClient,
    params: {
      employeeId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ): Promise<number> {
    return (tx as any).attendanceDailySummary.count({
      where: {
        employeeId: params.employeeId,
        workDate: {
          gte: params.periodStartDate,
          lte: params.periodEndDate,
        },
        isAbsent: false,
        OR: [
          { morningInAt: { not: null } },
          { afternoonInAt: { not: null } },
          { checkOutAt: { not: null } },
          { leaveIsPaid: true },
        ],
      },
    });
  }

  /**
   * ใช้ทั้ง payroll calculation และ preview endpoint เพื่อให้ยอดหน้า Payroll ตรงกับหน้า Attendance
   */
  async collectEmployeeAttendanceDeductionBreakdown(
    tx: Prisma.TransactionClient,
    params: {
      employeeId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ): Promise<PayrollAttendanceDeductionBreakdown> {
    const summaries = (await (tx as any).attendanceDailySummary.findMany({
      where: {
        employeeId: params.employeeId,
        workDate: {
          gte: params.periodStartDate,
          lte: params.periodEndDate,
        },
        reviewStatus: { in: ['LOCKED', 'SENT_TO_PAYROLL'] },
      },
      orderBy: [{ workDate: 'asc' }],
    })) as AttendanceDailySummaryLike[];

    let lateMinutes = 0;
    let lateDays = 0;
    let missingLogDays = 0;
    let missingLogOccurrences = 0;
    let unpaidLeaveDays = 0;
    let absentDays = 0;
    let earlyCheckoutMinutes = 0;
    let earlyCheckoutDays = 0;
    let workedDays = 0;
    let latePenaltyAmount = 0;
    let missingLogPenaltyAmount = 0;
    let absentDeductionAmount = 0;
    let earlyCheckoutPenaltyAmount = 0;
    let unpaidLeaveDeductionAmount = 0;
    let totalDeductionAmount = 0;
    let lockedSummaryCount = 0;

    for (const daily of summaries) {
      const dailyLateMinutes = Number(daily.totalLateMinutes || 0);

      if (dailyLateMinutes > 0) {
        lateDays += 1;
        lateMinutes += dailyLateMinutes;
      }

      if (daily.hasMissingLog && !daily.isAbsent) {
        missingLogDays += 1;
        missingLogOccurrences += [
          daily.isMorningMissing,
          daily.isAfternoonMissing,
          daily.isCheckoutMissing,
        ].filter(Boolean).length;
      }

      const dailyEarlyCheckoutMinutes = Number(daily.earlyCheckoutMinutes || 0);
      if (dailyEarlyCheckoutMinutes > 0 || this.toNumber(daily.earlyCheckoutPenaltyAmount) > 0) {
        earlyCheckoutDays += 1;
        earlyCheckoutMinutes += dailyEarlyCheckoutMinutes;
      }

      if (daily.leaveIsPaid === false) {
        unpaidLeaveDays += this.toNumber(daily.leaveDurationDays);
      }

      if (daily.isAbsent || this.toNumber(daily.absentDays) > 0) {
        absentDays += this.toNumber(daily.absentDays) || 1;
      }

      /*
       * วันทำงานจริง = มีการสแกนอย่างน้อยหนึ่งจุดและไม่ได้ขาดงาน
       *
       * ต้องนับจากการสแกน ไม่ใช่นับจำนวน summary เพราะระบบสร้าง summary
       * ให้ครบทุกวันในงวดรวมวันหยุดและวันลาด้วย
       */
      const hasPunch = Boolean(
        daily.morningInAt || daily.afternoonInAt || daily.checkOutAt,
      );

      if (hasPunch && !daily.isAbsent) {
        workedDays += 1;
      }

      if (daily.lockedAt) {
        lockedSummaryCount += 1;
      }

      latePenaltyAmount += this.toNumber(daily.latePenaltyAmount);
      missingLogPenaltyAmount += this.toNumber(daily.missingLogPenaltyAmount);
      absentDeductionAmount += this.toNumber(daily.absentDeductionAmount);
      earlyCheckoutPenaltyAmount += this.toNumber(daily.earlyCheckoutPenaltyAmount);
      unpaidLeaveDeductionAmount += this.toNumber(daily.unpaidLeaveDeductionAmount);
      totalDeductionAmount += this.toNumber(daily.totalDeductionAmount);
    }

    const payrollAttendanceDeductionAmount = this.roundMoney(
      latePenaltyAmount +
        missingLogPenaltyAmount +
        absentDeductionAmount +
        earlyCheckoutPenaltyAmount +
        unpaidLeaveDeductionAmount,
    );

    return {
      employeeId: params.employeeId,
      dailySummaryIds: summaries.map((summary) => summary.id),
      dailySummaryCount: summaries.length,
      lockedSummaryCount,
      lateMinutes,
      lateDays,
      missingLogDays,
      missingLogOccurrences,
      earlyCheckoutMinutes,
      earlyCheckoutDays,
      unpaidLeaveDays: this.roundMoney(unpaidLeaveDays),
      absentDays: this.roundMoney(absentDays),
      workedDays,
      latePenaltyAmount: this.roundMoney(latePenaltyAmount),
      missingLogPenaltyAmount: this.roundMoney(missingLogPenaltyAmount),
      absentDeductionAmount: this.roundMoney(absentDeductionAmount),
      earlyCheckoutPenaltyAmount: this.roundMoney(earlyCheckoutPenaltyAmount),
      unpaidLeaveDeductionAmount: this.roundMoney(unpaidLeaveDeductionAmount),
      payrollAttendanceDeductionAmount,
      totalDeductionAmount: this.roundMoney(totalDeductionAmount),
    };
  }

  async findActiveRulesForCompany(client: any, companyId: string) {
    return (await (client as any).attendancePayrollRule.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })) as AttendancePayrollRuleLike[];
  }

  /**
   * PayrollComponent ของรายการหักจากเวลาทำงาน ใช้เป็นค่าตั้งต้นเมื่อบริษัท
   * ยังไม่ได้ตั้ง attendance_payroll_rules ซึ่งเป็นสถานะเริ่มต้นของทุกบริษัทใหม่
   */
  async findAttendanceComponentsForCompany(client: any, companyId: string) {
    return (await (client as any).payrollComponent.findMany({
      where: {
        companyId,
        code: { in: [...ATTENDANCE_DEDUCTION_COMPONENT_CODES] },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        isTaxable: true,
        isSocialSecurityBase: true,
        sortOrder: true,
      },
    })) as AttendanceComponentDefault[];
  }

  private findRule(
    rules: AttendancePayrollRuleLike[],
    kinds: AttendancePayrollRuleKind[],
  ) {
    return rules.find((rule) => kinds.includes(rule.kind));
  }

  private buildSourceId(ids: string[]) {
    if (ids.length === 1) return ids[0];
    if (ids.length === 0) return null;
    return `attendance_daily_summaries:${ids.length}`;
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }
}
