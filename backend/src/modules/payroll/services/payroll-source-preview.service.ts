import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { PayrollExtraLineSummary } from '../types/payroll-extra-lines.types';

type PayrollSourcePreviewStatus =
  | 'MATCHED'
  | 'EXCLUDED'
  | 'ALREADY_IMPORTED'
  | 'IMPORTED_OTHER_RUN';

type PayrollSourcePreviewItemCategory = 'RECURRING' | 'ADJUSTMENT';

type PayrollSourcePreviewLineType =
  | 'EARNING'
  | 'DEDUCTION'
  | 'EMPLOYER_CONTRIBUTION'
  | 'INFO'
  | string;

type SourceLineIndex = Map<string, { lineId: string; payrollItemId: string }>;

/**
 * PayrollSourcePreviewService
 * ---------------------------
 * Read-only diagnostics สำหรับดูว่ารายการต้นทางใดควรเข้า Payroll Run
 * และรายการใดถูกตัดออกเพราะอะไร โดยไม่สร้าง/แก้ PayrollLine จริง
 */
@Injectable()
export class PayrollSourcePreviewService {
  constructor(private readonly prisma: PrismaService) {}


  /**
   * กฎกลางสำหรับ Calculate / Dry Run:
   * ใช้เงื่อนไขเดียวกับ Source Preview ในการเลือก EmployeeCompensationItem
   * ที่พร้อมเข้า Payroll จริง เพื่อไม่ให้ Preview เห็นอย่างหนึ่งแต่ Calculate ใช้อีกอย่างหนึ่ง
   */
  async collectEmployeeRecurringLines(
    client: Prisma.TransactionClient | PrismaService | any,
    params: {
      companyId: string;
      employeeId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ): Promise<PayrollExtraLineSummary> {
    const items = await this.findMatchedRecurringItems(client, params);
    return this.toExtraLineSummary(items, { defaultSortOrder: 100 });
  }

  /**
   * กฎกลางสำหรับ PayrollAdjustment:
   * - APPROVED + periodId ตรงงวด
   * - APPROVED + ยังไม่ผูก periodId แต่ effectiveDate อยู่ในงวด
   * - IMPORTED ที่เป็น Run เดิม เพื่อรองรับการคำนวณซ้ำของ Run เดิม
   */
  async collectEmployeeAdjustmentLines(
    client: Prisma.TransactionClient | PrismaService | any,
    params: {
      companyId: string;
      employeeId: string;
      periodId: string;
      payrollRunId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ): Promise<PayrollExtraLineSummary> {
    const items = await this.findMatchedAdjustmentItems(client, params);
    return this.toExtraLineSummary(items, {
      defaultSortOrder: 500,
      includeAdjustmentIds: true,
    });
  }

  async countMatchedApprovedAdjustments(
    client: Prisma.TransactionClient | PrismaService | any,
    params: {
      companyId: string;
      employeeIds: string[];
      periodId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ) {
    if (!params.employeeIds.length) return 0;

    return (client as any).payrollAdjustment.count({
      where: {
        companyId: params.companyId,
        employeeId: { in: params.employeeIds },
        deletedAt: null,
        status: 'APPROVED',
        importedAt: null,
        OR: [
          { periodId: params.periodId },
          {
            periodId: null,
            effectiveDate: {
              gte: params.periodStartDate,
              lte: params.periodEndDate,
            },
          },
        ],
      },
    });
  }

  async getRunSourcePreview(runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id: runId,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        period: true,
        items: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                title: true,
                firstName: true,
                lastName: true,
                displayName: true,
                position: true,
                status: true,
                department: {
                  select: {
                    id: true,
                    code: true,
                    nameTh: true,
                  },
                },
                branch: {
                  select: {
                    id: true,
                    code: true,
                    nameTh: true,
                  },
                },
              },
            },
            lines: {
              select: {
                id: true,
                sourceId: true,
              },
            },
          },
          orderBy: {
            employee: {
              employeeCode: 'asc',
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    const employees = run.items.length
      ? run.items.map((item) => item.employee)
      : await this.prisma.employee.findMany({
          where: {
            companyId: run.companyId,
            deletedAt: null,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            employeeCode: true,
            title: true,
            firstName: true,
            lastName: true,
            displayName: true,
            position: true,
            status: true,
            department: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
            branch: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
          },
          orderBy: {
            employeeCode: 'asc',
          },
        });

    const employeeIds = employees.map((employee) => employee.id);
    const sourceLineIndex = this.buildSourceLineIndex(run.items);

    const recurringItems = employeeIds.length
      ? await (this.prisma as any).employeeCompensationItem.findMany({
          where: {
            companyId: run.companyId,
            employeeId: { in: employeeIds },
            deletedAt: null,
          },
          orderBy: [
            { employeeId: 'asc' },
            { sortOrder: 'asc' },
            { effectiveDate: 'asc' },
            { code: 'asc' },
          ],
        })
      : [];

    const adjustments = employeeIds.length
      ? await (this.prisma as any).payrollAdjustment.findMany({
          where: {
            companyId: run.companyId,
            employeeId: { in: employeeIds },
            deletedAt: null,
            OR: [
              { periodId: run.periodId },
              { payrollRunId: run.id },
              {
                effectiveDate: {
                  gte: run.period.startDate,
                  lte: run.period.endDate,
                },
              },
              { status: 'APPROVED' },
              { status: 'IMPORTED' },
            ],
          },
          orderBy: [
            { employeeId: 'asc' },
            { sortOrder: 'asc' },
            { effectiveDate: 'asc' },
            { createdAt: 'asc' },
          ],
        })
      : [];

    const recurringByEmployee = this.groupByEmployee(recurringItems);
    const adjustmentsByEmployee = this.groupByEmployee(adjustments);

    const employeePreviews = employees.map((employee) => {
      const recurring = (recurringByEmployee.get(employee.id) ?? []).map(
        (item: any) =>
          this.buildRecurringPreviewItem({
            item,
            periodStartDate: run.period.startDate,
            periodEndDate: run.period.endDate,
            sourceLineIndex,
          }),
      );

      const adjustment = (adjustmentsByEmployee.get(employee.id) ?? []).map(
        (item: any) =>
          this.buildAdjustmentPreviewItem({
            item,
            periodId: run.periodId,
            payrollRunId: run.id,
            periodStartDate: run.period.startDate,
            periodEndDate: run.period.endDate,
            sourceLineIndex,
          }),
      );

      const allItems = [...recurring, ...adjustment];
      const warnings = allItems
        .filter((item) => item.matchStatus === 'EXCLUDED')
        .map((item) => `${item.name}: ${item.reasons.join(', ')}`);

      return {
        employee,
        totals: this.buildEmployeeTotals(allItems),
        recurringItems: recurring,
        adjustmentItems: adjustment,
        warnings,
      };
    });

    return {
      run: {
        id: run.id,
        runNo: run.runNo,
        name: run.name,
        status: run.status,
        company: run.company,
        period: run.period,
      },
      summary: this.buildSummary(employeePreviews),
      employees: employeePreviews,
    };
  }


  private async findMatchedRecurringItems(
    client: Prisma.TransactionClient | PrismaService | any,
    params: {
      companyId: string;
      employeeId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ) {
    return (client as any).employeeCompensationItem.findMany({
      where: {
        companyId: params.companyId,
        employeeId: params.employeeId,
        status: 'ACTIVE',
        deletedAt: null,
        effectiveDate: { lte: params.periodEndDate },
        OR: [{ endDate: null }, { endDate: { gte: params.periodStartDate } }],
      },
      orderBy: [
        { sortOrder: 'asc' },
        { effectiveDate: 'asc' },
        { code: 'asc' },
      ],
    });
  }

  private async findMatchedAdjustmentItems(
    client: Prisma.TransactionClient | PrismaService | any,
    params: {
      companyId: string;
      employeeId: string;
      periodId: string;
      payrollRunId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ) {
    return (client as any).payrollAdjustment.findMany({
      where: {
        companyId: params.companyId,
        employeeId: params.employeeId,
        deletedAt: null,
        OR: [
          {
            status: 'APPROVED',
            OR: [
              { periodId: params.periodId },
              {
                periodId: null,
                effectiveDate: {
                  gte: params.periodStartDate,
                  lte: params.periodEndDate,
                },
              },
            ],
          },
          {
            status: 'IMPORTED',
            payrollRunId: params.payrollRunId,
          },
        ],
      },
      orderBy: [
        { sortOrder: 'asc' },
        { effectiveDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  private toExtraLineSummary(
    items: any[],
    options: { defaultSortOrder: number; includeAdjustmentIds?: boolean },
  ): PayrollExtraLineSummary {
    const summary: PayrollExtraLineSummary = {
      earningLines: [],
      deductionLines: [],
      infoLines: [],
      ...(options.includeAdjustmentIds ? { adjustmentIds: [] } : {}),
    };

    for (const item of items) {
      const line = {
        code: item.code,
        name: item.name,
        type: item.type,
        sourceType: item.sourceType,
        sourceId: item.id,
        componentId: item.componentId ?? null,
        compensationId: item.compensationId ?? null,
        quantity: this.toNumber(item.quantity ?? 1),
        rate: this.toNumber(item.rate ?? item.amount ?? 0),
        amount: this.toMoney(item.amount),
        isTaxable: item.isTaxable,
        isSocialSecurityBase: item.isSocialSecurityBase,
        /*
         * รายการปรับปรุงเฉพาะงวดไม่มีคอลัมน์นี้ จะได้ undefined
         * ซึ่งถูกแล้ว เพราะยอดของมันคือยอดของงวดนั้น ไม่ต้องหารอีก
         */
        prorateByEmploymentDays: item.prorateByEmploymentDays ?? undefined,
        sortOrder: item.sortOrder ?? options.defaultSortOrder,
        note: item.note ?? item.reason ?? null,
      };

      if (line.amount <= 0 && line.type !== 'INFO') continue;

      if (options.includeAdjustmentIds) {
        summary.adjustmentIds?.push(item.id);
      }

      if (line.type === 'EARNING') summary.earningLines.push(line);
      else if (line.type === 'DEDUCTION') summary.deductionLines.push(line);
      else summary.infoLines.push(line);
    }

    return summary;
  }

  private buildSourceLineIndex(items: Array<{ id: string; lines: Array<{ id: string; sourceId: string | null }> }>): SourceLineIndex {
    const index: SourceLineIndex = new Map();

    for (const item of items) {
      for (const line of item.lines ?? []) {
        if (!line.sourceId) continue;
        index.set(line.sourceId, {
          lineId: line.id,
          payrollItemId: item.id,
        });
      }
    }

    return index;
  }

  private groupByEmployee(items: any[]) {
    const grouped = new Map<string, any[]>();

    for (const item of items) {
      const current = grouped.get(item.employeeId) ?? [];
      current.push(item);
      grouped.set(item.employeeId, current);
    }

    return grouped;
  }

  private buildRecurringPreviewItem(params: {
    item: any;
    periodStartDate: Date;
    periodEndDate: Date;
    sourceLineIndex: SourceLineIndex;
  }) {
    const { item, periodStartDate, periodEndDate, sourceLineIndex } = params;
    const reasons: string[] = [];
    const amount = this.toMoney(item.amount);

    if (item.status !== 'ACTIVE') {
      reasons.push('สถานะรายการไม่ใช่ ACTIVE');
    }

    if (item.effectiveDate && item.effectiveDate > periodEndDate) {
      reasons.push(
        `วันที่เริ่มใช้ ${this.formatDate(item.effectiveDate)} หลังวันสิ้นงวด ${this.formatDate(periodEndDate)}`,
      );
    }

    if (item.endDate && item.endDate < periodStartDate) {
      reasons.push(
        `วันที่สิ้นสุด ${this.formatDate(item.endDate)} ก่อนวันเริ่มงวด ${this.formatDate(periodStartDate)}`,
      );
    }

    if (amount <= 0 && item.type !== 'INFO') {
      reasons.push('จำนวนเงินต้องมากกว่า 0');
    }

    const existingLine = sourceLineIndex.get(item.id) ?? null;
    const matchStatus: PayrollSourcePreviewStatus = existingLine
      ? 'ALREADY_IMPORTED'
      : reasons.length
        ? 'EXCLUDED'
        : 'MATCHED';

    return this.toPreviewItem({
      category: 'RECURRING',
      item,
      amount,
      matchStatus,
      reasons,
      existingLine,
      actionLabel: existingLine
        ? 'สร้าง PayrollLine ใน Run นี้แล้ว'
        : reasons.length
          ? 'ยังไม่เข้า Payroll ตามเงื่อนไขงวดนี้'
          : 'พร้อมเข้า Payroll เมื่อคำนวณใหม่',
    });
  }

  private buildAdjustmentPreviewItem(params: {
    item: any;
    periodId: string;
    payrollRunId: string;
    periodStartDate: Date;
    periodEndDate: Date;
    sourceLineIndex: SourceLineIndex;
  }) {
    const {
      item,
      periodId,
      payrollRunId,
      periodStartDate,
      periodEndDate,
      sourceLineIndex,
    } = params;
    const reasons: string[] = [];
    const amount = this.toMoney(item.amount);
    const existingLine = sourceLineIndex.get(item.id) ?? null;
    const importedInThisRun =
      item.status === 'IMPORTED' && item.payrollRunId === payrollRunId;
    const importedInOtherRun =
      item.status === 'IMPORTED' &&
      item.payrollRunId &&
      item.payrollRunId !== payrollRunId;

    if (importedInOtherRun) {
      reasons.push('ถูกนำเข้า Payroll Run อื่นแล้ว');
    }

    if (!importedInThisRun && !existingLine && item.status !== 'APPROVED') {
      reasons.push('สถานะยังไม่ใช่ APPROVED');
    }

    if (item.periodId) {
      if (item.periodId !== periodId) {
        reasons.push('periodId ไม่ตรงกับงวดเงินเดือนนี้');
      }
    } else if (!item.effectiveDate) {
      reasons.push('ยังไม่มี periodId หรือ effectiveDate สำหรับจับคู่กับงวด');
    } else if (
      item.effectiveDate < periodStartDate ||
      item.effectiveDate > periodEndDate
    ) {
      reasons.push(
        `วันที่มีผล ${this.formatDate(item.effectiveDate)} อยู่นอกช่วงงวด ${this.formatDate(periodStartDate)} - ${this.formatDate(periodEndDate)}`,
      );
    }

    if (amount <= 0 && item.type !== 'INFO') {
      reasons.push('จำนวนเงินต้องมากกว่า 0');
    }

    const matchStatus: PayrollSourcePreviewStatus = importedInOtherRun
      ? 'IMPORTED_OTHER_RUN'
      : importedInThisRun || existingLine
        ? 'ALREADY_IMPORTED'
        : reasons.length
          ? 'EXCLUDED'
          : 'MATCHED';

    return this.toPreviewItem({
      category: 'ADJUSTMENT',
      item,
      amount,
      matchStatus,
      reasons,
      existingLine,
      actionLabel:
        matchStatus === 'ALREADY_IMPORTED'
          ? 'นำเข้า Payroll Run นี้แล้ว'
          : matchStatus === 'IMPORTED_OTHER_RUN'
            ? 'ถูกใช้กับ Payroll Run อื่น'
            : matchStatus === 'MATCHED'
              ? 'พร้อมเข้า Payroll เมื่อคำนวณใหม่'
              : 'ยังไม่เข้า Payroll ตามเงื่อนไขงวดนี้',
    });
  }

  private toPreviewItem(params: {
    category: PayrollSourcePreviewItemCategory;
    item: any;
    amount: number;
    matchStatus: PayrollSourcePreviewStatus;
    reasons: string[];
    existingLine: { lineId: string; payrollItemId: string } | null;
    actionLabel: string;
  }) {
    const { category, item, amount, matchStatus, reasons, existingLine, actionLabel } = params;

    return {
      id: item.id,
      category,
      code: item.code,
      name: item.name,
      type: item.type as PayrollSourcePreviewLineType,
      sourceType: item.sourceType,
      amount: this.toMoneyString(amount),
      quantity: this.toMoneyString(this.toNumber(item.quantity ?? 1), 4),
      rate: this.toMoneyString(this.toNumber(item.rate ?? amount), 4),
      isTaxable: Boolean(item.isTaxable),
      isSocialSecurityBase: Boolean(item.isSocialSecurityBase),
      status: item.status,
      effectiveDate: this.toIsoDate(item.effectiveDate),
      endDate: this.toIsoDate(item.endDate),
      periodId: item.periodId ?? null,
      payrollRunId: item.payrollRunId ?? null,
      matchStatus,
      matchStatusLabel: this.matchStatusLabel(matchStatus),
      actionLabel,
      reasons,
      lineId: existingLine?.lineId ?? null,
      payrollItemId: existingLine?.payrollItemId ?? null,
    };
  }

  private buildEmployeeTotals(items: Array<{ type: string; amount: string; matchStatus: PayrollSourcePreviewStatus }>) {
    const totals = {
      matchedEarningAmount: 0,
      matchedDeductionAmount: 0,
      matchedInfoCount: 0,
      matchedRecurringCount: 0,
      matchedAdjustmentCount: 0,
      alreadyImportedCount: 0,
      excludedCount: 0,
      importedOtherRunCount: 0,
    };

    for (const item of items) {
      const amount = this.toNumber(item.amount);
      const isReady = item.matchStatus === 'MATCHED';

      if (item.matchStatus === 'ALREADY_IMPORTED') totals.alreadyImportedCount += 1;
      if (item.matchStatus === 'EXCLUDED') totals.excludedCount += 1;
      if (item.matchStatus === 'IMPORTED_OTHER_RUN') totals.importedOtherRunCount += 1;

      if (!isReady) continue;
      if (item.type === 'EARNING') totals.matchedEarningAmount += amount;
      else if (item.type === 'DEDUCTION') totals.matchedDeductionAmount += amount;
      else if (item.type === 'INFO') totals.matchedInfoCount += 1;
    }

    return {
      matchedEarningAmount: this.toMoneyString(totals.matchedEarningAmount),
      matchedDeductionAmount: this.toMoneyString(totals.matchedDeductionAmount),
      matchedInfoCount: totals.matchedInfoCount,
      alreadyImportedCount: totals.alreadyImportedCount,
      excludedCount: totals.excludedCount,
      importedOtherRunCount: totals.importedOtherRunCount,
    };
  }

  private buildSummary(employees: Array<{ recurringItems: any[]; adjustmentItems: any[]; totals: any }>) {
    const summary = {
      employeeCount: employees.length,
      recurringItemCount: 0,
      adjustmentItemCount: 0,
      matchedRecurringItemCount: 0,
      matchedAdjustmentItemCount: 0,
      alreadyImportedItemCount: 0,
      excludedItemCount: 0,
      importedOtherRunCount: 0,
      matchedEarningAmount: 0,
      matchedDeductionAmount: 0,
      matchedInfoCount: 0,
      checkedAt: new Date().toISOString(),
    };

    for (const employee of employees) {
      const items = [...employee.recurringItems, ...employee.adjustmentItems];
      summary.recurringItemCount += employee.recurringItems.length;
      summary.adjustmentItemCount += employee.adjustmentItems.length;
      summary.alreadyImportedItemCount += employee.totals.alreadyImportedCount;
      summary.excludedItemCount += employee.totals.excludedCount;
      summary.importedOtherRunCount += employee.totals.importedOtherRunCount;
      summary.matchedEarningAmount += this.toNumber(employee.totals.matchedEarningAmount);
      summary.matchedDeductionAmount += this.toNumber(employee.totals.matchedDeductionAmount);
      summary.matchedInfoCount += employee.totals.matchedInfoCount;

      for (const item of items) {
        if (item.matchStatus !== 'MATCHED') continue;
        if (item.category === 'RECURRING') summary.matchedRecurringItemCount += 1;
        if (item.category === 'ADJUSTMENT') summary.matchedAdjustmentItemCount += 1;
      }
    }

    return {
      ...summary,
      matchedEarningAmount: this.toMoneyString(summary.matchedEarningAmount),
      matchedDeductionAmount: this.toMoneyString(summary.matchedDeductionAmount),
    };
  }

  private matchStatusLabel(status: PayrollSourcePreviewStatus) {
    if (status === 'MATCHED') return 'พร้อมเข้า Payroll';
    if (status === 'ALREADY_IMPORTED') return 'อยู่ใน Payroll Run นี้แล้ว';
    if (status === 'IMPORTED_OTHER_RUN') return 'ถูกนำเข้า Run อื่นแล้ว';
    return 'ไม่เข้า Payroll';
  }

  private toNumber(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private toMoney(value: unknown) {
    return Math.round(this.toNumber(value) * 100) / 100;
  }

  private toMoneyString(value: unknown, decimals = 2) {
    return this.toNumber(value).toFixed(decimals);
  }

  private toIsoDate(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
