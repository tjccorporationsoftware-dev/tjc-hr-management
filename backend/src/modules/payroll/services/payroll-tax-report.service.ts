import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { effectiveCompanyId } from '../../../common/tenant/tenant-scope.util';
import { PayrollTaxReportQueryDto } from '../dto/payroll-tax.dto';
import { buildPnd1Form } from '../utils/payroll-pnd1-form.util';
import { buildPnd1FilingFile } from '../utils/payroll-pnd1-filing.util';
import { generatePnd1FormPdf } from '../payroll-pnd1-form-pdf.util';
import { generatePnd1FormXlsx } from '../payroll-pnd1-form-xlsx.util';
import { buildPnd1aForm } from '../utils/payroll-pnd1a-form.util';
import {
  buildPnd1TableCsv,
  buildPnd1aTableCsv,
} from '../utils/payroll-pnd-csv.util';
import { generatePnd1aSummaryPdf } from '../payroll-pnd1a-summary-pdf.util';
import { generatePnd1aAttachmentPdf } from '../payroll-pnd1a-attachment-pdf.util';
import { generatePnd1aCertificatePdf } from '../payroll-pnd1a-certificate-pdf.util';

function numberValue(value: unknown, fallback = 0) {
  const amount = Number(value ?? fallback);
  return Number.isFinite(amount) ? amount : fallback;
}

function money(value: unknown) {
  return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
}

function moneyText(value: unknown) {
  return money(value).toFixed(2);
}

function percentText(value: unknown) {
  return `${money(numberValue(value) * 100).toFixed(2)}%`;
}

function dateOnly(value: unknown) {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function employeeName(employee: any) {
  if (!employee) return '-';
  return (
    employee.displayName ||
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(' ') ||
    employee.employeeCode ||
    '-'
  );
}

function employeeAddress(employee: any) {
  return (
    employee?.profile?.registeredAddress ||
    employee?.profile?.currentAddress ||
    '-'
  );
}

function companyName(company: any) {
  return company?.nameTh || company?.nameEn || company?.code || '-';
}

function payrollRunName(run: any) {
  return run?.name || run?.runNo || '-';
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[,"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  return `\ufeff${lines.join('\n')}`;
}

function safeFilePart(value: unknown, fallback: string) {
  const text = String(value ?? fallback).trim();
  return (text || fallback).replace(/[^0-9A-Za-z._-]+/g, '-');
}

function monthRange(year?: number, month?: number) {
  const paymentYear = normalizePaymentYear(year);
  if (!paymentYear || !month || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(paymentYear, month - 1, 1));
  const end = new Date(Date.UTC(paymentYear, month, 1));
  return { gte: start, lt: end };
}

function monthText(month?: number | null) {
  if (!month) return null;
  return `${String(month).padStart(2, '0')}`;
}

function buildCertificateNo(
  taxYear: number | null | undefined,
  employeeCode: string | null | undefined,
) {
  return `50TW-${taxYear || 'YEAR'}-${safeFilePart(employeeCode, 'EMP')}`;
}

function normalizePaymentYear(year?: number | null) {
  if (!year) return null;
  return year >= 2400 ? year - 543 : year;
}

const TAX_REPORT_RUN_STATUSES = ['CALCULATED', 'REVIEWED', 'APPROVED', 'PAID'];
const TAX_FILING_RUN_STATUSES = ['APPROVED', 'PAID'];

type CalculationRowOptions = {
  filingOnly?: boolean;
};

@Injectable()
export class PayrollTaxReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * บังคับ companyId ของทุกรายงานให้อยู่ในขอบเขตของผู้เรียก
   *
   * รายงานภาษีทั้งชุด (รายเดือน/รายปี/ภ.ง.ด.1/ภ.ง.ด.1ก/50 ทวิ) อ่านจาก
   * PayrollTaxCalculation ซึ่งมี companyId ตรง ๆ ถ้าเชื่อ companyId จาก query
   * string ล้วน ๆ ผู้ใช้ระดับบริษัทจะดึงแบบยื่นภาษีของอีกบริษัทได้ทั้งชุด
   * รวมถึงเลขผู้เสียภาษีและที่อยู่ของพนักงานทุกคน
   */
  private scopedQuery<T extends PayrollTaxReportQueryDto>(
    query: T,
    scope: TenantScope,
  ): T {
    return { ...query, companyId: effectiveCompanyId(scope, query.companyId) };
  }

  async getMonthlyReport(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    const scoped = this.scopedQuery(query, scope);
    const rows = await this.findCalculationRows(scoped);
    const mappedRows = rows.map((calculation: any) =>
      this.toMonthlyRow(calculation),
    );
    const summary = this.summarizeRows(mappedRows);

    return {
      summary: {
        ...summary,
        reportType: 'MONTHLY',
        companyId: scoped.companyId ?? null,
        taxYearId: scoped.taxYearId ?? null,
        payrollRunId: scoped.payrollRunId ?? null,
        month: scoped.month ? Number(scoped.month) : null,
        year: scoped.year ? Number(scoped.year) : null,
      },
      data: mappedRows,
    };
  }

  async getAnnualReport(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
    options: CalculationRowOptions = {},
  ) {
    const scoped = this.scopedQuery(query, scope);
    const rows = await this.findCalculationRows(scoped, options);
    const employeeMap = new Map<string, any>();

    for (const calculation of rows as any[]) {
      const key = `${calculation.companyId}:${calculation.taxYearId}:${calculation.employeeId}`;
      const current = employeeMap.get(key) ?? {
        companyId: calculation.companyId,
        companyCode: calculation.company?.code ?? '-',
        companyName: companyName(calculation.company),
        companyTaxId: calculation.company?.taxId ?? null,
        companyAddress: calculation.company?.address ?? null,
        employeeId: calculation.employeeId,
        employeeCode: calculation.employee?.employeeCode ?? '-',
        employeeName: employeeName(calculation.employee),
        /* แบบ ภ.ง.ด.1ก และ 50 ทวิ มีช่องชื่อกับชื่อสกุลแยกกัน เหมือน ภ.ง.ด.1 */
        employeeTitle: calculation.employee?.title ?? null,
        employeeFirstName: calculation.employee?.firstName ?? null,
        employeeLastName: calculation.employee?.lastName ?? null,
        employeeNationalId: calculation.employee?.profile?.nationalId ?? null,
        employeeAddress: employeeAddress(calculation.employee),
        branchCode: calculation.employee?.branch?.code ?? '00000',
        branchName: calculation.employee?.branch?.nameTh ?? null,
        departmentName:
          calculation.employee?.department?.nameTh ??
          calculation.employee?.branch?.nameTh ??
          '-',
        taxId:
          calculation.taxProfile?.taxId ??
          calculation.employee?.profile?.taxId ??
          null,
        taxYearId: calculation.taxYearId,
        taxYear: calculation.taxYear?.taxYear ?? null,
        taxYearName: calculation.taxYear?.name ?? null,
        payrollRunCount: 0,
        totalTaxableIncome: 0,
        totalExpenseDeduction: 0,
        totalAllowance: 0,
        totalNetTaxableIncome: 0,
        totalAnnualTaxEstimate: 0,
        totalTaxWithheld: 0,
        lastPaymentDate: null as string | null,
      };

      current.payrollRunCount += 1;
      current.totalTaxableIncome += numberValue(
        calculation.taxableIncomeCurrentRun,
      );
      current.totalExpenseDeduction += numberValue(
        calculation.expenseDeduction,
      );
      current.totalAllowance += numberValue(calculation.allowanceTotal);
      current.totalNetTaxableIncome = Math.max(
        current.totalNetTaxableIncome,
        numberValue(calculation.netTaxableIncome),
      );
      current.totalAnnualTaxEstimate = Math.max(
        current.totalAnnualTaxEstimate,
        numberValue(calculation.annualTax),
      );
      current.totalTaxWithheld += numberValue(calculation.currentRunTax);
      const paymentDate = dateOnly(calculation.payrollRun?.period?.paymentDate);
      if (
        paymentDate &&
        (!current.lastPaymentDate || paymentDate > current.lastPaymentDate)
      ) {
        current.lastPaymentDate = paymentDate;
      }

      employeeMap.set(key, current);
    }

    const data = Array.from(employeeMap.values()).map((row) => ({
      ...row,
      totalTaxableIncome: moneyText(row.totalTaxableIncome),
      totalExpenseDeduction: moneyText(row.totalExpenseDeduction),
      totalAllowance: moneyText(row.totalAllowance),
      totalNetTaxableIncome: moneyText(row.totalNetTaxableIncome),
      totalAnnualTaxEstimate: moneyText(row.totalAnnualTaxEstimate),
      totalTaxWithheld: moneyText(row.totalTaxWithheld),
    }));

    const summary = data.reduce(
      (acc, row: any) => {
        acc.employeeCount += 1;
        acc.totalTaxableIncome += numberValue(row.totalTaxableIncome);
        acc.totalTaxWithheld += numberValue(row.totalTaxWithheld);
        return acc;
      },
      { employeeCount: 0, totalTaxableIncome: 0, totalTaxWithheld: 0 },
    );

    return {
      summary: {
        reportType: 'ANNUAL',
        companyId: scoped.companyId ?? null,
        taxYearId: scoped.taxYearId ?? null,
        taxYear: data[0]?.taxYear ?? null,
        employeeCount: summary.employeeCount,
        totalTaxableIncome: moneyText(summary.totalTaxableIncome),
        totalTaxWithheld: moneyText(summary.totalTaxWithheld),
      },
      data,
    };
  }

  async getEmployeeAnnualReport(
    employeeId: string,
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
  ) {
    const annual = await this.getAnnualReport({ ...query, employeeId }, scope);
    const employee = annual.data[0] ?? null;
    const monthly = await this.getMonthlyReport(
      { ...query, employeeId },
      scope,
    );
    return {
      employee,
      summary: annual.summary,
      rows: monthly.data,
    };
  }

  async getPnd1Report(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    const scoped = this.scopedQuery(query, scope);
    const { month, year } = this.assertPnd1MonthYear(scoped);
    const rows = await this.findCalculationRows(
      { ...scoped, month, year },
      { filingOnly: true },
    );
    const monthlyRows = rows.map((calculation: any) =>
      this.toMonthlyRow(calculation),
    );
    const data = monthlyRows.map((row: any, index: number) => ({
      sequence: index + 1,
      formType: 'PND1',
      companyId: row.companyId,
      companyCode: row.companyCode,
      companyName: row.companyName,
      companyTaxId: row.companyTaxId,
      companyAddress: row.companyAddress,
      branchCode: row.branchCode,
      branchName: row.branchName,
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      employeeTitle: row.employeeTitle,
      employeeFirstName: row.employeeFirstName,
      employeeLastName: row.employeeLastName,
      employeeTaxId: row.taxId,
      employeeNationalId: row.employeeNationalId,
      employeeAddress: row.employeeAddress,
      incomeType: '40(1)',
      payrollRunId: row.payrollRunId,
      payrollRunNo: row.payrollRunNo,
      payrollRunName: row.payrollRunName,
      payrollRunStatus: row.payrollRunStatus,
      paymentDate: row.paymentDate,
      taxMonth: month,
      paymentYear: year,
      taxYear: row.taxYear,
      paidAmount: row.taxableIncomeCurrentRun,
      taxWithheldAmount: row.currentRunTax,
      note: row.status === 'CALCULATED' ? null : row.status,
    }));
    const summary = this.summarizePndRows(data);

    return {
      summary: {
        ...summary,
        reportType: 'PND1',
        companyId: scoped.companyId ?? null,
        taxYearId: scoped.taxYearId ?? null,
        month,
        year,
        filingRunStatuses: TAX_FILING_RUN_STATUSES,
      },
      data,
    };
  }

  async getPnd1AReport(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    const scoped = this.scopedQuery(query, scope);
    const annual = await this.getAnnualReport(scoped, scope, {
      filingOnly: true,
    });
    const data = annual.data.map((row: any, index: number) => ({
      sequence: index + 1,
      formType: 'PND1A',
      companyId: row.companyId,
      companyCode: row.companyCode,
      companyName: row.companyName,
      companyTaxId: row.companyTaxId,
      companyAddress: row.companyAddress,
      branchCode: row.branchCode,
      branchName: row.branchName,
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      employeeTitle: row.employeeTitle,
      employeeFirstName: row.employeeFirstName,
      employeeLastName: row.employeeLastName,
      employeeTaxId: row.taxId,
      employeeNationalId: row.employeeNationalId,
      employeeAddress: row.employeeAddress,
      incomeType: '40(1)',
      taxYearId: row.taxYearId,
      taxYear: row.taxYear,
      payrollRunCount: row.payrollRunCount,
      totalPaidAmount: row.totalTaxableIncome,
      totalTaxWithheldAmount: row.totalTaxWithheld,
      lastPaymentDate: row.lastPaymentDate,
      filingRunStatuses: TAX_FILING_RUN_STATUSES,
      certificateNo: buildCertificateNo(row.taxYear, row.employeeCode),
    }));
    const summary = this.summarizePndRows(
      data.map((row: any) => ({
        paidAmount: row.totalPaidAmount,
        taxWithheldAmount: row.totalTaxWithheldAmount,
      })),
    );

    return {
      summary: {
        ...summary,
        reportType: 'PND1A',
        companyId: scoped.companyId ?? null,
        taxYearId: scoped.taxYearId ?? null,
        taxYear: annual.summary.taxYear,
        filingRunStatuses: TAX_FILING_RUN_STATUSES,
      },
      data,
    };
  }

  async getPnd1ADetail(
    employeeId: string,
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const scoped = this.scopedQuery(query, scope);
    const where: Record<string, unknown> = {
      employeeId,
      payrollRun: {
        deletedAt: null,
        status: { in: TAX_FILING_RUN_STATUSES },
      },
    };
    if (scoped.companyId) where.companyId = scoped.companyId;
    if (scoped.taxYearId) where.taxYearId = scoped.taxYearId;

    const rows = await prisma.payrollTaxCalculation.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            taxId: true,
            address: true,
          },
        },
        employee: {
          include: {
            profile: true,
            department: { select: { id: true, code: true, nameTh: true } },
            branch: { select: { id: true, code: true, nameTh: true } },
          },
        },
        taxYear: true,
        taxProfile: {
          include: {
            allowances: {
              where: { deletedAt: null },
              include: { allowanceType: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        payrollRun: { include: { period: true } },
        payrollItem: {
          include: {
            lines: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: [
        { payrollRun: { period: { paymentDate: 'asc' } } },
        { payrollRun: { period: { month: 'asc' } } },
      ],
      take: Math.min(Math.max(Number(query.pageSize ?? 500), 1), 2000),
    });

    if (!rows.length) {
      throw new NotFoundException(
        'ไม่พบรายละเอียด ภ.ง.ด.1ก ของพนักงานสำหรับปีภาษีนี้',
      );
    }

    const first = rows[0];
    const monthlyRows = rows.map((calculation: any) =>
      this.toPnd1ADetailMonthlyRow(calculation),
    );
    const summary = this.summarizePnd1ADetailRows(monthlyRows);
    const taxProfile = first.taxProfile;
    const allowances = (taxProfile?.allowances ?? []).map((allowance: any) => ({
      id: allowance.id,
      code: allowance.allowanceType?.code ?? null,
      name:
        allowance.allowanceType?.nameTh ??
        allowance.allowanceType?.nameEn ??
        '-',
      declaredAmount: moneyText(allowance.declaredAmount),
      note: allowance.note ?? null,
    }));
    const breakdown = this.buildPnd1ADetailBreakdown({
      monthlyRows,
      summary,
      taxYear: first.taxYear,
      allowances,
    });

    return {
      summary: {
        reportType: 'PND1A_DETAIL',
        companyId: first.companyId,
        taxYearId: first.taxYearId,
        employeeId,
        taxYear: first.taxYear?.taxYear ?? null,
        employeeCount: 1,
        ...summary,
        payrollRunCount: monthlyRows.length,
        averageWithholdingRate:
          numberValue(summary.totalPaidAmount) > 0
            ? moneyText(
                (numberValue(summary.totalTaxWithheldAmount) /
                  numberValue(summary.totalPaidAmount)) *
                  100,
              )
            : '0.00',
        filingRunStatuses: TAX_FILING_RUN_STATUSES,
      },
      company: {
        id: first.companyId,
        code: first.company?.code ?? '-',
        name: companyName(first.company),
        taxId: first.company?.taxId ?? null,
        address: first.company?.address ?? null,
      },
      employee: {
        id: first.employeeId,
        code: first.employee?.employeeCode ?? '-',
        name: employeeName(first.employee),
        taxId: taxProfile?.taxId ?? first.employee?.profile?.taxId ?? null,
        address: employeeAddress(first.employee),
        branchCode: first.employee?.branch?.code ?? '00000',
        branchName: first.employee?.branch?.nameTh ?? null,
        departmentName:
          first.employee?.department?.nameTh ??
          first.employee?.branch?.nameTh ??
          '-',
      },
      taxYear: {
        id: first.taxYearId,
        year: first.taxYear?.taxYear ?? null,
        name: first.taxYear?.name ?? null,
        personalExpenseRate: first.taxYear?.personalExpenseRate
          ? String(first.taxYear.personalExpenseRate)
          : null,
        personalExpenseMax: first.taxYear?.personalExpenseMax
          ? moneyText(first.taxYear.personalExpenseMax)
          : null,
        standardPersonalAllowance: first.taxYear?.standardPersonalAllowance
          ? moneyText(first.taxYear.standardPersonalAllowance)
          : null,
        taxAveragingMethod: first.taxYear?.taxAveragingMethod ?? null,
        roundingMethod: first.taxYear?.roundingMethod ?? null,
      },
      taxProfile: taxProfile
        ? {
            id: taxProfile.id,
            taxEnabled: taxProfile.taxEnabled,
            maritalStatus: taxProfile.maritalStatus ?? null,
            spouseHasIncome: taxProfile.spouseHasIncome,
            updatedAt: dateOnly(taxProfile.updatedAt),
          }
        : null,
      allowances,
      breakdown,
      calculationBasis: {
        incomeType: '40(1)',
        incomeDescription:
          'เงินเดือน ค่าจ้าง โบนัส OT และเงินได้จากการจ้างแรงงาน',
        expenseDeductionRule:
          'หักค่าใช้จ่าย 50% ของเงินได้ แต่ไม่เกินเพดานที่กำหนดในปีภาษี',
        personalAllowanceRule:
          'หักค่าลดหย่อนส่วนตัวและค่าลดหย่อนที่อนุมัติในข้อมูลภาษีพนักงาน',
        taxRateRule:
          'คำนวณภาษีจากเงินได้สุทธิด้วยขั้นภาษีของปีภาษี แล้วหักภาษีที่นำส่งสะสม',
        source:
          'ข้อมูลจาก Payroll Run, รายการเงินเดือน, ข้อมูลภาษีพนักงาน และการตั้งค่าปีภาษี',
      },
      monthlyRows,
    };
  }

  async getWithholdingCertificate(
    employeeId: string,
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
  ) {
    const employeeReport = await this.getEmployeeAnnualReport(
      employeeId,
      query,
      scope,
    );
    if (!employeeReport.employee) {
      throw new NotFoundException('ไม่พบข้อมูลภาษีของพนักงานสำหรับปีภาษีนี้');
    }

    const taxYear = employeeReport.employee.taxYear ?? null;
    const employeeCode = employeeReport.employee.employeeCode ?? null;
    const certificateNo = buildCertificateNo(taxYear, employeeCode);

    return {
      certificateType: '50_TAWI_PRINTABLE_DRAFT',
      certificateNo,
      issueDate: dateOnly(new Date()),
      status: 'DRAFT',
      note: 'ข้อมูลนี้เป็นร่างหนังสือรับรอง 50 ทวิสำหรับให้บัญชีตรวจสอบก่อนพิมพ์/ออกเอกสารจริง',
      company: {
        id: employeeReport.employee.companyId,
        code: employeeReport.employee.companyCode,
        name: employeeReport.employee.companyName,
        taxId: employeeReport.employee.companyTaxId,
        address: employeeReport.employee.companyAddress,
      },
      employee: {
        id: employeeReport.employee.employeeId,
        code: employeeReport.employee.employeeCode,
        name: employeeReport.employee.employeeName,
        taxId: employeeReport.employee.taxId,
        address: employeeReport.employee.employeeAddress,
      },
      taxYear: {
        id: employeeReport.employee.taxYearId,
        year: employeeReport.employee.taxYear,
        name: employeeReport.employee.taxYearName,
      },
      incomeType: 'เงินเดือน ค่าจ้าง โบนัส และเงินได้ตามมาตรา 40(1)',
      incomeTypeCode: '40(1)',
      paidAmount: employeeReport.employee.totalTaxableIncome,
      taxWithheldAmount: employeeReport.employee.totalTaxWithheld,
      paymentCount: employeeReport.employee.payrollRunCount,
      lastPaymentDate: employeeReport.employee.lastPaymentDate,
      rows: employeeReport.rows,
    };
  }

  async buildMonthlyCsv(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    const report = await this.getMonthlyReport(query, scope);
    const headers = [
      'บริษัท',
      'รหัสพนักงาน',
      'พนักงาน',
      'เลขผู้เสียภาษี',
      'ปีภาษี',
      'งวดเงินเดือน',
      'วันที่จ่าย',
      'เงินได้ที่ใช้คำนวณ',
      'ค่าลดหย่อนรวม',
      'เงินได้สุทธิ',
      'ภาษีงวดนี้',
      'สถานะ Run',
    ];
    const csv = buildCsv(
      headers,
      report.data.map((row: any) => ({
        บริษัท: row.companyName,
        รหัสพนักงาน: row.employeeCode,
        พนักงาน: row.employeeName,
        เลขผู้เสียภาษี: row.taxId,
        ปีภาษี: row.taxYear,
        งวดเงินเดือน: row.payrollRunName,
        วันที่จ่าย: row.paymentDate,
        เงินได้ที่ใช้คำนวณ: row.taxableIncomeCurrentRun,
        ค่าลดหย่อนรวม: row.allowanceTotal,
        เงินได้สุทธิ: row.netTaxableIncome,
        ภาษีงวดนี้: row.currentRunTax,
        'สถานะ Run': row.payrollRunStatus,
      })),
    );
    return { csv, fileName: `payroll-tax-monthly-${Date.now()}.csv` };
  }

  async buildAnnualCsv(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    const report = await this.getAnnualReport(query, scope);
    const headers = [
      'บริษัท',
      'รหัสพนักงาน',
      'พนักงาน',
      'เลขผู้เสียภาษี',
      'ปีภาษี',
      'จำนวนงวด',
      'เงินได้สะสม',
      'ภาษีหัก ณ ที่จ่ายสะสม',
      'วันที่จ่ายล่าสุด',
    ];
    const csv = buildCsv(
      headers,
      report.data.map((row: any) => ({
        บริษัท: row.companyName,
        รหัสพนักงาน: row.employeeCode,
        พนักงาน: row.employeeName,
        เลขผู้เสียภาษี: row.taxId,
        ปีภาษี: row.taxYear,
        จำนวนงวด: row.payrollRunCount,
        เงินได้สะสม: row.totalTaxableIncome,
        'ภาษีหัก ณ ที่จ่ายสะสม': row.totalTaxWithheld,
        วันที่จ่ายล่าสุด: row.lastPaymentDate,
      })),
    );
    return { csv, fileName: `payroll-tax-annual-${Date.now()}.csv` };
  }

  async buildPnd1Csv(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    const report = await this.getPnd1Report(query, scope);
    const headers = [
      'ลำดับ',
      'ประเภทแบบ',
      'บริษัท',
      'เลขผู้เสียภาษีบริษัท',
      'สาขา',
      'รหัสพนักงาน',
      'พนักงาน',
      'เลขผู้เสียภาษีพนักงาน',
      'ประเภทเงินได้',
      'งวดเงินเดือน',
      'สถานะ Run',
      'วันที่จ่าย',
      'เดือนภาษี',
      'ปีภาษี',
      'เงินได้',
      'ภาษีหัก ณ ที่จ่าย',
      'หมายเหตุ',
    ];
    const csv = buildCsv(
      headers,
      report.data.map((row: any) => ({
        ลำดับ: row.sequence,
        ประเภทแบบ: row.formType,
        บริษัท: row.companyName,
        เลขผู้เสียภาษีบริษัท: row.companyTaxId,
        สาขา: row.branchCode,
        รหัสพนักงาน: row.employeeCode,
        พนักงาน: row.employeeName,
        เลขผู้เสียภาษีพนักงาน: row.employeeTaxId,
        ประเภทเงินได้: row.incomeType,
        งวดเงินเดือน: row.payrollRunName,
        'สถานะ Run': row.payrollRunStatus,
        วันที่จ่าย: row.paymentDate,
        เดือนภาษี: monthText(row.taxMonth),
        ปีภาษี: row.taxYear,
        เงินได้: row.paidAmount,
        'ภาษีหัก ณ ที่จ่าย': row.taxWithheldAmount,
        หมายเหตุ: row.note,
      })),
    );
    return {
      csv,
      fileName: `pnd1-${safeFilePart(report.summary.year, 'year')}-${safeFilePart(monthText(report.summary.month), 'month')}.csv`,
    };
  }

  /**
   * เตรียมข้อมูลแบบ ภ.ง.ด.1 ให้ทั้ง PDF / TXT / XLSX ใช้ร่วมกัน
   *
   * ข้อมูลบริษัทอ่านจากแถวแรกของรายงาน ไม่ยิงถามฐานข้อมูลซ้ำ เพราะรายงานดึงมา
   * ให้แล้วและถ้าไปอ่านใหม่อาจได้คนละบริษัทเมื่อผู้ใช้ไม่ได้ระบุ companyId
   */
  private async buildPnd1FormData(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
  ) {
    const report = await this.getPnd1Report(query, scope);
    const first = (report.data[0] ?? {}) as Record<string, unknown>;

    return buildPnd1Form(report, {
      nameTh: (first.companyName as string) ?? null,
      code: (first.companyCode as string) ?? null,
      taxId: (first.companyTaxId as string) ?? null,
      address: (first.companyAddress as string) ?? null,
    });
  }

  /** แบบพิมพ์ ภ.ง.ด.1 — หน้าปกและใบแนบ พิมพ์ยื่นได้เลย */
  async buildPnd1FormPdf(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    return generatePnd1FormPdf(await this.buildPnd1FormData(query, scope));
  }

  /** ตาราง ภ.ง.ด.1 แบบ Excel ไว้ตรวจก่อนยื่น */
  async buildPnd1FormXlsx(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    return generatePnd1FormXlsx(await this.buildPnd1FormData(query, scope));
  }

  /** ไฟล์นำส่งระบบ e-Filing ของกรมสรรพากร */
  async buildPnd1FilingFile(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
  ) {
    return buildPnd1FilingFile(await this.buildPnd1FormData(query, scope));
  }

  /**
   * เตรียมข้อมูลแบบ ภ.ง.ด.1ก ให้เอกสารทั้งสามใบใช้ร่วมกัน
   *
   * issueDate คือวันที่ออกเอกสารที่ผู้ใช้เลือกในกล่อง "ระบุวันออกเอกสาร"
   * ไม่ส่งมา = ไม่ระบุ เอกสารจะเว้นช่องวันที่ไว้ให้เขียนด้วยมือ
   */
  private async buildPnd1aFormData(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
    issueDate?: string | null,
  ) {
    const report = await this.getPnd1AReport(query, scope);
    const first = (report.data[0] ?? {}) as Record<string, unknown>;

    return buildPnd1aForm(
      report,
      {
        nameTh: (first.companyName as string) ?? null,
        code: (first.companyCode as string) ?? null,
        taxId: (first.companyTaxId as string) ?? null,
        address: (first.companyAddress as string) ?? null,
      },
      issueDate,
    );
  }

  /**
   * ตาราง CSV ของแบบ ภ.ง.ด.1 และ ภ.ง.ด.1ก
   * สร้างจากข้อมูลชุดเดียวกับแบบพิมพ์ ตัวเลขจึงตรงกันเสมอ ใช้ตรวจก่อนยื่น
   */
  async buildPnd1TableCsv(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    return buildPnd1TableCsv(await this.buildPnd1FormData(query, scope));
  }

  async buildPnd1aTableCsv(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
  ) {
    return buildPnd1aTableCsv(await this.buildPnd1aFormData(query, scope));
  }

  /** ใบสรุป ภ.ง.ด.1ก — หน้าปกของแบบยื่นประจำปี */
  async buildPnd1aSummaryPdf(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
    issueDate?: string | null,
  ) {
    return generatePnd1aSummaryPdf(
      await this.buildPnd1aFormData(query, scope, issueDate),
    );
  }

  /** ใบแนบ ภ.ง.ด.1ก — รายชื่อผู้มีเงินได้แผ่นละ 21 คน */
  async buildPnd1aAttachmentPdf(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
    issueDate?: string | null,
  ) {
    return generatePnd1aAttachmentPdf(
      await this.buildPnd1aFormData(query, scope, issueDate),
    );
  }

  /** 50 ทวิ — หนังสือรับรองการหักภาษี หนึ่งหน้าต่อพนักงานหนึ่งคน */
  async buildPnd1aCertificatePdf(
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
    issueDate?: string | null,
  ) {
    return generatePnd1aCertificatePdf(
      await this.buildPnd1aFormData(query, scope, issueDate),
    );
  }

  async buildPnd1ACsv(query: PayrollTaxReportQueryDto, scope: TenantScope) {
    const report = await this.getPnd1AReport(query, scope);
    const headers = [
      'ลำดับ',
      'ประเภทแบบ',
      'บริษัท',
      'เลขผู้เสียภาษีบริษัท',
      'สาขา',
      'รหัสพนักงาน',
      'พนักงาน',
      'เลขผู้เสียภาษีพนักงาน',
      'ประเภทเงินได้',
      'ปีภาษี',
      'จำนวนงวดที่จ่าย',
      'เงินได้สะสม',
      'ภาษีหัก ณ ที่จ่ายสะสม',
      'วันที่จ่ายล่าสุด',
      'เลขที่ 50 ทวิ',
    ];
    const csv = buildCsv(
      headers,
      report.data.map((row: any) => ({
        ลำดับ: row.sequence,
        ประเภทแบบ: row.formType,
        บริษัท: row.companyName,
        เลขผู้เสียภาษีบริษัท: row.companyTaxId,
        สาขา: row.branchCode,
        รหัสพนักงาน: row.employeeCode,
        พนักงาน: row.employeeName,
        เลขผู้เสียภาษีพนักงาน: row.employeeTaxId,
        ประเภทเงินได้: row.incomeType,
        ปีภาษี: row.taxYear,
        จำนวนงวดที่จ่าย: row.payrollRunCount,
        เงินได้สะสม: row.totalPaidAmount,
        'ภาษีหัก ณ ที่จ่ายสะสม': row.totalTaxWithheldAmount,
        วันที่จ่ายล่าสุด: row.lastPaymentDate,
        'เลขที่ 50 ทวิ': row.certificateNo,
      })),
    );
    return {
      csv,
      fileName: `pnd1a-${safeFilePart(report.summary.taxYear, 'year')}.csv`,
    };
  }

  async buildWithholdingCertificateCsv(
    employeeId: string,
    query: PayrollTaxReportQueryDto,
    scope: TenantScope,
  ) {
    const certificate = await this.getWithholdingCertificate(
      employeeId,
      query,
      scope,
    );
    const headers = [
      'เลขที่หนังสือ',
      'วันที่ออก',
      'สถานะ',
      'บริษัทผู้จ่าย',
      'เลขผู้เสียภาษีบริษัท',
      'ที่อยู่บริษัท',
      'รหัสพนักงาน',
      'พนักงานผู้ถูกหักภาษี',
      'เลขผู้เสียภาษีพนักงาน',
      'ที่อยู่พนักงาน',
      'ปีภาษี',
      'ประเภทเงินได้',
      'จำนวนเงินที่จ่าย',
      'ภาษีที่หัก',
      'จำนวนงวด',
      'วันที่จ่ายล่าสุด',
      'หมายเหตุ',
    ];
    const csv = buildCsv(headers, [
      {
        เลขที่หนังสือ: certificate.certificateNo,
        วันที่ออก: certificate.issueDate,
        สถานะ: certificate.status,
        บริษัทผู้จ่าย: certificate.company.name,
        เลขผู้เสียภาษีบริษัท: certificate.company.taxId,
        ที่อยู่บริษัท: certificate.company.address,
        รหัสพนักงาน: certificate.employee.code,
        พนักงานผู้ถูกหักภาษี: certificate.employee.name,
        เลขผู้เสียภาษีพนักงาน: certificate.employee.taxId,
        ที่อยู่พนักงาน: certificate.employee.address,
        ปีภาษี: certificate.taxYear.year,
        ประเภทเงินได้: certificate.incomeType,
        จำนวนเงินที่จ่าย: certificate.paidAmount,
        ภาษีที่หัก: certificate.taxWithheldAmount,
        จำนวนงวด: certificate.paymentCount,
        วันที่จ่ายล่าสุด: certificate.lastPaymentDate,
        หมายเหตุ: certificate.note,
      },
    ]);
    return {
      csv,
      fileName: `50-tawi-${safeFilePart(certificate.taxYear.year, 'year')}-${safeFilePart(certificate.employee.code, 'employee')}.csv`,
    };
  }

  private assertPnd1MonthYear(query: PayrollTaxReportQueryDto) {
    const month = Number(query.month);
    const paymentYear = normalizePaymentYear(Number(query.year));

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException(
        'กรุณาระบุเดือนภาษี (month) สำหรับ ภ.ง.ด.1',
      );
    }

    if (
      paymentYear === null ||
      !Number.isInteger(paymentYear) ||
      paymentYear < 1900
    ) {
      throw new BadRequestException(
        'กรุณาระบุปีที่จ่ายเงิน (year) สำหรับ ภ.ง.ด.1',
      );
    }

    return { month, year: paymentYear };
  }

  private async findCalculationRows(
    query: PayrollTaxReportQueryDto,
    options: CalculationRowOptions = {},
  ) {
    const prisma = this.prisma as any;
    const where: Record<string, unknown> = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.taxYearId) where.taxYearId = query.taxYearId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.payrollRunId) where.payrollRunId = query.payrollRunId;
    if (query.status && query.status !== 'ALL') where.status = query.status;

    const payrollRunWhere: Record<string, unknown> = {
      deletedAt: null,
      status: {
        in: options.filingOnly
          ? TAX_FILING_RUN_STATUSES
          : TAX_REPORT_RUN_STATUSES,
      },
    };
    const paymentRange = monthRange(Number(query.year), Number(query.month));
    if (paymentRange) {
      payrollRunWhere.period = { paymentDate: paymentRange };
    } else if (query.year || query.month) {
      const normalizedYear = normalizePaymentYear(Number(query.year));
      payrollRunWhere.period = {
        ...(normalizedYear ? { year: normalizedYear } : {}),
        ...(query.month ? { month: Number(query.month) } : {}),
      };
    }
    where.payrollRun = payrollRunWhere;

    return prisma.payrollTaxCalculation.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            taxId: true,
            address: true,
          },
        },
        employee: {
          include: {
            profile: true,
            department: { select: { id: true, code: true, nameTh: true } },
            branch: { select: { id: true, code: true, nameTh: true } },
          },
        },
        taxYear: true,
        taxProfile: true,
        payrollRun: { include: { period: true } },
        payrollItem: true,
      },
      orderBy: [
        { payrollRun: { period: { paymentDate: 'asc' } } },
        { employee: { employeeCode: 'asc' } },
      ],
      take: Math.min(Math.max(Number(query.pageSize ?? 500), 1), 2000),
    });
  }

  private toMonthlyRow(calculation: any) {
    return {
      id: calculation.id,
      companyId: calculation.companyId,
      companyCode: calculation.company?.code ?? '-',
      companyName: companyName(calculation.company),
      companyTaxId: calculation.company?.taxId ?? null,
      companyAddress: calculation.company?.address ?? null,
      employeeId: calculation.employeeId,
      employeeCode: calculation.employee?.employeeCode ?? '-',
      employeeName: employeeName(calculation.employee),
      /*
       * แบบ ภ.ง.ด.1 มีช่อง "ชื่อ" กับ "ชื่อสกุล" แยกกัน และไฟล์นำส่งก็แยกสามช่อง
       * (คำนำหน้า/ชื่อ/นามสกุล) จึงส่งชิ้นส่วนไปด้วย ไม่ใช่ให้ปลายทางไปตัดสตริงเอง
       */
      employeeTitle: calculation.employee?.title ?? null,
      employeeFirstName: calculation.employee?.firstName ?? null,
      employeeLastName: calculation.employee?.lastName ?? null,
      /*
       * ผู้มีเงินได้ที่เป็นบุคคลธรรมดาใช้เลขบัตรประชาชนเป็นเลขประจำตัวผู้เสียภาษี
       * ไฟล์ตัวอย่างของระบบเดิมก็ลงเลขบัตร จึงยึดเลขบัตรก่อน แล้วค่อย fallback
       */
      employeeNationalId: calculation.employee?.profile?.nationalId ?? null,
      employeeAddress: employeeAddress(calculation.employee),
      departmentName:
        calculation.employee?.department?.nameTh ??
        calculation.employee?.branch?.nameTh ??
        '-',
      branchCode: calculation.employee?.branch?.code ?? '00000',
      branchName: calculation.employee?.branch?.nameTh ?? null,
      taxId:
        calculation.taxProfile?.taxId ??
        calculation.employee?.profile?.taxId ??
        null,
      taxYearId: calculation.taxYearId,
      taxYear: calculation.taxYear?.taxYear ?? null,
      taxYearName: calculation.taxYear?.name ?? null,
      payrollRunId: calculation.payrollRunId,
      payrollRunNo: calculation.payrollRun?.runNo ?? '-',
      payrollRunName: payrollRunName(calculation.payrollRun),
      payrollRunStatus: calculation.payrollRun?.status ?? '-',
      periodCode: calculation.payrollRun?.period?.code ?? '-',
      periodName: calculation.payrollRun?.period?.name ?? '-',
      paymentDate: dateOnly(calculation.payrollRun?.period?.paymentDate),
      paymentYear: calculation.payrollRun?.period?.year ?? null,
      taxMonth: calculation.payrollRun?.period?.month ?? null,
      taxableIncomeCurrentRun: moneyText(calculation.taxableIncomeCurrentRun),
      projectedAnnualIncome: moneyText(calculation.projectedAnnualIncome),
      expenseDeduction: moneyText(calculation.expenseDeduction),
      allowanceTotal: moneyText(calculation.allowanceTotal),
      netTaxableIncome: moneyText(calculation.netTaxableIncome),
      annualTax: moneyText(calculation.annualTax),
      taxWithheldYtd: moneyText(calculation.taxWithheldYtd),
      remainingTax: moneyText(calculation.remainingTax),
      currentRunTax: moneyText(calculation.currentRunTax),
      roundingAdjustment: moneyText(calculation.roundingAdjustment),
      status: calculation.status,
      createdAt: calculation.createdAt,
    };
  }

  private toPnd1ADetailMonthlyRow(calculation: any) {
    const snapshot = this.asRecord(calculation.calculationSnapshot);
    const lines = calculation.payrollItem?.lines ?? [];
    const lineSummary = this.summarizePayrollLines(lines);
    const bonusIncome = this.snapshotMoney(
      snapshot,
      'bonusIncome',
      lineSummary.bonusIncome,
    );
    const overtimeIncome = lineSummary.overtimeIncome;
    const otherTaxableIncome = this.snapshotMoney(
      snapshot,
      'otherTaxableIncome',
      lineSummary.otherTaxableIncome,
    );
    const oneTimeTaxableIncome = this.snapshotMoney(
      snapshot,
      'oneTimeTaxableIncomeCurrentRun',
      bonusIncome + overtimeIncome + otherTaxableIncome,
    );
    const regularTaxableIncome = this.snapshotMoney(
      snapshot,
      'regularTaxableIncomeCurrentRun',
      Math.max(
        numberValue(calculation.taxableIncomeCurrentRun) - oneTimeTaxableIncome,
        0,
      ),
    );

    return {
      id: calculation.id,
      payrollRunId: calculation.payrollRunId,
      payrollItemId: calculation.payrollItemId,
      payrollRunNo: calculation.payrollRun?.runNo ?? '-',
      payrollRunName: payrollRunName(calculation.payrollRun),
      payrollRunStatus: calculation.payrollRun?.status ?? '-',
      periodCode: calculation.payrollRun?.period?.code ?? '-',
      periodName: calculation.payrollRun?.period?.name ?? '-',
      paymentDate: dateOnly(calculation.payrollRun?.period?.paymentDate),
      paymentYear: calculation.payrollRun?.period?.year ?? null,
      taxMonth: calculation.payrollRun?.period?.month ?? null,
      baseSalary: moneyText(calculation.payrollItem?.baseSalary),
      totalEarnings: moneyText(calculation.payrollItem?.totalEarnings),
      totalDeductions: moneyText(calculation.payrollItem?.totalDeductions),
      totalGrossPay: moneyText(calculation.payrollItem?.totalGrossPay),
      totalNetPay: moneyText(calculation.payrollItem?.totalNetPay),
      taxableIncomeCurrentRun: moneyText(calculation.taxableIncomeCurrentRun),
      regularTaxableIncomeCurrentRun: moneyText(regularTaxableIncome),
      oneTimeTaxableIncomeCurrentRun: moneyText(oneTimeTaxableIncome),
      bonusIncome: moneyText(bonusIncome),
      overtimeIncome: moneyText(overtimeIncome),
      otherTaxableIncome: moneyText(otherTaxableIncome),
      projectedAnnualIncome: moneyText(calculation.projectedAnnualIncome),
      expenseDeduction: moneyText(calculation.expenseDeduction),
      allowanceTotal: moneyText(calculation.allowanceTotal),
      netTaxableIncome: moneyText(calculation.netTaxableIncome),
      annualTax: moneyText(calculation.annualTax),
      taxWithheldYtd: moneyText(calculation.taxWithheldYtd),
      remainingTax: moneyText(calculation.remainingTax),
      currentRunTax: moneyText(calculation.currentRunTax),
      roundingAdjustment: moneyText(calculation.roundingAdjustment),
      calculationStatus: calculation.status,
      calculationFormula: snapshot.formula ?? null,
      snapshot: {
        formula: snapshot.formula ?? null,
        remainingPeriods: snapshot.remainingPeriods ?? null,
        standardAllowance: snapshot.standardAllowance ?? null,
        projectedAnnualIncomeBeforeCurrentOneTime:
          snapshot.projectedAnnualIncomeBeforeCurrentOneTime ?? null,
        annualTaxBeforeCurrentOneTimeIncome:
          snapshot.annualTaxBeforeCurrentOneTimeIncome ?? null,
        regularCurrentRunTaxRaw: snapshot.regularCurrentRunTaxRaw ?? null,
        oneTimeIncomeCurrentRunTaxRaw:
          snapshot.oneTimeIncomeCurrentRunTaxRaw ?? null,
        uncappedCurrentRunTaxRaw: snapshot.uncappedCurrentRunTaxRaw ?? null,
      },
      lineSummary: {
        taxableEarnings: moneyText(lineSummary.taxableEarnings),
        nonTaxableEarnings: moneyText(lineSummary.nonTaxableEarnings),
        socialSecurity: moneyText(lineSummary.socialSecurity),
        attendanceDeduction: moneyText(lineSummary.attendanceDeduction),
        leaveDeduction: moneyText(lineSummary.leaveDeduction),
        taxDeduction: moneyText(lineSummary.taxDeduction),
        otherDeduction: moneyText(lineSummary.otherDeduction),
      },
      lines: lines.map((line: any) => ({
        id: line.id,
        code: line.code,
        name: line.name,
        type: line.type,
        sourceType: line.sourceType,
        quantity:
          line.quantity === null || line.quantity === undefined
            ? null
            : String(line.quantity),
        rate:
          line.rate === null || line.rate === undefined
            ? null
            : String(line.rate),
        amount: moneyText(line.amount),
        isTaxable: line.isTaxable,
        isSocialSecurityBase: line.isSocialSecurityBase,
        note: line.note ?? null,
      })),
    };
  }

  private buildPnd1ADetailBreakdown({
    monthlyRows,
    summary,
    taxYear,
    allowances,
  }: {
    monthlyRows: any[];
    summary: Record<string, unknown>;
    taxYear: any;
    allowances: any[];
  }) {
    const incomeRows = this.mergeBreakdownRows(
      monthlyRows.flatMap((row) =>
        (row.lines ?? [])
          .filter((line: any) => line.type === 'EARNING')
          .map((line: any) => this.toDisplayPayrollLineRow(line, 'income')),
      ),
    );
    const deductionRows = this.mergeBreakdownRows(
      monthlyRows.flatMap((row) =>
        (row.lines ?? [])
          .filter((line: any) => line.type === 'DEDUCTION')
          .map((line: any) => this.toDisplayPayrollLineRow(line, 'deduction')),
      ),
    );

    const totalIncomeFromLines = incomeRows.reduce(
      (sum, row) => sum + numberValue(row.amount),
      0,
    );
    const totalDeductionFromLines = deductionRows.reduce(
      (sum, row) => sum + numberValue(row.amount),
      0,
    );
    const totalNetPayFromRows = monthlyRows.reduce(
      (sum, row) => sum + numberValue(row.totalNetPay),
      0,
    );

    if (!incomeRows.length && numberValue(summary.totalPaidAmount) > 0) {
      incomeRows.push({
        label: 'เงินได้ที่นำไปคิดภาษี',
        amount: moneyText(summary.totalPaidAmount),
        source: 'จากยอดเงินได้ใน Payroll Run ที่อนุมัติหรือจ่ายแล้ว',
        group: 'income',
      });
    }
    if (
      !deductionRows.length &&
      numberValue(summary.totalTaxWithheldAmount) > 0
    ) {
      deductionRows.push({
        label: 'ภาษีหัก ณ ที่จ่าย',
        amount: moneyText(summary.totalTaxWithheldAmount),
        source: 'จากผลคำนวณภาษีหัก ณ ที่จ่ายของระบบ',
        group: 'deduction',
      });
    }

    const expenseRate = taxYear?.personalExpenseRate ?? null;
    const expenseMax = taxYear?.personalExpenseMax ?? null;
    const standardAllowance = money(
      taxYear?.standardPersonalAllowance ??
        monthlyRows[monthlyRows.length - 1]?.snapshot?.standardAllowance ??
        0,
    );
    const totalAllowance = money(summary.totalAllowance);
    const otherAllowance = Math.max(totalAllowance - standardAllowance, 0);

    const taxComputationRows = [
      {
        label: 'เงินได้สะสมที่ใช้คำนวณภาษี',
        amount: moneyText(summary.totalPaidAmount),
        source:
          'รวมเงินได้ที่ต้องเสียภาษีจาก Payroll Run ที่อนุมัติหรือจ่ายแล้วในปีภาษี',
        group: 'income',
      },
      {
        label: `หักค่าใช้จ่าย${expenseRate ? ` ${percentText(expenseRate)}` : ''}${expenseMax ? ` ไม่เกิน ${moneyText(expenseMax)} บาท` : ''}`,
        amount: moneyText(summary.totalExpenseDeduction),
        source: 'จากการตั้งค่าปีภาษีของบริษัท',
        group: 'tax-deduction',
      },
      {
        label: 'หักค่าลดหย่อนส่วนตัว',
        amount: moneyText(standardAllowance),
        source: 'จากการตั้งค่าปีภาษีของบริษัท',
        group: 'tax-deduction',
      },
      {
        label: 'หักค่าลดหย่อนอื่น ๆ',
        amount: moneyText(otherAllowance),
        source: allowances.length
          ? 'จากข้อมูลค่าลดหย่อนที่อนุมัติของพนักงาน'
          : 'ยังไม่มีค่าลดหย่อนเพิ่มเติมที่อนุมัติ',
        group: 'tax-deduction',
      },
      {
        label: 'รวมค่าใช้จ่ายและค่าลดหย่อน',
        amount: moneyText(
          numberValue(summary.totalExpenseDeduction) + totalAllowance,
        ),
        source: 'ค่าใช้จ่ายที่หักได้รวมกับค่าลดหย่อนทั้งหมด',
        group: 'total',
      },
      {
        label: 'เงินได้สุทธิที่ใช้เข้าขั้นภาษี',
        amount: moneyText(summary.totalNetTaxableIncome),
        source: 'เงินได้สะสม หักค่าใช้จ่ายและค่าลดหย่อนตามสิทธิ',
        group: 'net',
      },
      {
        label: 'ภาษีทั้งปีโดยประมาณ',
        amount: moneyText(summary.annualTaxEstimate),
        source: 'คำนวณจากขั้นภาษีของปีภาษีที่เลือก',
        group: 'tax',
      },
      {
        label: 'ภาษีหัก ณ ที่จ่ายสะสม',
        amount: moneyText(summary.totalTaxWithheldAmount),
        source: 'รวมภาษีที่หักไว้ในแต่ละ Payroll Run ของปีภาษี',
        group: 'withholding',
      },
    ];

    return {
      payrollSummary: {
        incomeRows,
        deductionRows,
        totalIncome: moneyText(totalIncomeFromLines || summary.totalPaidAmount),
        totalDeduction: moneyText(
          totalDeductionFromLines || summary.totalTaxWithheldAmount,
        ),
        netPay: moneyText(
          totalNetPayFromRows ||
            (totalIncomeFromLines || numberValue(summary.totalPaidAmount)) -
              (totalDeductionFromLines ||
                numberValue(summary.totalTaxWithheldAmount)),
        ),
      },
      taxComputationRows,
      monthlyRows: monthlyRows.map((row) => {
        const incomeRows = this.mergeBreakdownRows(
          (row.lines ?? [])
            .filter((line: any) => line.type === 'EARNING')
            .map((line: any) => this.toDisplayPayrollLineRow(line, 'income')),
        );
        const deductionRows = this.mergeBreakdownRows(
          (row.lines ?? [])
            .filter((line: any) => line.type === 'DEDUCTION')
            .map((line: any) =>
              this.toDisplayPayrollLineRow(line, 'deduction'),
            ),
        );
        return {
          id: row.id,
          periodName: row.periodName,
          payrollRunName: row.payrollRunName,
          payrollRunStatus: row.payrollRunStatus,
          paymentDate: row.paymentDate,
          incomeRows,
          deductionRows,
          totalIncome: moneyText(
            incomeRows.reduce(
              (sum, item) => sum + numberValue(item.amount),
              0,
            ) || row.totalEarnings,
          ),
          totalDeduction: moneyText(
            deductionRows.reduce(
              (sum, item) => sum + numberValue(item.amount),
              0,
            ) || row.totalDeductions,
          ),
          netPay: moneyText(row.totalNetPay),
          taxableIncome: moneyText(row.taxableIncomeCurrentRun),
          taxWithheld: moneyText(row.currentRunTax),
        };
      }),
    };
  }

  private mergeBreakdownRows(rows: any[]) {
    const map = new Map<string, any>();
    for (const row of rows) {
      const key = `${row.group}:${row.label}:${row.source}`;
      const current = map.get(key) ?? { ...row, amount: '0.00' };
      current.amount = moneyText(
        numberValue(current.amount) + numberValue(row.amount),
      );
      map.set(key, current);
    }
    return Array.from(map.values()).filter(
      (row) => numberValue(row.amount) !== 0,
    );
  }

  private toDisplayPayrollLineRow(line: any, group: 'income' | 'deduction') {
    const amount = moneyText(line.amount);
    const label =
      group === 'income'
        ? this.incomeLineLabel(line)
        : this.deductionLineLabel(line);
    const source =
      group === 'income'
        ? this.incomeLineSource(label)
        : this.deductionLineSource(label);
    return { label, amount, source, group };
  }

  private incomeLineLabel(line: any) {
    const text = `${line.name ?? ''} ${line.sourceType ?? ''}`.toLowerCase();
    if (text.includes('bonus') || text.includes('โบนัส'))
      return 'โบนัส / เงินพิเศษ';
    if (
      text.includes('overtime') ||
      text.includes('ot') ||
      text.includes('ล่วงเวลา')
    )
      return 'OT';
    if (text.includes('position') || text.includes('ตำแหน่ง'))
      return 'ค่าตำแหน่ง';
    if (
      text.includes('transport') ||
      text.includes('travel') ||
      text.includes('เดินทาง')
    )
      return 'ค่าเดินทาง';
    if (text.includes('phone') || text.includes('โทร')) return 'ค่าโทรศัพท์';
    if (
      text.includes('salary') ||
      text.includes('base') ||
      text.includes('เงินเดือน')
    )
      return 'เงินเดือน';
    if (line.isTaxable) return 'รายได้อื่นที่คิดภาษี';
    return 'รายได้อื่นที่ไม่คิดภาษี';
  }

  private deductionLineLabel(line: any) {
    const text = `${line.name ?? ''} ${line.sourceType ?? ''}`.toLowerCase();
    if (text.includes('social') || text.includes('ประกันสังคม'))
      return 'ประกันสังคม';
    if (text.includes('tax') || text.includes('ภาษี'))
      return 'ภาษีหัก ณ ที่จ่าย';
    if (
      text.includes('attendance') ||
      text.includes('มาสาย') ||
      text.includes('ขาด')
    )
      return 'หักขาด/ลา/มาสาย';
    if (text.includes('leave') || text.includes('ลา'))
      return 'หักลาไม่รับค่าจ้าง';
    return 'รายหักอื่น ๆ';
  }

  private incomeLineSource(label: string) {
    if (label === 'เงินเดือน') return 'จากฐานเงินเดือนใน Payroll Run';
    if (['ค่าตำแหน่ง', 'ค่าเดินทาง', 'ค่าโทรศัพท์'].includes(label)) {
      return 'จากรายการรายได้ประจำที่ตั้งไว้ให้พนักงาน';
    }
    if (label === 'โบนัส / เงินพิเศษ')
      return 'จากรายการโบนัสหรือเงินพิเศษใน Payroll Run';
    if (label === 'OT') return 'จากข้อมูล OT ที่อนุมัติและนำเข้า Payroll Run';
    if (label === 'รายได้อื่นที่คิดภาษี')
      return 'จากรายการรายได้อื่นที่นำมาคิดภาษีใน Payroll Run';
    return 'จากรายการรายได้อื่นใน Payroll Run';
  }

  private deductionLineSource(label: string) {
    if (label === 'ประกันสังคม') return 'จากผลคำนวณประกันสังคมใน Payroll Run';
    if (label === 'ภาษีหัก ณ ที่จ่าย')
      return 'จากผลคำนวณภาษีหัก ณ ที่จ่ายของระบบ';
    if (label === 'หักขาด/ลา/มาสาย')
      return 'จากข้อมูลเวลาเข้าออกงานที่สรุปเข้า Payroll Run';
    if (label === 'หักลาไม่รับค่าจ้าง')
      return 'จากข้อมูลการลาที่สรุปเข้า Payroll Run';
    return 'จากรายการหักอื่นใน Payroll Run';
  }

  private summarizePnd1ADetailRows(rows: any[]) {
    const totals = rows.reduce(
      (acc, row) => {
        acc.totalPaidAmount += numberValue(row.taxableIncomeCurrentRun);
        acc.totalRegularIncome += numberValue(
          row.regularTaxableIncomeCurrentRun,
        );
        acc.totalOneTimeIncome += numberValue(
          row.oneTimeTaxableIncomeCurrentRun,
        );
        acc.totalBonusIncome += numberValue(row.bonusIncome);
        acc.totalOvertimeIncome += numberValue(row.overtimeIncome);
        acc.totalOtherTaxableIncome += numberValue(row.otherTaxableIncome);
        acc.totalExpenseDeduction = Math.max(
          acc.totalExpenseDeduction,
          numberValue(row.expenseDeduction),
        );
        acc.totalAllowance = Math.max(
          acc.totalAllowance,
          numberValue(row.allowanceTotal),
        );
        acc.totalNetTaxableIncome = Math.max(
          acc.totalNetTaxableIncome,
          numberValue(row.netTaxableIncome),
        );
        acc.annualTaxEstimate = Math.max(
          acc.annualTaxEstimate,
          numberValue(row.annualTax),
        );
        acc.totalTaxWithheldAmount += numberValue(row.currentRunTax);
        if (
          row.paymentDate &&
          (!acc.lastPaymentDate || row.paymentDate > acc.lastPaymentDate)
        ) {
          acc.lastPaymentDate = row.paymentDate;
        }
        return acc;
      },
      {
        totalPaidAmount: 0,
        totalRegularIncome: 0,
        totalOneTimeIncome: 0,
        totalBonusIncome: 0,
        totalOvertimeIncome: 0,
        totalOtherTaxableIncome: 0,
        totalExpenseDeduction: 0,
        totalAllowance: 0,
        totalNetTaxableIncome: 0,
        annualTaxEstimate: 0,
        totalTaxWithheldAmount: 0,
        lastPaymentDate: null as string | null,
      },
    );

    return {
      payrollRunCount: rows.length,
      totalPaidAmount: moneyText(totals.totalPaidAmount),
      totalRegularIncome: moneyText(totals.totalRegularIncome),
      totalOneTimeIncome: moneyText(totals.totalOneTimeIncome),
      totalBonusIncome: moneyText(totals.totalBonusIncome),
      totalOvertimeIncome: moneyText(totals.totalOvertimeIncome),
      totalOtherTaxableIncome: moneyText(totals.totalOtherTaxableIncome),
      totalExpenseDeduction: moneyText(totals.totalExpenseDeduction),
      totalAllowance: moneyText(totals.totalAllowance),
      totalNetTaxableIncome: moneyText(totals.totalNetTaxableIncome),
      annualTaxEstimate: moneyText(totals.annualTaxEstimate),
      totalTaxWithheldAmount: moneyText(totals.totalTaxWithheldAmount),
      lastPaymentDate: totals.lastPaymentDate,
    };
  }

  private summarizePayrollLines(lines: any[]) {
    return lines.reduce(
      (acc, line) => {
        const amount = numberValue(line.amount);
        if (line.type === 'EARNING' && line.isTaxable)
          acc.taxableEarnings += amount;
        if (line.type === 'EARNING' && !line.isTaxable)
          acc.nonTaxableEarnings += amount;
        if (line.sourceType === 'BONUS') acc.bonusIncome += amount;
        if (line.sourceType === 'OVERTIME') acc.overtimeIncome += amount;
        if (
          line.type === 'EARNING' &&
          line.isTaxable &&
          ['ADJUSTMENT', 'IMPORT', 'OTHER'].includes(line.sourceType)
        ) {
          acc.otherTaxableIncome += amount;
        }
        if (line.sourceType === 'SOCIAL_SECURITY') acc.socialSecurity += amount;
        if (line.sourceType === 'ATTENDANCE') acc.attendanceDeduction += amount;
        if (line.sourceType === 'LEAVE') acc.leaveDeduction += amount;
        if (line.sourceType === 'TAX') acc.taxDeduction += amount;
        if (
          line.type === 'DEDUCTION' &&
          !['SOCIAL_SECURITY', 'ATTENDANCE', 'LEAVE', 'TAX'].includes(
            line.sourceType,
          )
        ) {
          acc.otherDeduction += amount;
        }
        return acc;
      },
      {
        taxableEarnings: 0,
        nonTaxableEarnings: 0,
        bonusIncome: 0,
        overtimeIncome: 0,
        otherTaxableIncome: 0,
        socialSecurity: 0,
        attendanceDeduction: 0,
        leaveDeduction: 0,
        taxDeduction: 0,
        otherDeduction: 0,
      },
    );
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private snapshotMoney(
    snapshot: Record<string, any>,
    key: string,
    fallback = 0,
  ) {
    return numberValue(snapshot[key], fallback);
  }

  private summarizeRows(rows: any[]) {
    const summary = rows.reduce(
      (acc, row) => {
        acc.employeeCount += 1;
        acc.totalTaxableIncome += numberValue(row.taxableIncomeCurrentRun);
        acc.totalAllowance += numberValue(row.allowanceTotal);
        acc.totalNetTaxableIncome += numberValue(row.netTaxableIncome);
        acc.totalTaxWithheld += numberValue(row.currentRunTax);
        return acc;
      },
      {
        employeeCount: 0,
        totalTaxableIncome: 0,
        totalAllowance: 0,
        totalNetTaxableIncome: 0,
        totalTaxWithheld: 0,
      },
    );

    return {
      employeeCount: summary.employeeCount,
      totalTaxableIncome: moneyText(summary.totalTaxableIncome),
      totalAllowance: moneyText(summary.totalAllowance),
      totalNetTaxableIncome: moneyText(summary.totalNetTaxableIncome),
      totalTaxWithheld: moneyText(summary.totalTaxWithheld),
    };
  }

  private summarizePndRows(rows: any[]) {
    const summary = rows.reduce(
      (acc, row) => {
        acc.employeeCount += 1;
        acc.totalPaidAmount += numberValue(
          row.paidAmount ?? row.totalPaidAmount,
        );
        acc.totalTaxWithheld += numberValue(
          row.taxWithheldAmount ?? row.totalTaxWithheldAmount,
        );
        return acc;
      },
      { employeeCount: 0, totalPaidAmount: 0, totalTaxWithheld: 0 },
    );

    return {
      employeeCount: summary.employeeCount,
      totalPaidAmount: moneyText(summary.totalPaidAmount),
      totalTaxWithheld: moneyText(summary.totalTaxWithheld),
    };
  }
}
