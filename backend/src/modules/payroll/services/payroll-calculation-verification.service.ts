import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

type PayrollCalculationSourceCategory = 'RECURRING' | 'ADJUSTMENT';
type PayrollCalculationSourceStatus = 'CREATED' | 'MISSING' | 'DUPLICATED' | 'AMOUNT_MISMATCH';

type SourceLineIndex = Map<
  string,
  Array<{
    lineId: string;
    payrollItemId: string;
    code: string;
    name: string;
    type: string;
    amount: string;
  }>
>;

/**
 * PayrollCalculationVerificationService
 * ------------------------------------
 * ตรวจหลังคำนวณว่า source ที่ควรเข้า Payroll Run ถูกสร้างเป็น PayrollLine จริง
 * หรือไม่ เพื่อไม่ให้เกิดกรณี Preview/Dry Run เห็นรายการ แต่ Calculate แล้วรายการหายเงียบ ๆ
 */
@Injectable()
export class PayrollCalculationVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyRunSources(runId: string) {
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
                code: true,
                name: true,
                type: true,
                sourceId: true,
                amount: true,
              },
              orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
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

    const employeeIds = run.items.map((item) => item.employeeId).filter(Boolean);
    const sourceLineIndex = this.buildSourceLineIndex(run.items);

    const recurringItems = employeeIds.length
      ? await (this.prisma as any).employeeCompensationItem.findMany({
          where: {
            companyId: run.companyId,
            employeeId: { in: employeeIds },
            status: 'ACTIVE',
            deletedAt: null,
            effectiveDate: { lte: run.period.endDate },
            OR: [
              { endDate: null },
              { endDate: { gte: run.period.startDate } },
            ],
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
              {
                status: 'APPROVED',
                OR: [
                  { periodId: run.periodId },
                  {
                    periodId: null,
                    effectiveDate: {
                      gte: run.period.startDate,
                      lte: run.period.endDate,
                    },
                  },
                ],
              },
              {
                status: 'IMPORTED',
                payrollRunId: run.id,
              },
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

    const recurringByEmployee = this.groupByEmployee(
      recurringItems.filter((item: any) => this.shouldExpectSourceLine(item)),
    );
    const adjustmentsByEmployee = this.groupByEmployee(
      adjustments.filter((item: any) => this.shouldExpectSourceLine(item)),
    );

    const employeeResults = run.items.map((item) => {
      const recurringSources = (recurringByEmployee.get(item.employeeId) ?? []).map(
        (source: any) => this.toVerificationSource('RECURRING', source, sourceLineIndex),
      );
      const adjustmentSources = (adjustmentsByEmployee.get(item.employeeId) ?? []).map(
        (source: any) => this.toVerificationSource('ADJUSTMENT', source, sourceLineIndex),
      );
      const allSources = [...recurringSources, ...adjustmentSources];
      const missingSources = allSources.filter((source) => source.status === 'MISSING');
      const duplicateSources = allSources.filter((source) => source.status === 'DUPLICATED');
      const amountMismatchSources = allSources.filter((source) => source.status === 'AMOUNT_MISMATCH');

      return {
        employee: item.employee,
        payrollItemId: item.id,
        totals: {
          expectedSourceCount: allSources.length,
          createdSourceCount: allSources.filter((source) => source.status === 'CREATED').length,
          missingSourceCount: missingSources.length,
          duplicateSourceCount: duplicateSources.length,
          amountMismatchCount: amountMismatchSources.length,
          expectedEarningAmount: this.toMoneyString(
            allSources
              .filter((source) => source.type === 'EARNING')
              .reduce((sum, source) => sum + this.toNumber(source.amount), 0),
          ),
          expectedDeductionAmount: this.toMoneyString(
            allSources
              .filter((source) => source.type === 'DEDUCTION')
              .reduce((sum, source) => sum + this.toNumber(source.amount), 0),
          ),
        },
        recurringSources,
        adjustmentSources,
        missingSources,
        duplicateSources,
        amountMismatchSources,
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
      summary: this.buildSummary(employeeResults),
      employees: employeeResults,
    };
  }

  private buildSourceLineIndex(items: Array<{ id: string; lines: any[] }>): SourceLineIndex {
    const index: SourceLineIndex = new Map();

    for (const item of items) {
      for (const line of item.lines ?? []) {
        if (!line.sourceId) continue;
        const current = index.get(line.sourceId) ?? [];
        current.push({
          lineId: line.id,
          payrollItemId: item.id,
          code: line.code,
          name: line.name,
          type: line.type,
          amount: this.toMoneyString(line.amount),
        });
        index.set(line.sourceId, current);
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

  private shouldExpectSourceLine(item: any) {
    const amount = this.toNumber(item.amount);
    return item.type === 'INFO' || amount > 0;
  }

  private toVerificationSource(
    category: PayrollCalculationSourceCategory,
    item: any,
    sourceLineIndex: SourceLineIndex,
  ) {
    const lines = sourceLineIndex.get(item.id) ?? [];
    const expectedAmount = this.toNumber(item.amount);
    const actualAmount = lines.length === 1 ? this.toNumber(lines[0].amount) : null;
    const status: PayrollCalculationSourceStatus = !lines.length
      ? 'MISSING'
      : lines.length > 1
        ? 'DUPLICATED'
        : Math.abs((actualAmount ?? 0) - expectedAmount) > 0.01
          ? 'AMOUNT_MISMATCH'
          : 'CREATED';

    const reason =
      status === 'MISSING'
        ? 'Source พร้อมเข้า Payroll แต่ไม่พบ PayrollLine หลังคำนวณ'
        : status === 'DUPLICATED'
          ? 'พบ PayrollLine มากกว่า 1 บรรทัดจาก source เดียวกัน'
          : status === 'AMOUNT_MISMATCH'
            ? `ยอด PayrollLine ${this.toMoneyString(actualAmount)} ไม่ตรงกับ source ${this.toMoneyString(expectedAmount)}`
            : 'สร้าง PayrollLine จาก source นี้แล้ว';

    return {
      id: item.id,
      category,
      code: item.code,
      name: item.name,
      type: item.type,
      sourceType: item.sourceType,
      amount: this.toMoneyString(item.amount),
      actualAmount: actualAmount == null ? null : this.toMoneyString(actualAmount),
      status,
      statusLabel: this.statusLabel(status),
      reason,
      lineId: lines[0]?.lineId ?? null,
      payrollItemId: lines[0]?.payrollItemId ?? null,
      lineCount: lines.length,
      lines,
    };
  }

  private buildSummary(employees: any[]) {
    const summary = {
      employeeCount: employees.length,
      expectedSourceCount: 0,
      createdSourceCount: 0,
      missingSourceCount: 0,
      duplicateSourceCount: 0,
      amountMismatchCount: 0,
      expectedRecurringCount: 0,
      expectedAdjustmentCount: 0,
      missingRecurringCount: 0,
      missingAdjustmentCount: 0,
      expectedEarningAmount: 0,
      expectedDeductionAmount: 0,
      checkedAt: new Date().toISOString(),
    };

    for (const employee of employees) {
      const sources = [...employee.recurringSources, ...employee.adjustmentSources];
      summary.expectedSourceCount += sources.length;
      summary.createdSourceCount += sources.filter((source: any) => source.status === 'CREATED').length;
      summary.missingSourceCount += sources.filter((source: any) => source.status === 'MISSING').length;
      summary.duplicateSourceCount += sources.filter((source: any) => source.status === 'DUPLICATED').length;
      summary.amountMismatchCount += sources.filter((source: any) => source.status === 'AMOUNT_MISMATCH').length;
      summary.expectedRecurringCount += employee.recurringSources.length;
      summary.expectedAdjustmentCount += employee.adjustmentSources.length;
      summary.missingRecurringCount += employee.recurringSources.filter((source: any) => source.status === 'MISSING').length;
      summary.missingAdjustmentCount += employee.adjustmentSources.filter((source: any) => source.status === 'MISSING').length;
      summary.expectedEarningAmount += this.toNumber(employee.totals.expectedEarningAmount);
      summary.expectedDeductionAmount += this.toNumber(employee.totals.expectedDeductionAmount);
    }

    return {
      ...summary,
      isComplete:
        summary.missingSourceCount === 0 &&
        summary.duplicateSourceCount === 0 &&
        summary.amountMismatchCount === 0,
      expectedEarningAmount: this.toMoneyString(summary.expectedEarningAmount),
      expectedDeductionAmount: this.toMoneyString(summary.expectedDeductionAmount),
    };
  }

  private statusLabel(status: PayrollCalculationSourceStatus) {
    if (status === 'CREATED') return 'สร้าง PayrollLine แล้ว';
    if (status === 'DUPLICATED') return 'PayrollLine ซ้ำ';
    if (status === 'AMOUNT_MISMATCH') return 'ยอดไม่ตรง';
    return 'ยังไม่สร้าง PayrollLine';
  }

  private toNumber(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private toMoneyString(value: unknown) {
    return this.toNumber(value).toFixed(2);
  }
}
