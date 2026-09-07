import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  applyOvertimeAmountRounding,
  type OvertimeAmountRoundingModeValue,
} from '../../overtime/utils/overtime-amount.util';
import { resolveSalaryRates } from '../../../common/utils/salary-rate.util';
import type {
  CollectPayrollHandoffParams,
  PayrollHandoffLine,
  PayrollHandoffSummary,
} from '../types/payroll-handoff.types';

/** ค่าจากนโยบาย OT ที่ payroll ต้องใช้ตอนสร้าง line */
type OvertimePolicySettings = {
  multiplier: number;
  amountRoundingMode: OvertimeAmountRoundingModeValue;
  includeInTax: boolean;
  includeInSocialSecurity: boolean;
};

/**
 * PayrollHandoffImportService
 * ---------------------------
 * Service นี้ทำหน้าที่แปลงข้อมูลจาก HR Review Center ให้เป็น PayrollLine
 *
 * ใช้ใน Phase 8:
 * - OT ที่ HR กด PAYROLL_READY -> สร้างรายได้ OVERTIME_PAY
 * - ใบลาไม่รับค่าจ้าง -> สร้าง INFO line เท่านั้น เพราะยอดหักใช้ AttendanceDailySummary
 * - ใบลาที่ได้รับค่าจ้าง -> สร้าง INFO line เพื่อให้สลิปมี audit trail แต่ไม่กระทบยอดเงิน
 * - Time Adjust -> สร้าง INFO line เพื่อบอกว่าเวลาได้รับการปรับแล้ว แต่ phase นี้ยังไม่คำนวณหักมาสาย/ขาดงาน
 *
 * ข้อควรระวัง:
 * - Service นี้ควรถูกเรียกภายใน Prisma transaction ของ calculate payroll run เท่านั้น
 * - ถ้า Payroll Run ถูกคำนวณซ้ำ จะยังดึงรายการ SENT_TO_PAYROLL ของ payrollRunId เดิมกลับมาคำนวณใหม่ได้
 *   เพื่อไม่ให้รายการหายตอน recalculate run เดิม
 */
@Injectable()
export class PayrollHandoffImportService {
  /**
   * รวมรายการที่ HR Review แล้วสำหรับพนักงานหนึ่งคนในงวดเงินเดือนหนึ่งงวด
   */
  async collectEmployeeHandoffLines(
    tx: Prisma.TransactionClient,
    params: CollectPayrollHandoffParams,
  ): Promise<PayrollHandoffSummary> {
    const summary: PayrollHandoffSummary = {
      reviewItemIds: [],
      earningLines: [],
      deductionLines: [],
      infoLines: [],
      overtimeHours: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      lateMinutes: 0,
    };

    const reviewItems = await this.findEligibleReviewItems(tx, params);
    const importedOvertimeIds = new Set<string>();

    for (const reviewItem of reviewItems) {
      if (reviewItem.sourceType === 'OVERTIME') {
        const line = await this.buildOvertimeLine(tx, params, reviewItem);

        if (line) {
          summary.reviewItemIds.push(reviewItem.id);
          summary.earningLines.push(line);
          summary.overtimeHours += line.quantity;
          importedOvertimeIds.add(line.sourceId);
        }
      }

      if (reviewItem.sourceType === 'LEAVE') {
        const leaveResult = await this.buildLeaveLine(tx, params, reviewItem);

        if (leaveResult) {
          summary.reviewItemIds.push(reviewItem.id);

          if (leaveResult.kind === 'PAID') {
            summary.paidLeaveDays += leaveResult.days;
            summary.infoLines.push(leaveResult.line);
          } else {
            // ยอดหักลาไม่รับค่าจ้างใช้ AttendanceDailySummary เป็น source of truth
            // จึงเก็บ HrReviewItem เป็น INFO เพื่อ audit เท่านั้น ไม่สร้าง deduction ซ้ำ
            summary.unpaidLeaveDays += leaveResult.days;
            summary.infoLines.push(leaveResult.line);
          }
        }
      }

      if (reviewItem.sourceType === 'TIME_ADJUST') {
        const line = await this.buildTimeAdjustInfoLine(tx, params, reviewItem);

        if (line) {
          summary.reviewItemIds.push(reviewItem.id);
          summary.infoLines.push(line);
        }
      }
    }

    const approvedOvertimes = await this.findApprovedOvertimeRequests(
      tx,
      params,
    );

    for (const overtime of approvedOvertimes) {
      if (importedOvertimeIds.has(overtime.id)) continue;

      const line = await this.buildOvertimeLineFromRequest(
        tx,
        params,
        overtime,
      );

      if (line) {
        summary.earningLines.push(line);
        summary.overtimeHours += line.quantity;
        importedOvertimeIds.add(line.sourceId);
      }
    }

    return summary;
  }

  /**
   * หลังสร้าง PayrollLine สำเร็จ ให้ mark HrReviewItem เป็น SENT_TO_PAYROLL
   * เพื่อกันการนำไปเข้า payroll run อื่นซ้ำ
   */
  async markReviewItemsSentToPayroll(
    tx: Prisma.TransactionClient,
    params: {
      reviewItemIds: string[];
      periodId: string;
      payrollRunId: string;
      userId?: string;
    },
  ) {
    if (params.reviewItemIds.length === 0) return;

    await (tx as any).hrReviewItem.updateMany({
      where: {
        id: {
          in: params.reviewItemIds,
        },
      },
      data: {
        status: 'SENT_TO_PAYROLL',
        periodId: params.periodId,
        payrollRunId: params.payrollRunId,
        sentToPayrollAt: new Date(),
        sentToPayrollById: params.userId ?? null,
      },
    });
  }

  /**
   * หา HrReviewItem ที่มีสิทธิ์เข้า payroll
   *
   * เงื่อนไข:
   * - PAYROLL_READY = รายการใหม่ที่ HR กดพร้อมเข้าเงินเดือน
   * - SENT_TO_PAYROLL + payrollRunId เดิม = รายการที่เคยเข้า run นี้แล้ว ใช้ตอน recalculate run เดิม
   */
  private async findEligibleReviewItems(
    tx: Prisma.TransactionClient,
    params: CollectPayrollHandoffParams,
  ) {
    return (tx as any).hrReviewItem.findMany({
      where: {
        companyId: params.companyId,
        employeeId: params.employeeId,
        OR: [
          {
            status: 'PAYROLL_READY',
            OR: [{ periodId: null }, { periodId: params.periodId }],
            AND: [
              {
                OR: [
                  { payrollRunId: null },
                  { payrollRunId: params.payrollRunId },
                ],
              },
            ],
          },
          {
            status: 'SENT_TO_PAYROLL',
            payrollRunId: params.payrollRunId,
          },
        ],
      },
      orderBy: [{ sourceType: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * แปลง OT ที่อนุมัติแล้วเป็น line รายได้
   */
  private async buildOvertimeLine(
    tx: Prisma.TransactionClient,
    params: CollectPayrollHandoffParams,
    reviewItem: any,
  ): Promise<PayrollHandoffLine | null> {
    const overtime = await (tx as any).overtimeRequest.findFirst({
      where: {
        id: reviewItem.sourceId,
        employeeId: params.employeeId,
        status: 'APPROVED',
        deletedAt: null,
        workDate: {
          gte: params.periodStartDate,
          lte: params.periodEndDate,
        },
      },
    });

    if (!overtime) return null;

    return this.buildOvertimeLineFromRequest(tx, params, overtime);
  }

  /**
   * Phase 9B: นำ OT ที่ APPROVED แล้วเข้า Payroll โดยตรงได้ด้วย
   * เพื่อรองรับระบบเดิมที่ OT อนุมัติจบแล้ว แต่ยังไม่ได้สร้าง HrReviewItem PAYROLL_READY
   */
  private async findApprovedOvertimeRequests(
    tx: Prisma.TransactionClient,
    params: CollectPayrollHandoffParams,
  ) {
    const candidates = await (tx as any).overtimeRequest.findMany({
      where: {
        employeeId: params.employeeId,
        status: 'APPROVED',
        deletedAt: null,
        workDate: {
          gte: params.periodStartDate,
          lte: params.periodEndDate,
        },
      },
      orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
    });

    if (candidates.length === 0) return candidates;

    /*
     * กันจ่าย OT ซ้ำข้ามงวด
     *
     * เส้นทาง HrReviewItem มีตัวกันอยู่แล้ว (mark SENT_TO_PAYROLL) แต่เส้นทางนี้
     * เป็นทางสำรองที่ดึงจากตาราง OvertimeRequest ตรง ๆ ซึ่งไม่มีสถานะ "จ่ายแล้ว"
     * และไม่มีฟิลด์ผูกกับงวดที่จ่าย ถ้ามีงวดแก้ไข/งวดพิเศษที่ช่วงวันคาบเกี่ยวกัน
     * OT ใบเดิมจะถูกออกเป็นรายการเงินซ้ำทั้งสองงวดโดยไม่มีอะไรจับได้
     *
     * จึงตัดใบที่เคยถูกออกเป็น PayrollLine ในงวด "อื่น" ไปแล้วออก
     * (งวดปัจจุบันไม่ตัด เพราะการคำนวณซ้ำจะลบรายการเดิมทิ้งก่อนสร้างใหม่อยู่แล้ว)
     */
    const consumed = await (tx as any).payrollLine.findMany({
      where: {
        sourceType: 'OVERTIME',
        sourceId: { in: candidates.map((item: any) => item.id) },
        payrollItem: {
          runId: { not: params.payrollRunId },
          run: { deletedAt: null, status: { not: 'CANCELLED' } },
        },
      },
      select: { sourceId: true },
    });

    if (consumed.length === 0) return candidates;

    const consumedIds = new Set(
      consumed.map((line: any) => line.sourceId).filter(Boolean),
    );

    return candidates.filter((item: any) => !consumedIds.has(item.id));
  }

  private async buildOvertimeLineFromRequest(
    tx: Prisma.TransactionClient,
    params: CollectPayrollHandoffParams,
    overtime: any,
  ): Promise<PayrollHandoffLine | null> {
    const hours = this.toNumber(overtime.totalHours);
    const payrollRates = this.buildPayrollRates(
      params.baseSalary,
      params.payrollCalculationSettings,
      params.salaryBasis,
    );
    const policy = await this.findOvertimePolicySettings(tx, {
      companyId: params.companyId,
      employeeId: params.employeeId,
      workType: overtime.workType,
    });
    // อัตราที่แสดงบนสลิปปัดเศษ แต่ยอดเงินคิดจากอัตราเต็มแล้วปัดครั้งเดียว
    const rate = this.roundMoney(payrollRates.exactHourlyRate * policy.multiplier);
    const amount = this.roundMoney(
      applyOvertimeAmountRounding(
        hours * payrollRates.exactHourlyRate * policy.multiplier,
        policy.amountRoundingMode,
      ),
    );

    if (amount <= 0 || hours <= 0) return null;

    const code =
      overtime.workType === 'HOLIDAY'
        ? 'OT_HOLIDAY'
        : overtime.workType === 'SPECIAL_HOLIDAY'
          ? 'OT_SPECIAL_HOLIDAY'
          : 'OVERTIME_PAY';

    return {
      code,
      name: 'ค่าล่วงเวลา',
      type: 'EARNING',
      sourceType: 'OVERTIME',
      sourceId: overtime.id,
      componentId: null,
      quantity: hours,
      rate,
      amount,
      isTaxable: policy.includeInTax,
      isSocialSecurityBase: policy.includeInSocialSecurity,
      sortOrder: 110,
      note: `OT ${overtime.requestNo ?? overtime.id} · hourlyRate ${payrollRates.hourlyRate} = salary/${payrollRates.salaryDivisorDays}/${payrollRates.workingHoursPerDay}`,
    };
  }

  /**
   * แปลงใบลาที่อนุมัติแล้วเป็น line
   * - paid leave: INFO line
   * - unpaid leave: DEDUCTION line
   */
  private async buildLeaveLine(
    tx: Prisma.TransactionClient,
    params: CollectPayrollHandoffParams,
    reviewItem: any,
  ): Promise<
    | { kind: 'PAID'; days: number; line: PayrollHandoffLine }
    | { kind: 'UNPAID_ATTENDANCE'; days: number; line: PayrollHandoffLine }
    | null
  > {
    const leave = await (tx as any).leaveRequest.findFirst({
      where: {
        id: reviewItem.sourceId,
        employeeId: params.employeeId,
        status: 'APPROVED',
        deletedAt: null,
        // ใช้ overlap กับงวดเงินเดือน เพื่อรองรับกรณีใบลาคร่อมช่วงวันที่
        startDate: { lte: params.periodEndDate },
        endDate: { gte: params.periodStartDate },
      },
      include: {
        leaveType: true,
      },
    });

    if (!leave) return null;

    const days = this.toNumber(leave.totalDays);
    if (days <= 0) return null;

    const leaveName = leave.leaveType?.nameTh ?? 'วันลา';

    if (leave.leaveType?.isPaid) {
      return {
        kind: 'PAID',
        days,
        line: {
          code: 'PAID_LEAVE_DAYS',
          name: `${leaveName} (ได้รับค่าจ้าง)`,
          type: 'INFO',
          sourceType: 'LEAVE',
          sourceId: leave.id,
          quantity: days,
          rate: 0,
          amount: 0,
          isTaxable: false,
          isSocialSecurityBase: false,
          sortOrder: 810,
          note: `Leave ${leave.requestNo ?? leave.id}`,
        },
      };
    }

    // AttendanceDailySummary คำนวณยอดหักลาไม่รับค่าจ้างและถูกล็อกก่อน Payroll แล้ว
    // ตรงนี้จึงสร้างเฉพาะ INFO line เพื่อคง audit trail ของใบลา โดยไม่หักเงินซ้ำ
    return {
      kind: 'UNPAID_ATTENDANCE',
      days,
      line: {
        code: 'UNPAID_LEAVE_INFO',
        name: `${leaveName} (หักผ่าน Attendance)`,
        type: 'INFO',
        sourceType: 'LEAVE',
        sourceId: leave.id,
        quantity: days,
        rate: 0,
        amount: 0,
        isTaxable: false,
        isSocialSecurityBase: false,
        sortOrder: 811,
        note: `Leave ${leave.requestNo ?? leave.id} · ยอดหักอ้างอิง AttendanceDailySummary ที่ล็อกแล้ว`,
      },
    };
  }

  /**
   * Time Adjust ใน phase นี้ยังไม่สร้างเงินเพิ่ม/เงินหัก
   * แต่สร้าง INFO line เพื่อให้ payroll มีหลักฐานว่ารายการนี้ถูก HR ส่งเข้ารอบเงินเดือนแล้ว
   */
  private async buildTimeAdjustInfoLine(
    tx: Prisma.TransactionClient,
    params: CollectPayrollHandoffParams,
    reviewItem: any,
  ): Promise<PayrollHandoffLine | null> {
    const timeAdjust = await (tx as any).timeAdjustRequest.findFirst({
      where: {
        id: reviewItem.sourceId,
        employeeId: params.employeeId,
        status: 'APPROVED',
        deletedAt: null,
        requestedLogTime: {
          gte: params.periodStartDate,
          lte: this.endOfDay(params.periodEndDate),
        },
      },
    });

    if (!timeAdjust) return null;

    return {
      code: 'TIME_ADJUST_INFO',
      name: 'ปรับเวลาเข้างาน/ออกงาน',
      type: 'INFO',
      sourceType: 'ATTENDANCE',
      sourceId: timeAdjust.id,
      quantity: 1,
      rate: 0,
      amount: 0,
      isTaxable: false,
      isSocialSecurityBase: false,
      sortOrder: 820,
      note: `Time Adjust ${timeAdjust.requestNo ?? timeAdjust.id}`,
    };
  }

  /**
   * หานโยบาย OT ที่มีผลกับพนักงานคนนี้ เรียงตามความเฉพาะเจาะจง
   * สาขา+ประเภทพนักงาน > สาขา > ประเภทพนักงาน > ทั้งบริษัท
   * ถ้าไม่เจอเลย fallback เป็นอัตราขั้นต่ำตามกฎหมายและพฤติกรรมเดิม
   */
  private async findOvertimePolicySettings(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      employeeId: string;
      workType: string;
    },
  ): Promise<OvertimePolicySettings> {
    const employee = await tx.employee.findFirst({
      where: { id: params.employeeId },
      select: { employeeTypeId: true, branchId: true },
    });

    const branchId = employee?.branchId ?? null;
    const employeeTypeId = employee?.employeeTypeId ?? null;

    const policies = await tx.overtimePolicy.findMany({
      where: {
        companyId: params.companyId,
        workType:
          params.workType as Prisma.EnumOvertimeWorkTypeFilter['equals'],
        deletedAt: null,
        status: 'ACTIVE',
        AND: [
          {
            OR: branchId
              ? [{ branchId }, { branchId: null }]
              : [{ branchId: null }],
          },
          {
            OR: employeeTypeId
              ? [{ employeeTypeId }, { employeeTypeId: null }]
              : [{ employeeTypeId: null }],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    const policy = policies
      .map((item) => ({
        item,
        score:
          (branchId && item.branchId === branchId ? 2 : 0) +
          (employeeTypeId && item.employeeTypeId === employeeTypeId ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0]?.item;

    if (policy) {
      return {
        multiplier: this.toNumber(policy.rateMultiplier) || 1,
        amountRoundingMode: policy.amountRoundingMode,
        // พฤติกรรมเดิมของ line OT คือเข้าฐานภาษี ไม่เข้าฐานประกันสังคม
        includeInTax: policy.includeInTax,
        includeInSocialSecurity: policy.includeInSocialSecurity,
      };
    }

    const fallbackMultiplier =
      params.workType === 'HOLIDAY'
        ? 2
        : params.workType === 'SPECIAL_HOLIDAY'
          ? 3
          : 1.5;

    return {
      multiplier: fallbackMultiplier,
      amountRoundingMode: 'NONE' as OvertimeAmountRoundingModeValue,
      includeInTax: true,
      includeInSocialSecurity: false,
    };
  }

  private buildPayrollRates(
    baseSalary: number,
    settings?: {
      salaryDivisorDays?: number;
      workingHoursPerDay?: number;
    } | null,
    /**
     * ฐานของ baseSalary — ไม่ส่งมา = MONTHLY เท่าพฤติกรรมเดิมทุกประการ
     *
     * ต้องรู้ฐานก่อนถึงจะหาอัตราต่อชั่วโมงได้ ตัวเลข 500 อย่างเดียวบอกไม่ได้ว่า
     * เป็นเงินเดือน 500 หรือค่าแรงวันละ 500 เดิมเหมาว่าเป็นรายเดือนแล้วหาร /30
     * เสมอ พนักงานรายวัน 500/วัน จึงได้อัตรา OT 2.08 บาท/ชม. แทน 62.50 บาท/ชม.
     */
    salaryBasis: 'MONTHLY' | 'DAILY' | 'HOURLY' = 'MONTHLY',
  ) {
    const salaryDivisorDays = this.normalizePositiveNumber(
      settings?.salaryDivisorDays,
      30,
    );
    const workingHoursPerDay = this.normalizePositiveNumber(
      settings?.workingHoursPerDay,
      8,
    );
    /*
     * เก็บอัตราแบบไม่ปัดเศษไว้ใช้คำนวณ และปัดเศษเฉพาะค่าที่เอาไปแสดง
     *
     * เดิมปัดอัตรารายวันแล้วหารต่อเป็นรายชั่วโมงแล้วปัดอีก พอคูณกลับขึ้นมา
     * ยอดจะเพี้ยนหลักสตางค์ เช่น เงินเดือน 55,000 OT 4.5 ชม. อัตรา 1.5 เท่า
     *   เดิม  55,000/30 = 1,833.33 -> /8 = 229.17 -> x1.5 x4.5 = 1,546.90+
     *   ใหม่  55,000/30/8 x 1.5 x 4.5 = 1,546.88
     */
    const { exactDailyRate, exactHourlyRate } = resolveSalaryRates(
      baseSalary,
      { salaryDivisorDays, workingHoursPerDay },
      salaryBasis,
    );

    return {
      salaryBasis,
      salaryDivisorDays,
      workingHoursPerDay,
      dailyRate: this.roundMoney(exactDailyRate),
      hourlyRate: this.roundMoney(exactHourlyRate),
      exactHourlyRate,
    };
  }

  private normalizePositiveNumber(value: unknown, fallback: number) {
    const number = Number(value ?? fallback);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  private roundNumber(value: number) {
    return Math.round(value * 100) / 100;
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private endOfDay(value: Date) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }
}
