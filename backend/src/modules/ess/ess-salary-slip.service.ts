import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  generatePayslipPdf,
  type PayslipPaperLayout,
  type PayslipPdfResult,
} from '../payroll/payroll-payslip-pdf.util';

import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EssSalarySlipQueryDto } from './dto/ess-salary-slip-query.dto';
import { PayrollTaxReportService } from '../payroll/services/payroll-tax-report.service';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

type PublishedPayrollRun = {
  id: string;
  payslipDetailsVisible: boolean;
};

function toPageMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

function toNumeric(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function toMoney(value: unknown): number {
  return Math.round(toNumeric(value) * 100) / 100;
}

function moneyEquals(left: unknown, right: unknown): boolean {
  return toMoney(left) === toMoney(right);
}

function isGenericOtherAllowanceLabel(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/g, '').toLowerCase();

  return (
    normalized === 'รายได้อื่นๆ' ||
    normalized === 'รายได้อื่นฯ' ||
    normalized === 'รายได้อื่น' ||
    normalized === 'เงินเพิ่มอื่นๆ' ||
    normalized === 'เงินเพิ่มอื่นฯ' ||
    normalized === 'เงินเพิ่มอื่น' ||
    normalized === 'other_earning' ||
    normalized === 'otherearning' ||
    normalized === 'otherearnings' ||
    normalized === 'other_allowance' ||
    normalized === 'otherallowance' ||
    normalized === 'otherincome'
  );
}

function isGenericOtherEarningLine(line: any) {
  return (
    line?.type === 'EARNING' &&
    (line?.code === 'OTHER_EARNING' || isGenericOtherAllowanceLabel(line?.name)) &&
    isGenericOtherAllowanceLabel(line?.name)
  );
}

type SalarySlipPeriodOption = {
  runId: string;
  periodId: string;
  periodCode: string;
  periodName: string;
  runNo: string;
  status: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  paymentDate: Date | string | null;
  totalEarnings: number;
  totalDeductions: number;
  totalNetPay: number;
};

@Injectable()
export class EssSalarySlipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollTaxReportService: PayrollTaxReportService,
  ) {}

  async generateMySalarySlipPdf(
    currentUser: CurrentUserLike,
    itemId: string,
    layout: PayslipPaperLayout = 'FULL',
  ): Promise<PayslipPdfResult> {
    const payslip = await this.getMySalarySlip(currentUser, itemId);

    return generatePayslipPdf(payslip, layout);
  }

  private async getPublishedPayrollRuns(): Promise<PublishedPayrollRun[]> {
    return this.prisma.$queryRaw<PublishedPayrollRun[]>`
      SELECT
        "id",
        "payslipDetailsVisible"
      FROM payroll_runs
      WHERE "deletedAt" IS NULL
        AND "status" IN ('APPROVED', 'PAID')
        AND "payslipsPublishedAt" IS NOT NULL
        AND "payslipDetailsVisible" = TRUE
    `;
  }

  private toPayslipDetailVisibilityMap(runs: PublishedPayrollRun[]) {
    return new Map(runs.map((run) => [run.id, run.payslipDetailsVisible]));
  }

  private applyPayslipDetailVisibility<T extends {
    runId: string;
    lines?: unknown[];
    run?: Record<string, unknown> | null;
  }>(item: T, visibilityByRunId: Map<string, boolean>) {
    const payslipDetailsVisible = visibilityByRunId.get(item.runId) ?? true;

    return {
      ...item,
      payslipDetailsVisible,
      run: item.run
        ? {
            ...item.run,
            payslipDetailsVisible,
          }
        : item.run,
      lines: payslipDetailsVisible ? item.lines ?? [] : [],
    };
  }

  private async getPayrollItemPayslipVisibility(itemId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      payslipsPublishedAt: Date | null;
      payslipDetailsVisible: boolean;
    }>>`
      SELECT
        r."payslipsPublishedAt",
        r."payslipDetailsVisible"
      FROM payroll_items i
      INNER JOIN payroll_runs r ON r."id" = i."runId"
      WHERE i."id" = ${itemId}
        AND r."deletedAt" IS NULL
      LIMIT 1
    `;

    if (!rows[0]?.payslipsPublishedAt || !rows[0].payslipDetailsVisible) {
      throw new NotFoundException('ยังไม่พบสลิปเงินเดือนที่เผยแพร่ให้คุณดู');
    }

    return rows[0].payslipDetailsVisible;
  }

  private async buildSalarySlipPeriodOptions(
    where: Prisma.PayrollItemWhereInput,
  ): Promise<SalarySlipPeriodOption[]> {
    const items = await this.prisma.payrollItem.findMany({
      where,
      orderBy: [
        {
          run: {
            period: {
              paymentDate: 'desc',
            },
          },
        },
        { createdAt: 'desc' },
      ],
      select: {
        totalEarnings: true,
        totalDeductions: true,
        totalNetPay: true,
        run: {
          select: {
            id: true,
            runNo: true,
            status: true,
            period: {
              select: {
                id: true,
                code: true,
                name: true,
                startDate: true,
                endDate: true,
                paymentDate: true,
              },
            },
          },
        },
      },
    });

    return items.map((item) => ({
      runId: item.run.id,
      periodId: item.run.period.id,
      periodCode: item.run.period.code,
      periodName: item.run.period.name,
      runNo: item.run.runNo,
      status: item.run.status,
      startDate: item.run.period.startDate,
      endDate: item.run.period.endDate,
      paymentDate: item.run.period.paymentDate,
      totalEarnings: toNumeric(item.totalEarnings),
      totalDeductions: toNumeric(item.totalDeductions),
      totalNetPay: toNumeric(item.totalNetPay),
    }));
  }

  private async buildSalarySlipSummary(where: Prisma.PayrollItemWhereInput) {
    const [aggregate, ready, paid, latest] = await this.prisma.$transaction([
      this.prisma.payrollItem.aggregate({
        where,
        _sum: {
          totalGrossPay: true,
          totalEarnings: true,
          totalDeductions: true,
          totalNetPay: true,
        },
        _count: { _all: true },
      }),
      this.prisma.payrollItem.count({
        where: {
          AND: [where, { run: { status: 'APPROVED' } }],
        },
      }),
      this.prisma.payrollItem.count({
        where: {
          AND: [where, { run: { status: 'PAID' } }],
        },
      }),
      this.prisma.payrollItem.findFirst({
        where,
        orderBy: [
          {
            run: {
              period: {
                paymentDate: 'desc',
              },
            },
          },
          { createdAt: 'desc' },
        ],
        select: {
          totalNetPay: true,
          run: {
            select: {
              period: {
                select: {
                  name: true,
                  paymentDate: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      total: toNumeric(aggregate._count?._all),
      ready,
      paid,
      totalGrossPay: toNumeric(aggregate._sum.totalGrossPay),
      totalEarnings: toNumeric(aggregate._sum.totalEarnings),
      totalDeductions: toNumeric(aggregate._sum.totalDeductions),
      totalNetPay: toNumeric(aggregate._sum.totalNetPay),
      latestNetPay: toNumeric(latest?.totalNetPay),
      latestPeriodName: latest?.run?.period?.name ?? null,
      latestPaymentDate: latest?.run?.period?.paymentDate?.toISOString?.() ?? null,
    };
  }

  private mapSalarySlipStatusFilter(status?: string) {
    if (status === 'READY') return 'APPROVED';
    if (status === 'PAID') return 'PAID';
    return null;
  }

  async findMySalarySlips(
    currentUser: CurrentUserLike,
    query: EssSalarySlipQueryDto,
  ) {
    const actorId = this.getActorId(currentUser);

    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const publishedRuns = await this.getPublishedPayrollRuns();
    const publishedRunIds = publishedRuns.map((run) => run.id);
    const payslipDetailVisibilityByRunId = this.toPayslipDetailVisibilityMap(publishedRuns);

    const emptySummary = {
      total: 0,
      ready: 0,
      paid: 0,
      totalGrossPay: 0,
      totalEarnings: 0,
      totalDeductions: 0,
      totalNetPay: 0,
      latestNetPay: 0,
      latestPeriodName: null,
      latestPaymentDate: null,
      periods: [] as SalarySlipPeriodOption[],
      selectedRunId: null as string | null,
    };

    if (publishedRunIds.length === 0) {
      return {
        data: [],
        meta: toPageMeta(page, pageSize, 0),
        summary: emptySummary,
      };
    }

    const baseWhere: Prisma.PayrollItemWhereInput = {
      runId: {
        in: publishedRunIds,
      },
      employee: {
        userId: actorId,
        deletedAt: null,
      },
      run: {
        deletedAt: null,
        status: {
          in: ['APPROVED', 'PAID'],
        },
      },
    };

    const statusFilter = this.mapSalarySlipStatusFilter(query.status);

    if (statusFilter) {
      baseWhere.AND = [
        ...(Array.isArray(baseWhere.AND)
          ? baseWhere.AND
          : baseWhere.AND
            ? [baseWhere.AND]
            : []),
        { run: { status: statusFilter } },
      ];
    }

    const periods = await this.buildSalarySlipPeriodOptions(baseWhere);
    const selectedRunId =
      query.runId && periods.some((period) => period.runId === query.runId)
        ? query.runId
        : periods[0]?.runId ?? null;

    if (!selectedRunId) {
      return {
        data: [],
        meta: toPageMeta(page, pageSize, 0),
        summary: {
          ...emptySummary,
          periods,
        },
      };
    }

    const where: Prisma.PayrollItemWhereInput = {
      AND: [baseWhere, { runId: selectedRunId }],
    };

    if (query.q?.trim()) {
      const q = query.q.trim();

      where.OR = [
        {
          run: {
            runNo: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },
        {
          run: {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },
        {
          run: {
            period: {
              code: {
                contains: q,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          run: {
            period: {
              name: {
                contains: q,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollItem.findMany({
        where,
        orderBy: [
          {
            run: {
              period: {
                paymentDate: 'desc',
              },
            },
          },
          {
            createdAt: 'desc',
          },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.getSalarySlipInclude(),
      }),
      this.prisma.payrollItem.count({ where }),
    ]);
    const summary = await this.buildSalarySlipSummary(where);

    const visibleItems = data.map((item) =>
      this.applyPayslipDetailVisibility(item, payslipDetailVisibilityByRunId),
    );
    const displayItems = await Promise.all(
      visibleItems.map((item) => this.expandLegacyOtherAllowanceLinesForDisplay(item)),
    );

    return {
      data: displayItems,
      meta: toPageMeta(page, pageSize, total),
      summary: {
        ...summary,
        periods,
        selectedRunId,
      },
    };
  }

  async getMySalarySlip(currentUser: CurrentUserLike, itemId: string) {
    const actorId = this.getActorId(currentUser);

    const item = await this.prisma.payrollItem.findFirst({
      where: {
        id: itemId,
        employee: {
          userId: actorId,
          deletedAt: null,
        },
        run: {
          deletedAt: null,
          status: {
            in: ['APPROVED', 'PAID'],
          },
        },
      },
      include: this.getSalarySlipInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบสลิปเงินเดือนของคุณ');
    }

    const payslipDetailsVisible = await this.getPayrollItemPayslipVisibility(itemId);

    const visibleItem = this.applyPayslipDetailVisibility(
      item,
      new Map([[item.runId, payslipDetailsVisible]]),
    );

    return this.expandLegacyOtherAllowanceLinesForDisplay(visibleItem);
  }

  /**
   * แสดงผล legacy OTHER_EARNING ให้แยกเป็นชื่อรายการจริงเมื่อมีข้อมูลต้นทางรองรับ
   *
   * ไม่แตะยอด PayrollItem / PayrollLine จริงในฐานข้อมูล เพื่อไม่ให้กระทบการคำนวณ
   * จะ replace เฉพาะ response สำหรับ ESS เมื่อเจอ EmployeeCompensationItem ที่:
   * - active ในงวดเดียวกัน
   * - เป็น EARNING
   * - ไม่ใช่ชื่อกว้าง ๆ เช่น รายได้อื่น ๆ
   * - ยังไม่ได้ถูกสร้างเป็น PayrollLine แยกใน run นี้
   * - ยอดรวมตรงกับ OTHER_EARNING พอดี
   */
  private async expandLegacyOtherAllowanceLinesForDisplay<T extends {
    employeeId: string;
    lines?: any[];
    run?: any;
  }>(item: T): Promise<T> {
    const lines = item.lines ?? [];
    const genericOtherAllowanceLines = lines.filter(isGenericOtherEarningLine);

    if (!genericOtherAllowanceLines.length || !item.run?.period || !item.run?.company?.id) {
      return item;
    }

    const representedSourceIds = new Set(
      lines
        .map((line) => line?.sourceId)
        .filter((sourceId): sourceId is string => typeof sourceId === 'string' && sourceId.length > 0),
    );

    const sourceItems = await (this.prisma as any).employeeCompensationItem.findMany({
      where: {
        companyId: item.run.company.id,
        employeeId: item.employeeId,
        deletedAt: null,
        status: 'ACTIVE',
        type: 'EARNING',
        effectiveDate: { lte: item.run.period.endDate },
        OR: [{ endDate: null }, { endDate: { gte: item.run.period.startDate } }],
      },
      orderBy: [
        { sortOrder: 'asc' },
        { effectiveDate: 'asc' },
        { code: 'asc' },
      ],
    });

    const candidateItems = sourceItems.filter((sourceItem: any) => {
      return (
        toMoney(sourceItem.amount) > 0 &&
        !representedSourceIds.has(sourceItem.id) &&
        !isGenericOtherAllowanceLabel(sourceItem.name || sourceItem.code)
      );
    });

    if (!candidateItems.length) {
      return item;
    }

    const usedSourceIds = new Set<string>();
    const expandedLines: any[] = [];

    for (const line of lines) {
      if (!isGenericOtherEarningLine(line)) {
        expandedLines.push(line);
        continue;
      }

      const availableCandidates = candidateItems.filter(
        (sourceItem: any) => !usedSourceIds.has(sourceItem.id),
      );
      const candidateTotal = availableCandidates.reduce(
        (sum: number, sourceItem: any) => sum + toMoney(sourceItem.amount),
        0,
      );

      if (!availableCandidates.length || !moneyEquals(candidateTotal, line.amount)) {
        expandedLines.push(line);
        continue;
      }

      for (const [index, sourceItem] of availableCandidates.entries()) {
        usedSourceIds.add(sourceItem.id);
        expandedLines.push({
          ...line,
          id: `${line.id}:split:${sourceItem.id}`,
          componentId: sourceItem.componentId ?? line.componentId ?? null,
          code: sourceItem.code || line.code,
          name: sourceItem.name || line.name,
          sourceType: sourceItem.sourceType || line.sourceType,
          sourceId: sourceItem.id,
          quantity: sourceItem.quantity ?? 1,
          rate: sourceItem.rate ?? sourceItem.amount ?? line.rate,
          amount: sourceItem.amount,
          sortOrder: sourceItem.sortOrder ?? line.sortOrder ?? 90 + index,
          note: null,
        });
      }
    }

    return {
      ...item,
      lines: expandedLines,
    };
  }

  private getSalarySlipInclude() {
    return {
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
              // หัวสลิปของสาขาที่ออกเอกสารในนามตัวเอง (ดู resolvePayslipLetterhead)
              nameEn: true,
              usePayslipHeader: true,
              logoUrl: true,
              taxId: true,
              taxBranchNo: true,
              address: true,
              phone: true,
              email: true,
              payslipNote: true,
            },
          },
        },
      },
      compensation: true,
      run: {
        include: {
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              logoUrl: true,
              // ใช้ทำหัวจดหมายบนสลิป PDF ถ้าไม่ดึงมา หัวเอกสารจะเหลือแค่ชื่อบริษัท
              taxId: true,
              address: true,
              phone: true,
              email: true,
            },
          },
          period: true,
        },
      },
      lines: {
        orderBy: [
          {
            sortOrder: 'asc',
          },
          {
            code: 'asc',
          },
        ],
        include: {
          component: true,
        },
      },
    } satisfies Prisma.PayrollItemInclude;
  }

  /**
   * หนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) ของตัวเอง
   *
   * ระบบมีข้อมูลนี้อยู่แล้วฝั่ง HR แต่พนักงานขอเองไม่ได้ ต้องเดินไปขอบัญชีทุกปี
   * ช่วงยื่นภาษี — เปิดให้ดึงเองโดยบังคับ employeeId เป็นของตัวเองเสมอ
   * และล็อก scope ที่บริษัทของพนักงาน ผู้ใช้ปลอม query ข้ามคนไม่ได้
   */
  async getMyWithholdingCertificate(
    currentUser: CurrentUserLike,
    year?: number,
  ) {
    const employee = await this.resolveMyTaxEmployee(currentUser);

    return this.payrollTaxReportService.getWithholdingCertificate(
      employee.id,
      { year } as never,
      // scope ภายใน: ล็อกที่บริษัทของพนักงานคนนี้ ไม่ใช้ scope ของ session
      { level: 'COMPANY', companyId: employee.companyId, branchId: null },
    );
  }

  /** ปีที่พนักงานคนปัจจุบันมีข้อมูลภาษีจริง — ไม่คืนปีของคนอื่นในบริษัท */
  async getMyWithholdingCertificateYears(currentUser: CurrentUserLike) {
    const employee = await this.resolveMyTaxEmployee(currentUser);
    const rows = await (this.prisma as any).payrollTaxCalculation.findMany({
      where: {
        employeeId: employee.id,
        companyId: employee.companyId,
        payrollRun: {
          deletedAt: null,
          status: { in: ['CALCULATED', 'REVIEWED', 'APPROVED', 'PAID'] },
        },
      },
      select: {
        payrollRun: {
          select: {
            period: { select: { year: true } },
          },
        },
      },
      orderBy: {
        payrollRun: { period: { year: 'desc' } },
      },
    });

    const years = Array.from(
      new Set<number>(
        rows
          .map((row: any) => Number(row.payrollRun?.period?.year))
          .filter((year: number) => Number.isInteger(year) && year >= 2000),
      ),
    ).sort((left, right) => right - left);

    return { years };
  }

  /** export 50 ทวิของตัวเอง โดย reuse PayrollTaxReportService เดิมทั้งหมด */
  async buildMyWithholdingCertificateCsv(
    currentUser: CurrentUserLike,
    year?: number,
  ) {
    const employee = await this.resolveMyTaxEmployee(currentUser);

    return this.payrollTaxReportService.buildWithholdingCertificateCsv(
      employee.id,
      { year } as never,
      { level: 'COMPANY', companyId: employee.companyId, branchId: null },
    );
  }

  private async resolveMyTaxEmployee(currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
      },
      select: { id: true, companyId: true, branchId: true },
    });

    if (!employee) {
      throw new NotFoundException(
        'บัญชีผู้ใช้นี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่มีข้อมูลภาษีให้แสดง',
      );
    }

    return employee;
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    }

    return actorId;
  }
}