import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { employeeDisplayName } from '../../common/utils/employee-display-name.util';
import type { Prisma } from '../../generated/prisma/client';
import {
  EmployeeStatus,
  MasterStatus,
  PayrollPeriodStatus,
  PayrollRunStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertNotReferenced } from '../../common/database/hard-delete.util';
import {
  buildPayrollPeriodRange,
  toPayrollDateKey,
} from '../../common/utils/payroll-period-range.util';
import {
  resolveBasePayForPeriod,
  salaryBasisOf,
} from '../../common/utils/salary-rate.util';
import {
  CreateEmployeeCompensationDto,
  EmployeeCompensationQueryDto,
  UpdateEmployeeCompensationDto,
} from './dto/employee-compensation.dto';
import {
  CreatePayrollComponentDto,
  UpdatePayrollComponentDto,
} from './dto/payroll-component.dto';
import {
  CreatePayrollPeriodDto,
  UpdatePayrollPeriodDto,
} from './dto/payroll-period.dto';
import { PayrollListQueryDto } from './dto/payroll-query.dto';
import {
  CalculatePayrollRunDto,
  CancelPayrollRunDto,
  CreatePayrollRunDto,
  PayrollRunQueryDto,
} from './dto/payroll-run.dto';

import {
  ApprovePayrollRunDto,
  MarkPayrollRunPaidDto,
  ReviewPayrollRunDto,
} from './dto/payroll-run-action.dto';

import { PayslipQueryDto } from "./dto/payslip-query.dto";

import {
  generatePayslipPdf,
  launchPayslipBrowser,
  renderPayslipPdfWithBrowser,
  type PayslipPaperLayout,
  type PayslipPdfResult,
} from './payroll-payslip-pdf.util';

/**
 * ส่วนของ archiver ที่บริการนี้ใช้จริง — ประกาศเป็น interface แคบ ๆ แทนการ
 * ผูกกับไลบรารีตรง ๆ จะได้เทสได้โดยไม่ต้องสร้างไฟล์ซิปจริง
 */
export type PayslipZipArchive = {
  append(source: Buffer, options: { name: string }): unknown;
};
import {
  generatePayrollRunExcel,
  generatePayrollRunPdf,
  type PayrollRunExportResult,
} from './payroll-run-export.util';
import { toPageMeta } from './helpers/payroll-page-meta.helper';
import { appendPayrollNote } from './helpers/payroll-note.helper';
import { toDateOnly } from './utils/payroll-date.util';
import {
  addMoney,
  normalizeDecimal,
  toMoney,
  toMoneyString,
} from './utils/payroll-money.util';
import {
  isFinalPayrollRunStatus,
  isLockedForCalculation,
} from './utils/payroll-status.util';
import { resolveEmploymentProration } from './utils/payroll-employment-proration.util';
import { prorateRecurringLines } from './utils/payroll-recurring-proration.util';
import { splitTaxableIncome } from './utils/payroll-taxable-base.util';
import { PayrollHandoffImportService } from './services/payroll-handoff-import.service';
import { PayrollRecurringLinesService } from './services/payroll-recurring-lines.service';
import { PayrollAdjustmentImportService } from './services/payroll-adjustment-import.service';
import { PayrollAttendanceDeductionImportService } from './services/payroll-attendance-deduction-import.service';
import { PayrollReadinessService } from './services/payroll-readiness.service';
import { PayrollLineAuditService } from './services/payroll-line-audit.service';
import { PayrollSocialSecurityService } from './services/payroll-social-security.service';
import { PayrollDeductionPlanService } from './services/payroll-deduction-plan.service';
import { PayrollTaxCalculatorService } from './services/payroll-tax-calculator.service';
import { PayrollSourcePreviewService } from './services/payroll-source-preview.service';
import { PayrollCalculationVerificationService } from './services/payroll-calculation-verification.service';
import { PayrollProgressService } from './services/payroll-progress.service';
import {
  CompanyPayrollSettingsService,
  type PayrollCalculationSettingsValue,
} from '../settings/company-payroll-settings.service';
import { DEFAULT_PAYROLL_COMPONENTS } from './constants/payroll-default-components';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

/**
 * PayrollService
 *
 * Service หลักของระบบเงินเดือน
 *
 * หลักการ refactor phase นี้:
 * - ไม่เปลี่ยน endpoint / DTO / schema / response หลัก
 * - ย้าย helper ทั่วไป เช่น date, money, status, note, pagination ออกไปไฟล์ย่อย
 * - คง business flow เดิมไว้ใน PayrollService เพื่อไม่ให้ระบบ payroll พัง
 * - เตรียม service scaffold สำหรับ HR Review / Payroll Handoff ใน phase ถัดไป
 */


function toNumeric(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}


const SUPPORTED_PAYROLL_RUN_STATUSES = Object.values(PayrollRunStatus) as PayrollRunStatus[];
const SUPPORTED_PAYROLL_RUN_STATUS_SET = new Set<string>(SUPPORTED_PAYROLL_RUN_STATUSES);

function isSupportedPayrollRunStatus(value: unknown): value is PayrollRunStatus {
  return typeof value === 'string' && SUPPORTED_PAYROLL_RUN_STATUS_SET.has(value);
}

function buildPayrollRunStatusSummary(
  total: number,
  statusGroups: Array<{
    status: PayrollRunStatus;
    _count?: true | { _all?: number | null } | null;
  }>,
  aggregate: {
    _sum: {
      totalEmployees?: number | null;
      totalEarnings?: unknown;
      totalDeductions?: unknown;
      totalGrossPay?: unknown;
      totalNetPay?: unknown;
    };
  },
) {
  const statusCount = new Map<PayrollRunStatus, number>();

  statusGroups.forEach((group) => {
    const count = typeof group._count === 'object' && group._count
      ? toNumeric(group._count._all)
      : 0;
    statusCount.set(group.status, count);
  });

  const get = (status: PayrollRunStatus) => statusCount.get(status) || 0;
  const calculated = get(PayrollRunStatus.CALCULATED);
  const reviewed = get(PayrollRunStatus.REVIEWED);
  const approved = get(PayrollRunStatus.APPROVED);

  return {
    total,
    draft: get(PayrollRunStatus.DRAFT),
    calculating: get(PayrollRunStatus.CALCULATING),
    calculated,
    reviewed,
    approved,
    paid: get(PayrollRunStatus.PAID),
    cancelled: get(PayrollRunStatus.CANCELLED),
    failed: get(PayrollRunStatus.FAILED),
    waitingReviewOrApproval: calculated + reviewed + approved,
    totalEmployees: toNumeric(aggregate._sum.totalEmployees),
    totalEarnings: toNumeric(aggregate._sum.totalEarnings),
    totalDeductions: toNumeric(aggregate._sum.totalDeductions),
    totalGrossPay: toNumeric(aggregate._sum.totalGrossPay),
    totalNetPay: toNumeric(aggregate._sum.totalNetPay),
  };
}


type PayrollBranchSummaryRow = {
  branchId: string | null;
  branchCode: string | null;
  branchName: string;
  employeeCount: number;
  totalEarnings: number;
  totalDeductions: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalTax: number;
  totalSocialSecurity: number;
  totalEmployerContribution: number;
  totalLateMinutes: number;
  totalAbsentDays: number;
};

function getPayrollItemSnapshotRecord(item: any): Record<string, unknown> | null {
  const snapshot = item?.snapshot;
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : null;
}

function getPayrollItemSnapshotSection(
  item: any,
  section: 'employee' | 'compensation',
): Record<string, unknown> | null {
  const value = getPayrollItemSnapshotRecord(item)?.[section];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getPayrollSnapshotString(
  item: any,
  section: 'employee' | 'compensation',
  key: string,
): string | null {
  const value = getPayrollItemSnapshotSection(item, section)?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getPayrollItemPaymentMethod(item: any) {
  return getPayrollSnapshotString(item, 'compensation', 'paymentMethod') ?? item?.compensation?.paymentMethod ?? null;
}

function getPayrollItemBankName(item: any) {
  return getPayrollSnapshotString(item, 'compensation', 'bankName') ?? item?.compensation?.bankName ?? null;
}

function getPayrollItemBankAccountName(item: any) {
  return getPayrollSnapshotString(item, 'compensation', 'bankAccountName') ?? item?.compensation?.bankAccountName ?? null;
}

function getPayrollItemBankAccountNo(item: any) {
  return getPayrollSnapshotString(item, 'compensation', 'bankAccountNo') ?? item?.compensation?.bankAccountNo ?? null;
}

function getPayrollItemBranchSnapshot(item: any) {
  const branchId =
    item?.branchId ??
    getPayrollSnapshotString(item, 'employee', 'branchId') ??
    item?.employee?.branch?.id ??
    null;
  const branchCode =
    item?.branchCode ??
    getPayrollSnapshotString(item, 'employee', 'branchCode') ??
    item?.employee?.branch?.code ??
    null;
  const branchName =
    item?.branchName ??
    getPayrollSnapshotString(item, 'employee', 'branch') ??
    item?.employee?.branch?.nameTh ??
    branchCode ??
    'ไม่ระบุสาขา';

  return {
    key: branchId ?? '__UNASSIGNED_BRANCH__',
    branchId,
    branchCode,
    branchName,
  };
}

function buildPayrollBranchSummary(items: any[]): PayrollBranchSummaryRow[] {
  const branchMap = new Map<string, PayrollBranchSummaryRow>();

  for (const item of Array.isArray(items) ? items : []) {
    const branch = getPayrollItemBranchSnapshot(item);
    const current = branchMap.get(branch.key) ?? {
      branchId: branch.branchId,
      branchCode: branch.branchCode,
      branchName: branch.branchName,
      employeeCount: 0,
      totalEarnings: 0,
      totalDeductions: 0,
      totalGrossPay: 0,
      totalNetPay: 0,
      totalTax: 0,
      totalSocialSecurity: 0,
      totalEmployerContribution: 0,
      totalLateMinutes: 0,
      totalAbsentDays: 0,
    };

    current.employeeCount += 1;
    current.totalEarnings += toNumeric(item?.totalEarnings);
    current.totalDeductions += toNumeric(item?.totalDeductions);
    current.totalGrossPay += toNumeric(item?.totalGrossPay);
    current.totalNetPay += toNumeric(item?.totalNetPay);
    current.totalLateMinutes += toNumeric(item?.lateMinutes);
    current.totalAbsentDays += toNumeric(item?.absentDays);

    for (const line of Array.isArray(item?.lines) ? item.lines : []) {
      const amount = toNumeric(line?.amount);
      const lineType = String(line?.type || '');
      const sourceType = String(line?.sourceType || '');

      if (lineType === 'DEDUCTION' && sourceType === 'TAX') {
        current.totalTax += amount;
      }

      if (lineType === 'DEDUCTION' && sourceType === 'SOCIAL_SECURITY') {
        current.totalSocialSecurity += amount;
      }

      if (lineType === 'EMPLOYER_CONTRIBUTION') {
        current.totalEmployerContribution += amount;
      }
    }

    branchMap.set(branch.key, current);
  }

  return Array.from(branchMap.values()).sort((a, b) => {
    if (!a.branchId && b.branchId) return 1;
    if (a.branchId && !b.branchId) return -1;
    return a.branchName.localeCompare(b.branchName, 'th');
  });
}


/* กติกาช่วงงวดย้ายไปอยู่ที่เดียวกับที่ฝั่งมือถือใช้ ดู payroll-period-range.util */
const buildExpectedPayrollPeriodRange = buildPayrollPeriodRange;

function formatPayrollPaymentMethod(method: string | null | undefined) {
  if (method === 'BANK_TRANSFER') return 'โอนธนาคาร';
  if (method === 'CASH') return 'เงินสด';
  if (method === 'CHEQUE') return 'เช็ค';
  if (method === 'OTHER') return 'อื่น ๆ';
  return 'ยังไม่ระบุ';
}

function maskPayrollBankAccount(accountNo: string | null | undefined) {
  const text = accountNo?.trim();
  return text || null;
}

function extractPayrollPaymentReference(note: string | null | undefined) {
  if (!note) return null;
  const match = note.match(/Payment Reference:\s*([^|\n]+)/i);
  return match?.[1]?.trim() || null;
}

function buildPayrollPaymentMethodSummary(items: any[]) {
  const summary = items.reduce(
    (acc, item) => {
      const method = getPayrollItemPaymentMethod(item);
      if (method === 'BANK_TRANSFER') acc.bankTransfer += 1;
      else if (method === 'CASH') acc.cash += 1;
      else if (method === 'CHEQUE') acc.cheque += 1;
      else if (method === 'OTHER') acc.other += 1;
      else acc.missing += 1;
      return acc;
    },
    { bankTransfer: 0, cash: 0, cheque: 0, other: 0, missing: 0 },
  );

  const parts = [
    summary.bankTransfer ? `โอน ${summary.bankTransfer}` : '',
    summary.cash ? `สด ${summary.cash}` : '',
    summary.cheque ? `เช็ค ${summary.cheque}` : '',
    summary.other ? `อื่น ๆ ${summary.other}` : '',
    summary.missing ? `ไม่ระบุ ${summary.missing}` : '',
  ].filter(Boolean);

  return {
    ...summary,
    label: parts.length ? parts.join(' / ') : 'ยังไม่มีข้อมูลการจ่ายจาก backend',
  };
}

function buildPayrollRunDetailSummary(run: any) {
  const items = Array.isArray(run?.items) ? run.items : [];

  let withCompensation = 0;
  let missingCompensation = 0;
  let absentDays = 0;
  let unpaidLeaveDays = 0;
  let lateMinutes = 0;
  let overtimeHours = 0;
  let earningLineAmount = 0;
  let deductionLineAmount = 0;
  let earningLineCount = 0;
  let deductionLineCount = 0;
  let sourceLineCount = 0;
  let negativeNetPayCount = 0;

  let baseSalaryTotal = 0;
  let otherEarningsTotal = 0;
  let overtimeTotal = 0;
  let totalEarnings = 0;
  let attendanceDeductionsTotal = 0;
  let leaveDeductionsTotal = 0;
  let taxSocialDeductionsTotal = 0;
  let adjustmentDeductionsTotal = 0;
  let otherDeductionsTotal = 0;
  let totalDeductions = 0;
  let totalGrossPay = 0;
  let totalNetPay = 0;
  let taxableEarningsTotal = 0;
  let nonTaxableEarningsTotal = 0;
  let socialSecurityBaseEarningsTotal = 0;
  let employeeSocialSecurityTotal = 0;
  let taxAmountTotal = 0;
  let employerContributionTotal = 0;

  const paymentMethodSummary = buildPayrollPaymentMethodSummary(items);

  const easyRows = items.map((item: any) => {
    if (item.compensationId || item.compensation) withCompensation += 1;
    else missingCompensation += 1;

    absentDays += toNumeric(item.absentDays);
    unpaidLeaveDays += toNumeric(item.unpaidLeaveDays);
    lateMinutes += toNumeric(item.lateMinutes);
    overtimeHours += toNumeric(item.overtimeHours);

    if (toNumeric(item.totalNetPay) < 0) negativeNetPayCount += 1;

    const lines = Array.isArray(item.lines) ? item.lines : [];
    let baseSalaryFromLine = 0;
    let overtimeEarnings = 0;
    let explicitOtherEarnings = 0;
    let attendanceDeductions = 0;
    let leaveDeductions = 0;
    let taxSocialDeductions = 0;
    let adjustmentDeductions = 0;
    let taxableEarnings = 0;
    let nonTaxableEarnings = 0;
    let socialSecurityBaseEarnings = 0;
    let employeeSocialSecurity = 0;
    let taxAmount = 0;
    let employerContributions = 0;

    lines.forEach((line: any) => {
      const amount = toNumeric(line.amount);
      const lineType = String(line.type || '');
      const sourceType = String(line.sourceType || '');

      if (lineType === 'EARNING') {
        earningLineAmount += amount;
        earningLineCount += 1;

        if (line.isTaxable) taxableEarnings += amount;
        else nonTaxableEarnings += amount;
        if (line.isSocialSecurityBase) socialSecurityBaseEarnings += amount;

        if (sourceType === 'BASE_SALARY') baseSalaryFromLine += amount;
        else if (sourceType === 'OVERTIME') overtimeEarnings += amount;
        else explicitOtherEarnings += amount;
      }

      if (lineType === 'DEDUCTION') {
        deductionLineAmount += amount;
        deductionLineCount += 1;

        if (sourceType === 'ATTENDANCE') attendanceDeductions += amount;
        else if (sourceType === 'LEAVE') leaveDeductions += amount;
        else if (sourceType === 'TAX' || sourceType === 'SOCIAL_SECURITY') taxSocialDeductions += amount;
        else if (sourceType === 'ADJUSTMENT') adjustmentDeductions += amount;

        if (sourceType === 'SOCIAL_SECURITY') employeeSocialSecurity += amount;
        if (sourceType === 'TAX') taxAmount += amount;
      }

      if (lineType === 'EMPLOYER_CONTRIBUTION') {
        employerContributions += amount;
      }

      if (['OVERTIME', 'ATTENDANCE', 'LEAVE', 'ADJUSTMENT'].includes(sourceType)) {
        sourceLineCount += 1;
      }
    });

    const baseSalary = baseSalaryFromLine || toNumeric(item.baseSalary);
    const itemTotalEarnings = toNumeric(item.totalEarnings);
    const otherEarnings = itemTotalEarnings > 0
      ? Math.max(0, itemTotalEarnings - baseSalary - overtimeEarnings)
      : explicitOtherEarnings;
    const itemTotalDeductions = toNumeric(item.totalDeductions);
    const otherDeductions = Math.max(
      0,
      itemTotalDeductions - attendanceDeductions - leaveDeductions - taxSocialDeductions - adjustmentDeductions,
    );
    const itemTotalGrossPay = toNumeric(item.totalGrossPay);
    const itemTotalNetPay = toNumeric(item.totalNetPay);

    baseSalaryTotal += baseSalary;
    otherEarningsTotal += otherEarnings;
    overtimeTotal += overtimeEarnings;
    totalEarnings += itemTotalEarnings;
    attendanceDeductionsTotal += attendanceDeductions;
    leaveDeductionsTotal += leaveDeductions;
    taxSocialDeductionsTotal += taxSocialDeductions;
    adjustmentDeductionsTotal += adjustmentDeductions;
    otherDeductionsTotal += otherDeductions;
    totalDeductions += itemTotalDeductions;
    totalGrossPay += itemTotalGrossPay;
    totalNetPay += itemTotalNetPay;
    taxableEarningsTotal += taxableEarnings;
    nonTaxableEarningsTotal += nonTaxableEarnings;
    socialSecurityBaseEarningsTotal += socialSecurityBaseEarnings;
    employeeSocialSecurityTotal += employeeSocialSecurity;
    taxAmountTotal += taxAmount;
    employerContributionTotal += employerContributions;

    return {
      itemId: item.id,
      employeeId: item.employeeId,
      baseSalary,
      otherEarnings,
      overtimeEarnings,
      totalEarnings: itemTotalEarnings,
      taxableEarnings,
      nonTaxableEarnings,
      socialSecurityBaseEarnings,
      attendanceDeductions,
      leaveDeductions,
      taxSocialDeductions,
      employeeSocialSecurity,
      taxAmount,
      adjustmentDeductions,
      otherDeductions,
      totalDeductions: itemTotalDeductions,
      employerContributions,
      totalGrossPay: itemTotalGrossPay,
      totalNetPay: itemTotalNetPay,
      paymentMethod: getPayrollItemPaymentMethod(item),
      paymentMethodLabel: formatPayrollPaymentMethod(getPayrollItemPaymentMethod(item)),
      bankName: getPayrollItemBankName(item),
      bankAccountName: getPayrollItemBankAccountName(item),
      bankAccountNoMasked: maskPayrollBankAccount(getPayrollItemBankAccountNo(item)),
    };
  });

  const employeeCount = items.length || toNumeric(run?.totalEmployees);

  return {
    employees: employeeCount,
    withCompensation,
    missingCompensation,
    absentDays,
    unpaidLeaveDays,
    lateMinutes,
    overtimeHours,
    earningLines: earningLineAmount,
    deductionLines: deductionLineAmount,
    earningLineCount,
    deductionLineCount,
    sourceLineCount,
    negativeNetPayCount,
    validationIssues: missingCompensation + negativeNetPayCount,
    easy: {
      rows: easyRows,
      employeeCount,
      baseSalaryTotal,
      otherEarningsTotal,
      overtimeTotal,
      totalEarnings: totalEarnings || toNumeric(run?.totalEarnings),
      attendanceDeductionsTotal,
      leaveDeductionsTotal,
      taxSocialDeductionsTotal,
      adjustmentDeductionsTotal,
      otherDeductionsTotal,
      totalDeductions: totalDeductions || toNumeric(run?.totalDeductions),
      totalGrossPay: totalGrossPay || toNumeric(run?.totalGrossPay),
      totalNetPay: totalNetPay || toNumeric(run?.totalNetPay),
      taxableEarningsTotal,
      nonTaxableEarningsTotal,
      socialSecurityBaseEarningsTotal,
      employeeSocialSecurityTotal,
      taxAmountTotal,
      employerContributionTotal,
      paymentMethodSummary,
      earningLineCount,
      deductionLineCount,
      sourceLineCount,
    },
    standard: {
      runType: 'REGULAR',
      runTypeLabel: 'Regular payroll',
      payFrequency: 'MONTHLY',
      payFrequencyLabel: 'Monthly',
      currency: 'THB',
      paymentReference: extractPayrollPaymentReference(run?.note),
      paymentMethodSummary,
      totals: {
        employeeCount,
        baseSalary: baseSalaryTotal,
        otherEarnings: otherEarningsTotal,
        overtime: overtimeTotal,
        totalEarnings: totalEarnings || toNumeric(run?.totalEarnings),
        taxableEarnings: taxableEarningsTotal,
        nonTaxableEarnings: nonTaxableEarningsTotal,
        socialSecurityBaseEarnings: socialSecurityBaseEarningsTotal,
        attendanceDeductions: attendanceDeductionsTotal,
        leaveDeductions: leaveDeductionsTotal,
        statutoryDeductions: taxSocialDeductionsTotal,
        employeeSocialSecurity: employeeSocialSecurityTotal,
        taxAmount: taxAmountTotal,
        adjustmentDeductions: adjustmentDeductionsTotal,
        otherDeductions: otherDeductionsTotal,
        totalDeductions: totalDeductions || toNumeric(run?.totalDeductions),
        employerContributions: employerContributionTotal,
        totalGrossPay: totalGrossPay || toNumeric(run?.totalGrossPay),
        totalNetPay: totalNetPay || toNumeric(run?.totalNetPay),
        negativeNetPayCount,
      },
    },
  };
}

const PAYROLL_CALCULATION_TRANSACTION_OPTIONS = {
  maxWait: 15_000,
  timeout: 60_000,
} as const;

const PAYROLL_CALCULATION_TIMEOUT_MESSAGE =
  'คำนวณ Payroll ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้งหลังตรวจข้อมูล Readiness หรือแบ่งคำนวณเป็นกลุ่มพนักงานเล็กลง';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollHandoffImportService: PayrollHandoffImportService,
    private readonly payrollRecurringLinesService: PayrollRecurringLinesService,
    private readonly payrollAdjustmentImportService: PayrollAdjustmentImportService,
    private readonly payrollAttendanceDeductionImportService: PayrollAttendanceDeductionImportService,
    private readonly payrollReadinessService: PayrollReadinessService,
    private readonly payrollLineAuditService: PayrollLineAuditService,
    private readonly payrollSocialSecurityService: PayrollSocialSecurityService,
    private readonly payrollDeductionPlanService: PayrollDeductionPlanService,
    private readonly payrollTaxCalculatorService: PayrollTaxCalculatorService,
    private readonly payrollSourcePreviewService: PayrollSourcePreviewService,
    private readonly payrollCalculationVerificationService: PayrollCalculationVerificationService,
    private readonly companyPayrollSettingsService: CompanyPayrollSettingsService,
    private readonly payrollProgressService: PayrollProgressService,
  ) {}

  private async assertPayrollPeriodRangeMatchesSettings(params: {
    companyId: string;
    year: number;
    month: number;
    startDate: Date;
    endDate: Date;
  }) {
    const settings = await this.companyPayrollSettingsService.resolvePayrollCalculationSettings(params.companyId);
    const expected = buildExpectedPayrollPeriodRange(
      params.year,
      params.month,
      settings,
    );
    const actualStart = toPayrollDateKey(params.startDate);
    const actualEnd = toPayrollDateKey(params.endDate);
    const expectedStart = toPayrollDateKey(expected.startDate);
    const expectedEnd = toPayrollDateKey(expected.endDate);

    if (actualStart !== expectedStart || actualEnd !== expectedEnd) {
      throw new BadRequestException(
        `ช่วงงวดเงินเดือนต้องตรงกับตั้งค่ารอบเงินเดือนของบริษัทนี้ (${expected.periodStartDay}-${expected.cutoffDay}): ${expectedStart} ถึง ${expectedEnd}`,
      );
    }
  }


  /**
   * เตรียม PayrollComponent มาตรฐานของบริษัทให้ครบก่อนสร้าง/คำนวณ Payroll
   * เพื่อให้ PayrollLine map componentId ได้ครบและไม่ต้องรอ auto-create ตอนเจอ line ครั้งแรก
   */
  private async ensureDefaultPayrollComponents(companyId: string, client: any = this.prisma) {
    const ensuredComponents: any[] = [];

    for (const component of DEFAULT_PAYROLL_COMPONENTS) {
      const ensured = await (client as any).payrollComponent.upsert({
        where: {
          companyId_code: {
            companyId,
            code: component.code,
          },
        },
        update: {
          nameTh: component.nameTh,
          nameEn: component.nameEn,
          description: component.description,
          type: component.type,
          sourceType: component.sourceType,
          isTaxable: component.isTaxable,
          isSocialSecurityBase: component.isSocialSecurityBase,
          isRecurring: component.isRecurring,
          sortOrder: component.sortOrder,
          status: MasterStatus.ACTIVE,
          deletedAt: null,
        },
        create: {
          companyId,
          code: component.code,
          nameTh: component.nameTh,
          nameEn: component.nameEn,
          description: component.description,
          type: component.type,
          sourceType: component.sourceType,
          isTaxable: component.isTaxable,
          isSocialSecurityBase: component.isSocialSecurityBase,
          isRecurring: component.isRecurring,
          sortOrder: component.sortOrder,
          status: MasterStatus.ACTIVE,
        },
      });

      ensuredComponents.push(ensured);
    }

    return ensuredComponents;
  }

  /* =========================================================
   * PAYROLL COMPONENTS
   * รายการเงินเดือน เช่น เงินเดือนประจำ, OT, เบี้ยเลี้ยง, รายการหัก
   * ========================================================= */

  async findComponents(query: PayrollListQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Prisma.PayrollComponentWhereInput = {
      deletedAt: null,
    };

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      where.companyId = scopedCompanyId;
    }

    if (query.status) {
      where.status = query.status as MasterStatus;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();

      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { nameTh: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollComponent.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              logoUrl: true,
            },
          },
        },
      }),
      this.prisma.payrollComponent.count({ where }),
    ]);

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
    };
  }

  async createComponent(dto: CreatePayrollComponentDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);

    const duplicated = await this.prisma.payrollComponent.findUnique({
      where: {
        companyId_code: {
          companyId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (duplicated) {
      throw new BadRequestException('รหัสรายการเงินเดือนนี้มีอยู่แล้ว');
    }

    return this.prisma.payrollComponent.create({
      data: {
        companyId,
        code: dto.code.trim().toUpperCase(),
        nameTh: dto.nameTh.trim(),
        nameEn: dto.nameEn?.trim() || null,
        description: dto.description?.trim() || null,
        type: dto.type,
        sourceType: dto.sourceType ?? 'MANUAL',
        isTaxable: dto.isTaxable ?? true,
        isSocialSecurityBase: dto.isSocialSecurityBase ?? false,
        isRecurring: dto.isRecurring ?? false,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async updateComponent(
    id: string,
    dto: UpdatePayrollComponentDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.payrollComponent.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบรายการเงินเดือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (dto.code && dto.code.trim().toUpperCase() !== current.code) {
      const duplicated = await this.prisma.payrollComponent.findUnique({
        where: {
          companyId_code: {
            companyId: current.companyId,
            code: dto.code.trim().toUpperCase(),
          },
        },
      });

      if (duplicated) {
        throw new BadRequestException('รหัสรายการเงินเดือนนี้มีอยู่แล้ว');
      }
    }

    return this.prisma.payrollComponent.update({
      where: { id },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        nameTh: dto.nameTh?.trim(),
        nameEn: dto.nameEn?.trim() || undefined,
        description: dto.description?.trim() || undefined,
        type: dto.type,
        sourceType: dto.sourceType,
        isTaxable: dto.isTaxable,
        isSocialSecurityBase: dto.isSocialSecurityBase,
        isRecurring: dto.isRecurring,
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
    });
  }

  async deleteComponent(id: string, scope: TenantScope) {
    const current = await this.prisma.payrollComponent.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบรายการเงินเดือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    /* ลบแล้วคือลบจริง — ถ้ายังถูกใช้ในรายการเงินเดือน ให้บอกว่าติดอะไร */
    await assertNotReferenced(
      this.prisma,
      'payroll_components',
      id,
      'รายการเงินเดือนนี้',
    );

    return this.prisma.payrollComponent.delete({ where: { id } });
  }


  /* =========================================================
   * PAYROLL PERIODS
   * งวดเงินเดือน เช่น 2026-05, วันที่เริ่ม-สิ้นสุด, วันที่จ่าย
   * ========================================================= */

  async findPeriods(query: PayrollListQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const periodBaseWhere: Prisma.PayrollPeriodWhereInput = {
      deletedAt: null,
    };

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      periodBaseWhere.companyId = scopedCompanyId;
    }

    if (query.status) {
      periodBaseWhere.status = query.status as PayrollPeriodStatus;
    }

    if (query.month) {
      periodBaseWhere.month = query.month;
    }

    if (query.year) {
      periodBaseWhere.year = query.year;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();

      periodBaseWhere.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const where: Prisma.PayrollPeriodWhereInput = { ...periodBaseWhere };

    if (query.branchId) {
      where.runs = {
        some: {
          deletedAt: null,
          items: {
            some: {
              employee: {
                branchId: query.branchId,
                deletedAt: null,
              },
            },
          },
        },
      };
    }

    const runWhere: Prisma.PayrollRunWhereInput = {
      deletedAt: null,
      period: periodBaseWhere as any,
    };

    if (query.branchId) {
      runWhere.items = {
        some: {
          employee: {
            branchId: query.branchId,
            deletedAt: null,
          },
        },
      };
    }

    const [data, total, statusGroups, runCount] = await this.prisma.$transaction([
      this.prisma.payrollPeriod.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              logoUrl: true,
            },
          },
          _count: {
            select: {
              runs: true,
            },
          },
        },
      }),
      this.prisma.payrollPeriod.count({ where }),
      this.prisma.payrollPeriod.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.payrollRun.count({ where: runWhere }),
    ]);

    const getStatusCount = (status: PayrollPeriodStatus) => {
      const group = statusGroups.find((item) => item.status === status);
      const count = group?._count;

      if (!count || count === true) return 0;
      return count._all ?? 0;
    };

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
      summary: {
        total,
        draft: getStatusCount(PayrollPeriodStatus.DRAFT),
        open: getStatusCount(PayrollPeriodStatus.OPEN),
        locked: getStatusCount(PayrollPeriodStatus.LOCKED),
        closed: getStatusCount(PayrollPeriodStatus.CLOSED),
        cancelled: getStatusCount(PayrollPeriodStatus.CANCELLED),
        runCount,
      },
    };
  }

  /**
   * งวดของบริษัทเดียวกันห้ามคาบเกี่ยวกัน
   *
   * ฐานข้อมูลกันไว้อยู่แล้วด้วย exclusion constraint (payroll_periods_no_overlap)
   * แต่ถ้าปล่อยให้ไปชนตรงนั้น ผู้ใช้จะได้ 500 พร้อมข้อความ Postgres ดิบ ๆ
   * ที่อ่านไม่ออกว่าไปทับกับงวดไหน ตรวจตรงนี้ก่อนเพื่อบอกชื่องวดที่ชนให้ชัด
   */
  private async assertPayrollPeriodNotOverlapping(params: {
    companyId: string;
    startDate: Date;
    endDate: Date;
    excludeId?: string;
  }) {
    const overlapped = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId: params.companyId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
        // ทับกันเมื่อ "เริ่มก่อนอีกฝ่ายจบ และจบหลังอีกฝ่ายเริ่ม"
        startDate: { lte: params.endDate },
        endDate: { gte: params.startDate },
      },
      select: { code: true, name: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });

    if (!overlapped) return;

    const range = `${overlapped.startDate.toISOString().slice(0, 10)} ถึง ${overlapped.endDate.toISOString().slice(0, 10)}`;

    throw new BadRequestException(
      `ช่วงวันที่ของงวดนี้ทับกับงวด ${overlapped.code} (${range}) ที่มีอยู่แล้ว — ลบหรือแก้ช่วงวันของงวดเดิมก่อน`,
    );
  }

  async createPeriod(
    dto: CreatePayrollPeriodDto,
    userId?: string,
    scope?: TenantScope,
  ) {
    const companyId = scope
      ? requireCompanyId(scope, dto.companyId)
      : dto.companyId;
    await this.assertCompany(companyId);

    const startDate = toDateOnly(dto.startDate);
    const endDate = toDateOnly(dto.endDate);
    const paymentDate = toDateOnly(dto.paymentDate);

    if (endDate < startDate) {
      throw new BadRequestException('วันที่สิ้นสุดต้องมากกว่าวันที่เริ่มต้น');
    }

    await this.assertPayrollPeriodRangeMatchesSettings({
      companyId,
      year: dto.year,
      month: dto.month,
      startDate,
      endDate,
    });

    /*
     * รหัสซ้ำ = ซ้ำกับงวดที่ยังอยู่เท่านั้น
     *
     * งวดที่ถูกลบเป็นการยกเลิก (soft delete) ไม่ควรจองรหัสไว้ต่อ ไม่งั้นพอลบงวด
     * ที่สร้างผิดแล้วสร้างใหม่ด้วยรหัสเดิม จะโดนตีกลับว่าซ้ำทั้งที่ไม่เห็นงวดนั้น
     * ในรายการแล้ว (ดัชนีในฐานข้อมูลเป็น partial unique ที่นับเฉพาะแถวที่ยังอยู่)
     */
    const duplicated = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId,
        code: dto.code.trim().toUpperCase(),
        deletedAt: null,
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException('รหัสงวดเงินเดือนนี้มีอยู่แล้ว');
    }

    await this.assertPayrollPeriodNotOverlapping({
      companyId,
      startDate,
      endDate,
    });

    return this.prisma.payrollPeriod.create({
      data: {
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        year: dto.year,
        month: dto.month,
        startDate,
        endDate,
        paymentDate,
        status: dto.status ?? 'DRAFT',
        createdById: userId ?? null,
      },
    });
  }

  /**
   * งวดเดียวพร้อมบริษัทของงวด
   * ใช้ตอนเปิดหน้า /payroll/:periodId ตรง ๆ ซึ่งยังไม่รู้ว่างวดนี้อยู่บริษัทไหน
   */
  async findPeriodById(id: string, scope: TenantScope) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id,
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
        _count: {
          select: {
            runs: true,
          },
        },
      },
    });

    if (!period) {
      throw new NotFoundException('ไม่พบงวดเงินเดือน');
    }

    assertWithinScope(scope, { companyId: period.companyId });

    return period;
  }

  async updatePeriod(
    id: string,
    dto: UpdatePayrollPeriodDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.payrollPeriod.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        runs: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบงวดเงินเดือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === 'LOCKED' || current.status === 'CLOSED') {
      throw new BadRequestException(
        'งวดเงินเดือนที่ล็อกหรือปิดแล้วไม่สามารถแก้ไขได้',
      );
    }

    if (dto.code && dto.code.trim().toUpperCase() !== current.code) {
      const duplicated = await this.prisma.payrollPeriod.findFirst({
        where: {
          companyId: current.companyId,
          code: dto.code.trim().toUpperCase(),
          deletedAt: null,
          id: { not: current.id },
        },
        select: { id: true },
      });

      if (duplicated) {
        throw new BadRequestException('รหัสงวดเงินเดือนนี้มีอยู่แล้ว');
      }
    }

    const startDate = dto.startDate ? toDateOnly(dto.startDate) : undefined;
    const endDate = dto.endDate ? toDateOnly(dto.endDate) : undefined;
    const paymentDate = dto.paymentDate
      ? toDateOnly(dto.paymentDate)
      : undefined;

    const nextStartDate = startDate ?? current.startDate;
    const nextEndDate = endDate ?? current.endDate;

    if (nextEndDate < nextStartDate) {
      throw new BadRequestException('วันที่สิ้นสุดต้องมากกว่าวันที่เริ่มต้น');
    }

    if (
      dto.year !== undefined ||
      dto.month !== undefined ||
      dto.startDate !== undefined ||
      dto.endDate !== undefined
    ) {
      await this.assertPayrollPeriodRangeMatchesSettings({
        companyId: current.companyId,
        year: dto.year ?? current.year,
        month: dto.month ?? current.month,
        startDate: nextStartDate,
        endDate: nextEndDate,
      });

      await this.assertPayrollPeriodNotOverlapping({
        companyId: current.companyId,
        startDate: nextStartDate,
        endDate: nextEndDate,
        excludeId: current.id,
      });
    }

    return this.prisma.payrollPeriod.update({
      where: { id },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        name: dto.name?.trim(),
        year: dto.year,
        month: dto.month,
        startDate,
        endDate,
        paymentDate,
        status: dto.status,
        lockedAt: dto.status === 'LOCKED' ? new Date() : undefined,
        closedAt: dto.status === 'CLOSED' ? new Date() : undefined,
        cancelledAt: dto.status === 'CANCELLED' ? new Date() : undefined,
      },
    });
  }

  async deletePeriod(id: string, scope: TenantScope) {
    const current = await this.prisma.payrollPeriod.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        runs: {
          where: { deletedAt: null },
          select: {
            id: true,
            runNo: true,
            status: true,
            _count: { select: { items: true } },
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบงวดเงินเดือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    /*
     * รอบคำนวณที่ "ยังว่างเปล่า" ไม่ควรขวางการลบงวด
     *
     * รอบถูกสร้างตั้งแต่ตอนเปิดหน้างวด ยังไม่ได้กดคำนวณก็มีรอบแล้ว ถ้านับว่าเป็น
     * ตัวขวาง งวดที่สร้างผิดจะลบไม่ได้เลยทั้งที่ยังไม่มีข้อมูลอะไรอยู่ในนั้น
     * ที่ต้องกันจริงคือรอบที่มีบรรทัดเงินเดือนแล้ว หรือเดินเลยสถานะร่างไปแล้ว
     */
    const blockingRuns = current.runs.filter(
      (run) =>
        run._count.items > 0 ||
        (run.status !== 'DRAFT' && run.status !== 'CANCELLED'),
    );

    if (blockingRuns.length > 0) {
      const detail = blockingRuns
        .map((run) => `${run.runNo} (${run.status})`)
        .join(', ');

      throw new BadRequestException(
        `งวดนี้มีรอบคำนวณที่เริ่มทำไปแล้ว: ${detail} — ยกเลิกรอบคำนวณก่อนจึงจะลบงวดได้`,
      );
    }

    /*
     * งวดที่ล็อกหรือปิดแล้วลบไม่ได้
     *
     * สองสถานะนี้แปลว่ายอดของงวดถูกใช้อ้างอิงไปแล้ว (ปิดงวดเวลาทำงาน/ออกเอกสาร)
     * ถ้าจะลบจริงต้องปลดล็อกก่อน เพื่อให้มีร่องรอยว่าใครเป็นคนเปิดงวดที่ปิดไปแล้ว
     */
    if (current.status === 'LOCKED' || current.status === 'CLOSED') {
      throw new BadRequestException(
        'งวดนี้ถูกล็อกหรือปิดแล้ว ต้องปลดล็อกงวดก่อนจึงจะลบได้',
      );
    }

    /*
     * ล้างการอ้างอิงที่ไม่มี FK ก่อนเสมอ
     *
     * HrReviewItem กับ PayrollAdjustment เก็บ periodId เป็น String เปล่า ๆ
     * (index ไว้ ไม่มี foreign key) ถ้าลบงวดทิ้งโดยไม่ล้าง แถวเหล่านั้นจะค้างชี้ไป
     * หางวดที่ไม่มีอยู่แล้วโดยไม่มี error — เคยเกิดจริงตอนลบงวด ก.ค. 2569
     * ผลคือวันลาบนสลิปเป็น 0 และรายการปรับปรุง (เบี้ยเลี้ยง/ค่าปรับ) หลุดจากการคำนวณ
     * ยอดสุทธิขาดไปหลักหมื่นโดยไม่มีอะไรเตือน
     *
     * คืนค่าเป็น null ไม่ใช่ลบทิ้ง — ตัวคำนวณจะหยิบรายการที่ไม่ผูกงวดกลับมาเอง
     * ตามวันที่มีผล งวดถัดไปจึงได้ของพวกนี้ครบเหมือนเดิม
     */
    /* รอบร่างที่ว่างเปล่าต้องไม่มีของอื่นเกาะอยู่ ก่อนจะลบไปพร้อมงวด */
    for (const run of current.runs) {
      await assertNotReferenced(
        this.prisma,
        'payroll_runs',
        run.id,
        `รอบคำนวณ ${run.runNo}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      /* ลบรอบร่างที่ว่างเปล่าไปด้วย ไม่งั้นงวดจะลบไม่ได้เพราะติด FK */
      if (current.runs.length > 0) {
        await tx.payrollRun.deleteMany({
          where: { id: { in: current.runs.map((run) => run.id) } },
        });
      }

      /* ตรวจหลังลบรอบแล้ว จะได้ไม่นับรอบร่างที่กำลังจะหายไปเป็นตัวขวาง */
      await assertNotReferenced(tx, 'payroll_periods', id, 'งวดนี้');

      await tx.hrReviewItem.updateMany({
        where: { periodId: id },
        data: { periodId: null },
      });

      await tx.payrollAdjustment.updateMany({
        where: { periodId: id },
        data: { periodId: null },
      });

      /* ลบแล้วคือลบจริง ไม่เหลืองวดค้างจองรหัสหรือช่วงวันที่ไว้ */
      return tx.payrollPeriod.delete({ where: { id } });
    });
  }


  /* =========================================================
   * EMPLOYEE COMPENSATIONS
   * ฐานเงินเดือน/ค่าจ้าง/โครงสร้างรายได้ของพนักงาน
   * ========================================================= */

  async findCompensations(
    query: EmployeeCompensationQueryDto,
    scope: TenantScope,
  ) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Prisma.EmployeeCompensationWhereInput = {
      deletedAt: null,
    };

    const employeeStatus =
      query.employeeStatus === 'ALL'
        ? undefined
        : ((query.employeeStatus ?? EmployeeStatus.ACTIVE) as EmployeeStatus);
    const employeeWhere: Prisma.EmployeeWhereInput = {
      deletedAt: null,
    };

    if (employeeStatus) employeeWhere.status = employeeStatus;
    if (query.branchId) employeeWhere.branchId = query.branchId;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      where.companyId = scopedCompanyId;
      employeeWhere.companyId = scopedCompanyId;
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
      employeeWhere.id = query.employeeId;
    }

    if (Object.keys(employeeWhere).length > 1) {
      where.employee = employeeWhere;
    }

    if (query.status) {
      where.status = query.status as MasterStatus;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();

      where.OR = [
        {
          employee: {
            employeeCode: { contains: q, mode: 'insensitive' },
          },
        },
        {
          employee: {
            firstName: { contains: q, mode: 'insensitive' },
          },
        },
        {
          employee: {
            lastName: { contains: q, mode: 'insensitive' },
          },
        },
        {
          bankAccountName: { contains: q, mode: 'insensitive' },
        },
        {
          bankAccountNo: { contains: q, mode: 'insensitive' },
        },
      ];
    }

    const whereForStatus = (status: MasterStatus) =>
      query.status && query.status !== status
        ? { ...where, id: '__NO_MATCH__' }
        : { ...where, status };

    const [
      data,
      total,
      active,
      inactive,
      aggregate,
    ] = await this.prisma.$transaction([
      this.prisma.employeeCompensation.findMany({
        where,
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              logoUrl: true,
            },
          },
          employee: {
            select: {
              id: true,
              employeeCode: true,
              nickname: true,
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
        },
      }),
      this.prisma.employeeCompensation.count({ where }),
      this.prisma.employeeCompensation.count({ where: whereForStatus('ACTIVE') }),
      this.prisma.employeeCompensation.count({ where: whereForStatus('INACTIVE') }),
      this.prisma.employeeCompensation.aggregate({
        where,
        _sum: {
          baseSalary: true,
        },
      }),
    ]);

    const totalBaseSalary = Number(aggregate?._sum?.baseSalary ?? 0);

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
      summary: {
        total,
        active,
        inactive,
        totalBaseSalary,
        /*
         * เบี้ยประจำอยู่ที่ "รายการประจำ" แล้ว ไม่ได้อยู่ในตารางฐานเงินเดือน
         * ยอดรวมตรงนี้จึงเป็นเงินเดือนฐานล้วน
         */
        totalCompensationAmount: totalBaseSalary,
      },
    };
  }

  async createCompensation(
    dto: CreateEmployeeCompensationDto,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        companyId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบพนักงานในบริษัทนี้');
    }

    const effectiveDate = toDateOnly(dto.effectiveDate);

    const duplicated = await this.prisma.employeeCompensation.findUnique({
      where: {
        employeeId_effectiveDate: {
          employeeId: dto.employeeId,
          effectiveDate,
        },
      },
    });

    if (duplicated) {
      throw new BadRequestException(
        'พนักงานคนนี้มีข้อมูลค่าตอบแทนในวันที่มีผลนี้แล้ว',
      );
    }

    return this.prisma.employeeCompensation.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        effectiveDate,
        baseSalary: normalizeDecimal(dto.baseSalary),
        salaryBasis: dto.salaryBasis ?? 'MONTHLY',
        paymentMethod: dto.paymentMethod ?? 'BANK_TRANSFER',
        bankName: dto.bankName?.trim() || null,
        bankAccountNo: dto.bankAccountNo?.trim() || null,
        bankAccountName: dto.bankAccountName?.trim() || null,
        socialSecurityEnabled: dto.socialSecurityEnabled ?? true,
        taxEnabled: dto.taxEnabled ?? true,
        status: dto.status ?? 'ACTIVE',
        note: dto.note?.trim() || null,
      },
    });
  }

  async updateCompensation(
    id: string,
    dto: UpdateEmployeeCompensationDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.employeeCompensation.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบข้อมูลค่าตอบแทนพนักงาน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    const effectiveDate = dto.effectiveDate
      ? toDateOnly(dto.effectiveDate)
      : undefined;

    if (
      effectiveDate &&
      effectiveDate.getTime() !== current.effectiveDate.getTime()
    ) {
      const duplicated = await this.prisma.employeeCompensation.findUnique({
        where: {
          employeeId_effectiveDate: {
            employeeId: current.employeeId,
            effectiveDate,
          },
        },
      });

      if (duplicated) {
        throw new BadRequestException(
          'พนักงานคนนี้มีข้อมูลค่าตอบแทนในวันที่มีผลนี้แล้ว',
        );
      }
    }

    return this.prisma.employeeCompensation.update({
      where: { id },
      data: {
        effectiveDate,
        baseSalary:
          dto.baseSalary !== undefined
            ? normalizeDecimal(dto.baseSalary)
            : undefined,
        salaryBasis: dto.salaryBasis,
        paymentMethod: dto.paymentMethod,
        bankName: dto.bankName?.trim() || undefined,
        bankAccountNo: dto.bankAccountNo?.trim() || undefined,
        bankAccountName: dto.bankAccountName?.trim() || undefined,
        socialSecurityEnabled: dto.socialSecurityEnabled,
        taxEnabled: dto.taxEnabled,
        status: dto.status,
        note: dto.note?.trim() || undefined,
      },
    });
  }

  async deleteCompensation(id: string, scope: TenantScope) {
    const current = await this.prisma.employeeCompensation.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        payrollItems: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบข้อมูลค่าตอบแทนพนักงาน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.payrollItems.length > 0) {
      throw new BadRequestException(
        'ข้อมูลนี้ถูกใช้ใน Payroll แล้ว ไม่สามารถลบได้',
      );
    }

    return this.prisma.employeeCompensation.update({
      where: { id },
      data: {
        status: 'INACTIVE',
        deletedAt: new Date(),
      },
    });
  }



  private buildPayrollSettingSnapshot(
    companyId: string,
    settings: PayrollCalculationSettingsValue,
  ) {
    return {
      source: 'company_payroll_settings',
      companyId,
      capturedAt: new Date().toISOString(),
      payrollCutoffDay: settings.payrollCutoffDay,
      payrollPeriodStartDay: settings.payrollPeriodStartDay,
      salaryDivisorDays: settings.salaryDivisorDays,
      workingHoursPerDay: settings.workingHoursPerDay,
      socialSecurityEmployeeRate: settings.socialSecurityEmployeeRate,
      socialSecurityEmployerRate: settings.socialSecurityEmployerRate,
      socialSecurityMinBase: settings.socialSecurityMinBase,
      socialSecurityMaxBase: settings.socialSecurityMaxBase,
    };
  }

  private normalizePayrollRunResponseMode(
    options?: { responseMode?: 'detail' | 'summary' },
  ): 'detail' | 'summary' {
    return options?.responseMode === 'summary' ? 'summary' : 'detail';
  }

  private async findRunActionSummary(id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
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
        period: {
          select: {
            id: true,
            code: true,
            name: true,
            year: true,
            month: true,
            startDate: true,
            endDate: true,
            paymentDate: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        calculatedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        paidBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    return run;
  }

  /* =========================================================
   * PAYROLL RUNS
   * รอบประมวลผลเงินเดือน: create → calculate → review → approve → paid
   * ========================================================= */

  async findRuns(query: PayrollRunQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Prisma.PayrollRunWhereInput = {
      deletedAt: null,
    };

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      where.companyId = scopedCompanyId;
    }

    if (query.branchId) {
      where.items = {
        some: {
          OR: [
            { branchId: query.branchId },
            {
              employee: {
                branchId: query.branchId,
                deletedAt: null,
              },
            },
          ],
        },
      };
    }

    if (query.periodId) {
      where.periodId = query.periodId;
    }

    if (query.status) {
      if (!isSupportedPayrollRunStatus(query.status)) {
        throw new BadRequestException('สถานะ Payroll Run ไม่ถูกต้อง');
      }
      where.status = query.status;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();

      where.OR = [
        { runNo: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { note: { contains: q, mode: 'insensitive' } },
        {
          period: {
            code: { contains: q, mode: 'insensitive' },
          },
        },
        {
          period: {
            name: { contains: q, mode: 'insensitive' },
          },
        },
      ];
    }

    const [data, total, statusGroups, aggregate] = await this.prisma.$transaction([
      this.prisma.payrollRun.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              logoUrl: true,
            },
          },
          period: {
            select: {
              id: true,
              code: true,
              name: true,
              year: true,
              month: true,
              startDate: true,
              endDate: true,
              paymentDate: true,
              status: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          calculatedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          paidBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      this.prisma.payrollRun.count({ where }),
      this.prisma.payrollRun.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.payrollRun.aggregate({
        where,
        _sum: {
          totalEmployees: true,
          totalEarnings: true,
          totalDeductions: true,
          totalGrossPay: true,
          totalNetPay: true,
        },
      }),
    ]);

    const dataWithBranchSummary = await this.attachPayrollBranchSummaries(data);

    return {
      data: dataWithBranchSummary,
      meta: toPageMeta(page, pageSize, total),
      summary: buildPayrollRunStatusSummary(total, statusGroups, aggregate),
    };
  }


  private async attachPayrollBranchSummaries<T extends { id: string }>(runs: T[]) {
    if (!runs.length) return runs.map((run) => ({ ...run, branchSummary: [] }));

    const runIds = runs.map((run) => run.id);
    const items = await (this.prisma as any).payrollItem.findMany({
      where: {
        runId: { in: runIds },
      },
      select: {
        runId: true,
        branchId: true,
        branchCode: true,
        branchName: true,
        totalEarnings: true,
        totalDeductions: true,
        totalGrossPay: true,
        totalNetPay: true,
        absentDays: true,
        lateMinutes: true,
        employee: {
          select: {
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
            type: true,
            sourceType: true,
            amount: true,
          },
        },
      },
    });

    const itemsByRunId = new Map<string, any[]>();
    for (const item of items) {
      const current = itemsByRunId.get(item.runId) ?? [];
      current.push(item);
      itemsByRunId.set(item.runId, current);
    }

    return runs.map((run) => ({
      ...run,
      branchSummary: buildPayrollBranchSummary(itemsByRunId.get(run.id) ?? []),
    }));
  }


  /**
   * @param scope ขอบเขตของผู้เรียก — ต้องส่งเสมอจาก controller
   *
   * ถ้าไม่ตรวจ scope ตรงนี้ ผู้ใช้ระดับบริษัทที่รู้ id ของงวดบริษัทอื่น
   * จะอ่านเงินเดือนรายคนของอีกบริษัทได้ทั้งงวด (และเส้นทาง approve/paid
   * ที่เรียกต่อจากนี้ก็จะสั่งจ่ายข้ามบริษัทได้ด้วย)
   */
  async findRunById(id: string, scope: TenantScope) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            // ใช้ทำหัวจดหมายบนรายงานสรุปรอบ (PDF) ถ้าไม่ดึงมาหัวเอกสารจะเหลือแค่ชื่อ
            logoUrl: true,
            taxId: true,
            address: true,
            phone: true,
            email: true,
          },
        },
        period: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        calculatedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        // ผู้ตรวจต้องแสดงคู่กับผู้อนุมัติเสมอ เพราะกติกาคือต้องไม่ใช่คนเดียวกัน
        reviewedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        paidBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        items: {
          orderBy: {
            employee: {
              employeeCode: 'asc',
            },
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                nickname: true,
                title: true,
                firstName: true,
                lastName: true,
                displayName: true,
                position: true,
                status: true,
                // หน้ารายละเอียดงวดใช้สองค่านี้จัดลำดับแถวตามกติกาลงเวลาของแต่ละคน
                attendanceTrackingRequired: true,
                attendanceExemptSessions: true,
                // ระดับตำแหน่ง — ใช้ดันผู้บริหารขึ้นก่อนในแผนกเดียวกัน
                positionMaster: { select: { level: true } },
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
            compensation: true,
            lines: {
              orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
              include: {
                component: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    return {
      ...run,
      branchSummary: buildPayrollBranchSummary(run.items),
      summary: buildPayrollRunDetailSummary(run),
    };
  }

  /**
   * ตรวจว่า Payroll Run นี้อยู่ในบริษัทของผู้เรียกจริง ก่อนอ่านข้อมูลใด ๆ ของมัน
   *
   * ใช้กับ route อ่านอย่างเดียวที่รับแค่ runId (validation / readiness / audit /
   * source-preview / payslips ฯลฯ) ซึ่งถ้าไม่ตรวจ ผู้ใช้ระดับบริษัทที่รู้ id
   * ของงวดบริษัทอื่นจะอ่านยอดเงินและรายชื่อพนักงานข้ามบริษัทได้
   */
  private async assertRunInScope(runId: string, scope: TenantScope) {
    if (scope.level === 'GLOBAL') return;

    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, deletedAt: null },
      select: { companyId: true },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });
  }

  async findRunValidation(id: string, scope: TenantScope) {
    await this.assertRunInScope(id, scope);

    const validation = await this.buildPayrollRunValidation(id);

    return validation;
  }

  async findRunReadiness(
    id: string,
    scope: TenantScope,
    employeeIds?: string[],
  ) {
    await this.assertRunInScope(id, scope);

    return this.payrollReadinessService.getReadiness(id, employeeIds);
  }

  async findRunLineAudit(id: string, scope: TenantScope) {
    await this.assertRunInScope(id, scope);

    return this.payrollLineAuditService.auditRun(id);
  }

  async findRunSourcePreview(id: string, scope: TenantScope) {
    await this.assertRunInScope(id, scope);

    return this.payrollSourcePreviewService.getRunSourcePreview(id);
  }

  async precheckRun(id: string, scope: TenantScope, employeeIds?: string[]) {
    await this.assertRunInScope(id, scope);

    return this.payrollReadinessService.precheck(id, employeeIds);
  }

  async dryRun(id: string, employeeIds?: string[]) {
    return this.payrollReadinessService.dryRun(id, employeeIds);
  }

  async getRunPayslipPublicationStatus(id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        runNo: true,
        name: true,
        status: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    const rows = await this.prisma.$queryRaw<Array<{
      payslipsPublishedAt: Date | null;
      payslipsPublishedById: string | null;
      payslipsUnpublishedAt: Date | null;
      payslipsUnpublishedById: string | null;
      payslipDetailsVisible: boolean;
      payslipDetailsVisibilityUpdatedAt: Date | null;
      payslipDetailsVisibilityUpdatedById: string | null;
    }>>`
      SELECT
        "payslipsPublishedAt",
        "payslipsPublishedById",
        "payslipsUnpublishedAt",
        "payslipsUnpublishedById",
        "payslipDetailsVisible",
        "payslipDetailsVisibilityUpdatedAt",
        "payslipDetailsVisibilityUpdatedById"
      FROM payroll_runs
      WHERE "id" = ${id}
      LIMIT 1
    `;

    const publication = rows[0] ?? {
      payslipsPublishedAt: null,
      payslipsPublishedById: null,
      payslipsUnpublishedAt: null,
      payslipsUnpublishedById: null,
      payslipDetailsVisible: true,
      payslipDetailsVisibilityUpdatedAt: null,
      payslipDetailsVisibilityUpdatedById: null,
    };

    return {
      run: {
        id: run.id,
        runNo: run.runNo,
        name: run.name,
        status: run.status,
        itemCount: run._count.items,
      },
      isPublished: Boolean(publication.payslipsPublishedAt),
      payslipsPublishedAt: publication.payslipsPublishedAt,
      payslipsPublishedById: publication.payslipsPublishedById,
      payslipsUnpublishedAt: publication.payslipsUnpublishedAt,
      payslipsUnpublishedById: publication.payslipsUnpublishedById,
      payslipDetailsVisible: publication.payslipDetailsVisible,
      payslipDetailsVisibilityUpdatedAt: publication.payslipDetailsVisibilityUpdatedAt,
      payslipDetailsVisibilityUpdatedById: publication.payslipDetailsVisibilityUpdatedById,
    };
  }

  async publishRunPayslips(id: string, scope: TenantScope, userId?: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        companyId: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    if (!['APPROVED', 'PAID'].includes(run.status)) {
      throw new BadRequestException('เผยแพร่สลิปได้เฉพาะ Payroll Run ที่ APPROVED หรือ PAID แล้วเท่านั้น');
    }

    if (run._count.items <= 0) {
      throw new BadRequestException('Payroll Run นี้ยังไม่มีรายการพนักงาน จึงเผยแพร่สลิปไม่ได้');
    }

    await this.assertPayrollRunValidationPassed(id, 'PUBLISH');

    await this.prisma.$executeRaw`
      UPDATE payroll_runs
      SET
        "payslipsPublishedAt" = NOW(),
        "payslipsPublishedById" = ${userId ?? null},
        "payslipsUnpublishedAt" = NULL,
        "payslipsUnpublishedById" = NULL,
        "payslipDetailsVisible" = TRUE,
        "payslipDetailsVisibilityUpdatedAt" = NOW(),
        "payslipDetailsVisibilityUpdatedById" = ${userId ?? null},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    return this.getRunPayslipPublicationStatus(id);
  }

  async unpublishRunPayslips(id: string, scope: TenantScope, userId?: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        companyId: true,
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    if (run.status === 'PAID') {
      throw new BadRequestException(
        'Payroll Run ที่บันทึกจ่ายเงินแล้วถือเป็นข้อมูลปลายทาง ไม่สามารถยกเลิกเผยแพร่สลิปได้',
      );
    }

    if (run.status !== 'APPROVED') {
      throw new BadRequestException(
        'ยกเลิกเผยแพร่สลิปได้เฉพาะ Payroll Run ที่ APPROVED และยังไม่ถูกบันทึกจ่ายเงินเท่านั้น',
      );
    }

    const publication = await this.getRunPayslipPublicationStatus(id);

    if (!publication.isPublished) {
      throw new BadRequestException('Payroll Run นี้ยังไม่ได้เผยแพร่สลิปเงินเดือน');
    }

    await this.prisma.$executeRaw`
      UPDATE payroll_runs
      SET
        "payslipsPublishedAt" = NULL,
        "payslipsPublishedById" = NULL,
        "payslipsUnpublishedAt" = NOW(),
        "payslipsUnpublishedById" = ${userId ?? null},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    return this.getRunPayslipPublicationStatus(id);
  }

  async setRunPayslipDetailsVisibility(
    id: string,
    visible: boolean,
    userId?: string,
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    if (!['APPROVED', 'PAID'].includes(run.status)) {
      throw new BadRequestException(
        'ควบคุมการแสดงสลิปใน ESS ได้เฉพาะ Payroll Run ที่ APPROVED หรือ PAID แล้วเท่านั้น',
      );
    }

    if (run._count.items <= 0) {
      throw new BadRequestException('Payroll Run นี้ยังไม่มีรายการพนักงาน จึงควบคุมการแสดงสลิปใน ESS ไม่ได้');
    }

    await this.prisma.$executeRaw`
      UPDATE payroll_runs
      SET
        "payslipDetailsVisible" = ${visible},
        "payslipDetailsVisibilityUpdatedAt" = NOW(),
        "payslipDetailsVisibilityUpdatedById" = ${userId ?? null},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    return this.getRunPayslipPublicationStatus(id);
  }

  private async assertPayrollRunValidationPassed(
    id: string,
    action: 'REVIEW' | 'APPROVE' | 'PAID' | 'PUBLISH',
  ) {
    const validation = await this.buildPayrollRunValidation(id);
    const blockingChecks = validation.checks.filter((check: any) => check.blocking);

    if (blockingChecks.length > 0) {
      const message = blockingChecks
        .slice(0, 4)
        .map((check: any) => `${check.title}${check.count ? ` (${check.count})` : ''}`)
        .join(', ');

      throw new BadRequestException(
        action === 'REVIEW'
          ? `ยังตรวจสอบ Payroll Run ไม่ได้ กรุณาแก้ไขประเด็นสำคัญก่อน: ${message}`
          : action === 'APPROVE'
            ? `ยังอนุมัติ Payroll Run ไม่ได้ กรุณาแก้ไขประเด็นสำคัญก่อน: ${message}`
            : action === 'PAID'
            ? `ยังบันทึกจ่ายเงินไม่ได้ กรุณาแก้ไขประเด็นสำคัญก่อน: ${message}`
            : `ยังเผยแพร่สลิปไม่ได้ กรุณาแก้ไขประเด็นสำคัญก่อน: ${message}`,
      );
    }

    if (action === 'PAID' && !validation.summary.isPayable) {
      throw new BadRequestException(
        'Payroll Run ยังไม่พร้อมบันทึกจ่ายเงิน กรุณาตรวจ Validation อีกครั้ง',
      );
    }
  }

  private async buildPayrollRunValidation(id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
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
          orderBy: {
            employee: {
              employeeCode: 'asc',
            },
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                nickname: true,
                title: true,
                firstName: true,
                lastName: true,
                displayName: true,
                position: true,
                status: true,
                // หน้ารายละเอียดงวดใช้สองค่านี้จัดลำดับแถวตามกติกาลงเวลาของแต่ละคน
                attendanceTrackingRequired: true,
                attendanceExemptSessions: true,
                // ระดับตำแหน่ง — ใช้ดันผู้บริหารขึ้นก่อนในแผนกเดียวกัน
                positionMaster: { select: { level: true } },
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
            compensation: true,
            lines: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    const checks: any[] = [];
    const pushCheck = (params: {
      code: string;
      title: string;
      description: string;
      severity?: 'CRITICAL' | 'WARNING' | 'INFO';
      status?: 'PASS' | 'FAIL' | 'WARN' | 'INFO';
      count?: number;
      blocking?: boolean;
      items?: any[];
      recommendation?: string;
    }) => {
      const status = params.status ?? 'PASS';
      const severity = params.severity ?? (status === 'FAIL' ? 'CRITICAL' : status === 'WARN' ? 'WARNING' : 'INFO');

      checks.push({
        code: params.code,
        title: params.title,
        description: params.description,
        severity,
        status,
        count: params.count ?? 0,
        blocking: Boolean(params.blocking ?? (severity === 'CRITICAL' && status === 'FAIL')),
        recommendation: params.recommendation ?? null,
        items: params.items ?? [],
      });
    };

    // หน้าจอ HR — ต่อชื่อเล่นให้เหมือนทุกหน้า (เอกสารทางการไม่ผ่านตรงนี้)
    const getEmployeeName = (employee: any) => employeeDisplayName(employee);

    const employeeIds = run.items.map((item: any) => item.employeeId);
    const employeeItem = (item: any, detail: string, amount?: string | number | null) => ({
      employeeId: item.employee?.id ?? item.employeeId,
      employeeCode: item.employee?.employeeCode ?? '-',
      employeeName: item.employee ? getEmployeeName(item.employee) : '-',
      departmentName: item.employee?.department?.nameTh ?? item.employee?.branch?.nameTh ?? null,
      detail,
      amount: amount == null ? null : toMoneyString(amount),
    });

    if (run._count.items <= 0) {
      pushCheck({
        code: 'PAYROLL_ITEMS_REQUIRED',
        title: 'ยังไม่มีรายการพนักงานใน Payroll Run',
        description: 'ต้องคำนวณ Payroll Run เพื่อสร้างรายการพนักงานก่อนตรวจหรืออนุมัติ',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        recommendation: 'กดคำนวณ Payroll Run ก่อน แล้วตรวจรายการอีกครั้ง',
      });
    } else {
      pushCheck({
        code: 'PAYROLL_ITEMS_REQUIRED',
        title: 'มีรายการพนักงานใน Payroll Run แล้ว',
        description: `พบรายการพนักงาน ${run._count.items} รายการ`,
        status: 'PASS',
        count: run._count.items,
      });
    }

    if (Number(run.totalNetPay || 0) <= 0) {
      pushCheck({
        code: 'TOTAL_NET_PAY_REQUIRED',
        title: 'ยอดจ่ายสุทธิรวมยังไม่ถูกต้อง',
        description: 'Payroll Run ต้องมียอดเงินสุทธิรวมมากกว่า 0 ก่อนอนุมัติ',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        recommendation: 'ตรวจค่าตอบแทนและคำนวณ Payroll Run ใหม่',
      });
    } else {
      pushCheck({
        code: 'TOTAL_NET_PAY_REQUIRED',
        title: 'ยอดจ่ายสุทธิรวมพร้อมตรวจแล้ว',
        description: `ยอดสุทธิรวม ${toMoneyString(run.totalNetPay)} บาท`,
        status: 'PASS',
      });
    }

    const invalidStatusesForApproval = run.items.filter(
      (item: any) => !['CALCULATED', 'REVIEWED', 'APPROVED', 'PAID'].includes(item.status),
    );
    if (invalidStatusesForApproval.length > 0) {
      pushCheck({
        code: 'PAYROLL_ITEM_STATUS_READY',
        title: 'มีรายการพนักงานที่สถานะยังไม่พร้อม',
        description: 'รายการพนักงานต้องอยู่สถานะ CALCULATED หรือ REVIEWED ก่อนอนุมัติ',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        count: invalidStatusesForApproval.length,
        items: invalidStatusesForApproval.slice(0, 20).map((item: any) =>
          employeeItem(item, `สถานะปัจจุบัน ${item.status}`),
        ),
        recommendation: 'คำนวณ Payroll Run ใหม่ หรือแก้ไขรายการที่ยังไม่พร้อม',
      });
    } else {
      pushCheck({
        code: 'PAYROLL_ITEM_STATUS_READY',
        title: 'สถานะรายการพนักงานพร้อมแล้ว',
        description: 'รายการพนักงานอยู่ในสถานะที่ตรวจ/อนุมัติได้',
        status: 'PASS',
      });
    }

    const missingCompensations = run.items.filter((item: any) => !item.compensationId && !item.compensation);
    if (missingCompensations.length > 0) {
      pushCheck({
        code: 'EMPLOYEE_COMPENSATION_REQUIRED',
        title: 'มีพนักงานที่ยังไม่มีฐานเงินเดือน',
        description: 'Payroll ไม่ควรอนุมัติถ้ายังมีพนักงานไม่มีค่าตอบแทน/ฐานเงินเดือน',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        count: missingCompensations.length,
        items: missingCompensations.slice(0, 20).map((item: any) =>
          employeeItem(item, 'ยังไม่มี Employee Compensation'),
        ),
        recommendation: 'ไปที่ Payroll > Compensation แล้วเพิ่มฐานเงินเดือนให้ครบ',
      });
    } else {
      pushCheck({
        code: 'EMPLOYEE_COMPENSATION_REQUIRED',
        title: 'พนักงานมีฐานเงินเดือนครบแล้ว',
        description: 'ไม่พบพนักงานที่ขาดข้อมูลค่าตอบแทนใน Payroll Run นี้',
        status: 'PASS',
      });
    }

    const negativeNetPayItems = run.items.filter((item: any) => Number(item.totalNetPay || 0) < 0);
    if (negativeNetPayItems.length > 0) {
      pushCheck({
        code: 'NET_PAY_NOT_NEGATIVE',
        title: 'มีเงินสุทธิติดลบ',
        description: 'เงินสุทธิรายคนติดลบควรถูกตรวจสอบก่อนอนุมัติ',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        count: negativeNetPayItems.length,
        items: negativeNetPayItems.slice(0, 20).map((item: any) =>
          employeeItem(item, 'เงินสุทธิติดลบ', item.totalNetPay),
        ),
        recommendation: 'ตรวจรายการหัก/adjustment ของพนักงานกลุ่มนี้',
      });
    } else {
      pushCheck({
        code: 'NET_PAY_NOT_NEGATIVE',
        title: 'ไม่พบเงินสุทธิติดลบ',
        description: 'ยอดสุทธิรายคนไม่ติดลบ',
        status: 'PASS',
      });
    }

    const integrityIssues = this.collectPayrollRunIntegrityIssues(run);
    if (integrityIssues.length > 0) {
      pushCheck({
        code: 'PAYROLL_TOTALS_RECONCILED',
        title: 'ยอด Payroll Item / Line / Run ไม่ตรงกัน',
        description:
          'ยอดรวมจาก PayrollLine ต้องตรงกับ PayrollItem และยอดรวมของ PayrollItem ต้องตรงกับ PayrollRun ก่อนตรวจ/อนุมัติ/จ่ายเงิน',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        count: integrityIssues.length,
        items: integrityIssues.slice(0, 30),
        recommendation:
          'กดคำนวณ Payroll Run ใหม่ หากยังไม่หายให้ตรวจ line audit และรายการปรับปรุงของพนักงานที่พบปัญหา',
      });
    } else if (run._count.items > 0) {
      pushCheck({
        code: 'PAYROLL_TOTALS_RECONCILED',
        title: 'ยอด Payroll Item / Line / Run ตรงกัน',
        description:
          'ยอดรายได้ รายหัก ยอดสุทธิ และยอดรวมของ Run ตรงกับรายการพนักงานและ line แล้ว',
        status: 'PASS',
      });
    }

    const attendanceRows = await this.buildAttendanceDeductionRows(this.prisma, run);
    const attendanceTotals = this.sumAttendanceDeductionRows(attendanceRows);
    const needsImportRows = attendanceRows.filter((row: any) => row.status === 'NEEDS_IMPORT');
    const noSummaryRows = attendanceRows.filter((row: any) => row.status === 'NO_SUMMARY');

    if (needsImportRows.length > 0) {
      pushCheck({
        code: 'ATTENDANCE_DEDUCTIONS_IMPORTED',
        title: 'ยอดหัก Attendance ยังไม่ตรงกับ Payroll',
        description: 'มี daily summary ที่ยอดหักไม่ตรงกับ Payroll Line ที่นำเข้าอยู่ จึงต้อง import/recalculate ก่อนอนุมัติ',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        count: needsImportRows.length,
        items: needsImportRows.slice(0, 20).map((row: any) => ({
          employeeId: row.employee?.id,
          employeeCode: row.employee?.employeeCode ?? '-',
          employeeName: row.employee ? getEmployeeName(row.employee) : '-',
          departmentName: row.employee?.department?.nameTh ?? row.employee?.branch?.nameTh ?? null,
          detail: `ควรนำเข้า ${row.payrollAttendanceDeductionAmount} บาท / นำเข้าแล้ว ${row.importedDeductionAmount} บาท`,
          amount: row.payrollAttendanceDeductionAmount,
        })),
        recommendation: 'กด “ดึงข้อมูลเข้าเงินเดือนใหม่” เพื่อซิงก์ Attendance / Leave / HR Review และคำนวณ Payroll Run ใหม่',
      });
    } else if (attendanceRows.length > 0) {
      pushCheck({
        code: 'ATTENDANCE_DEDUCTIONS_IMPORTED',
        title: 'ยอดหัก Attendance ตรงกับ Payroll แล้ว',
        description: 'ไม่พบรายการที่ต้อง import เพิ่มจาก attendance_daily_summaries',
        status: 'PASS',
        count: attendanceRows.length,
      });
    }

    if (noSummaryRows.length > 0) {
      pushCheck({
        code: 'ATTENDANCE_DAILY_SUMMARY_EXISTS',
        title: 'มีพนักงานที่ยังไม่มี Attendance Daily Summary',
        description: 'บางคนยังไม่มี daily summary ในช่วงงวด อาจเป็นพนักงานใหม่/ไม่มี log หรือยังไม่ได้ recalculate attendance',
        status: 'WARN',
        severity: 'WARNING',
        blocking: false,
        count: noSummaryRows.length,
        items: noSummaryRows.slice(0, 20).map((row: any) => ({
          employeeId: row.employee?.id,
          employeeCode: row.employee?.employeeCode ?? '-',
          employeeName: row.employee ? getEmployeeName(row.employee) : '-',
          departmentName: row.employee?.department?.nameTh ?? row.employee?.branch?.nameTh ?? null,
          detail: 'ไม่พบ daily summary ในช่วงงวด',
          amount: null,
        })),
        recommendation: 'ถ้าควรมีข้อมูล ให้ไปหน้า /attendance แล้วคำนวณช่วงวันที่ของงวดนี้ก่อน',
      });
    } else if (attendanceRows.length > 0) {
      pushCheck({
        code: 'ATTENDANCE_DAILY_SUMMARY_EXISTS',
        title: 'พบ Attendance Daily Summary ครบตามรายการที่ตรวจได้',
        description: `พบ daily summary รวม ${attendanceTotals.dailySummaryCount} รายการ`,
        status: 'PASS',
        count: attendanceTotals.dailySummaryCount,
      });
    }

    const approvedAdjustments = await this.payrollSourcePreviewService.countMatchedApprovedAdjustments(
      this.prisma,
      {
        companyId: run.companyId,
        employeeIds,
        periodId: run.periodId,
        periodStartDate: run.period.startDate,
        periodEndDate: run.period.endDate,
      },
    );

    if (approvedAdjustments > 0) {
      pushCheck({
        code: 'APPROVED_ADJUSTMENTS_IMPORTED',
        title: 'มี Adjustment ที่อนุมัติแล้วแต่ยังไม่ถูก import',
        description: 'รายการปรับปรุงเงินเดือนที่ APPROVED ควรถูกนำเข้า Payroll Run ก่อนอนุมัติ',
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        count: approvedAdjustments,
        recommendation: 'นำเข้า adjustment/recalculate Payroll Run อีกครั้งก่อนอนุมัติ',
      });
    } else {
      pushCheck({
        code: 'APPROVED_ADJUSTMENTS_IMPORTED',
        title: 'ไม่พบ Adjustment ค้างนำเข้า',
        description: 'ไม่มี adjustment สถานะ APPROVED ที่ยังรอนำเข้าในงวดนี้',
        status: 'PASS',
      });
    }

    const attendanceComponentCodes = [
      'LATE_DEDUCTION',
      'MISSING_LOG_DEDUCTION',
      'EARLY_LEAVE_DEDUCTION',
      'ABSENCE_DEDUCTION',
      'ATTENDANCE_UNPAID_LEAVE_DEDUCTION',
    ];
    const activeAttendanceComponents = await (this.prisma as any).payrollComponent.findMany({
      where: {
        companyId: run.companyId,
        code: { in: attendanceComponentCodes },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        code: true,
      },
    });
    const activeComponentCodeSet = new Set(activeAttendanceComponents.map((component: any) => component.code));
    const missingAttendanceComponentCodes = attendanceComponentCodes.filter((code) => !activeComponentCodeSet.has(code));

    if (Number(attendanceTotals.payrollAttendanceDeductionAmount || 0) > 0 && missingAttendanceComponentCodes.length > 0) {
      pushCheck({
        code: 'ATTENDANCE_COMPONENT_MAPPING',
        title: 'Payroll Component สำหรับ Attendance ยังไม่ครบ',
        description: `ยังไม่มี component active สำหรับ ${missingAttendanceComponentCodes.join(', ')} ระบบยังสร้าง line ได้ แต่ componentId จะว่าง`,
        status: 'WARN',
        severity: 'WARNING',
        blocking: false,
        count: missingAttendanceComponentCodes.length,
        recommendation: 'เพิ่ม/เปิดใช้งาน Payroll Component สำหรับรายการหัก Attendance เพื่อให้ mapping สมบูรณ์',
      });
    } else {
      pushCheck({
        code: 'ATTENDANCE_COMPONENT_MAPPING',
        title: 'Payroll Component สำหรับ Attendance พร้อมใช้งาน',
        description: 'ไม่พบปัญหา component mapping ที่กระทบยอดหัก attendance',
        status: 'PASS',
      });
    }

    const taxEnabledItems = run.items.filter((item: any) => Boolean(item.compensation?.taxEnabled));
    const taxLineItems = run.items.filter((item: any) =>
      item.lines.some((line: any) => line.sourceType === 'TAX' && Number(line.amount || 0) > 0),
    );

    /*
     * กรณีที่อันตรายที่สุดคือ "บางคน" ไม่ถูกหักภาษี ไม่ใช่ "ไม่มีใครถูกหักเลย"
     *
     * เงื่อนไขเดิมเช็คแค่ taxLineItems.length === 0 (ไม่มีใครเลย) ทำให้ถ้า
     * 7 ใน 8 คนถูกหักภาษี อีก 1 คนไม่ถูกหักเพราะข้อมูลภาษีไม่พร้อม
     * ระบบจะเข้า branch PASS เงียบสนิท แล้วอนุมัติจ่ายได้ตามปกติ
     * ผลคือหักภาษีขาดเฉพาะคนนั้น และ ภ.ง.ด.1 ออกมาไม่ตรงกับที่จ่ายจริง
     *
     * ตัวนี้จึงหาคนที่ "เปิดคิดภาษีไว้ แต่ไม่มีบรรทัดภาษี" เป็นรายคน
     * และตั้งเป็น blocking เพราะเป็นความผิดทางภาษีที่ย้อนแก้ยากหลังจ่ายเงินแล้ว
     */
    const taxLineItemIds = new Set(taxLineItems.map((item: any) => item.id));

    /*
     * "ภาษี 0 บาท" กับ "ยังไม่ได้คำนวณภาษี" ต่างกันคนละเรื่อง
     *
     * ลูกจ้างส่วนใหญ่ของ SME ไทยเงินได้ไม่ถึงเกณฑ์ ภาษีเป็น 0 คือคำตอบที่ถูก
     * ถ้าเหมาว่าใครไม่มีบรรทัดภาษี = ข้อมูลไม่พร้อม จะบล็อกการอนุมัติทุกงวด
     * ที่มีคนจ่ายภาษีแค่บางคน ซึ่งเป็นรูปแบบปกติของแทบทุกบริษัท
     *
     * ตัวชี้ขาดคือมีผลการคำนวณภาษีของงวดนี้เก็บไว้หรือไม่
     *   มีแถว + ยอด 0  = เครื่องคิดภาษีทำงานแล้วและได้ 0 จริง ผ่านได้
     *   ไม่มีแถวเลย     = ยังไม่ได้คำนวณ ต้องบล็อกไว้ก่อน
     */
    const taxCalculatedEmployeeIds = new Set(
      (
        await (this.prisma as any).payrollTaxCalculation.findMany({
          where: { payrollRunId: run.id },
          select: { employeeId: true },
        })
      ).map((row: any) => row.employeeId),
    );

    const taxEnabledWithoutLine = taxEnabledItems.filter(
      (item: any) =>
        !taxLineItemIds.has(item.id) &&
        !taxCalculatedEmployeeIds.has(item.employeeId),
    );

    if (taxEnabledItems.length > 0 && taxEnabledWithoutLine.length > 0 && taxLineItems.length > 0) {
      pushCheck({
        code: 'PAYROLL_TAX_LINE_MISSING',
        title: 'มีพนักงานบางคนที่ไม่ถูกหักภาษี',
        description: `${taxEnabledWithoutLine.length} คนเปิดคิดภาษีไว้ แต่รอบนี้ไม่มีทั้งบรรทัดภาษีและผลการคำนวณภาษี แปลว่าเครื่องคิดภาษียังไม่ได้ทำงานให้คนกลุ่มนี้`,
        status: 'FAIL',
        severity: 'CRITICAL',
        blocking: true,
        count: taxEnabledWithoutLine.length,
        items: taxEnabledWithoutLine.slice(0, 20).map((item: any) =>
          employeeItem(item, 'เปิดคิดภาษี แต่ไม่มีบรรทัดภาษีในรอบนี้'),
        ),
        recommendation:
          'ไปที่ ภาษีหัก ณ ที่จ่าย › ข้อมูลภาษีพนักงาน แล้วบันทึกให้ครบ จากนั้นคำนวณงวดใหม่ (คนที่ภาษีคำนวณได้ 0 บาทจริงไม่เข้าข่ายรายการนี้)',
      });
    }

    if (taxEnabledItems.length > 0 && taxLineItems.length === 0) {
      pushCheck({
        code: 'PAYROLL_TAX_SOURCE_STATUS',
        title: 'ยังไม่มียอดภาษีหัก ณ ที่จ่ายในรอบนี้',
        description:
          'ระบบ Tax Engine ยังไม่สร้างยอดภาษี อาจเป็นเพราะภาษีคำนวณได้ 0 บาท หรือยังไม่มีข้อมูลภาษีพนักงานที่พร้อมใช้สำหรับพนักงานบางคน',
        status: 'WARN',
        severity: 'WARNING',
        blocking: false,
        count: taxEnabledItems.length,
        items: taxEnabledItems.slice(0, 20).map((item: any) =>
          employeeItem(item, 'เปิดคิดภาษี แต่ยังไม่มียอดภาษีใน Payroll Run นี้'),
        ),
        recommendation:
          'ตรวจข้อมูลภาษีพนักงาน / ค่าลดหย่อน / ผลทดลองภาษี หากงวดนี้ภาษีเป็น 0 บาทจริง สามารถรับทราบและดำเนินการต่อได้',
      });
    } else if (taxLineItems.length > 0) {
      pushCheck({
        code: 'PAYROLL_TAX_SOURCE_STATUS',
        title: 'คำนวณภาษีหัก ณ ที่จ่ายแล้ว',
        description: 'ระบบสร้าง PayrollLine TAX จาก Tax Engine และนำยอดภาษีไปหักจากเงินสุทธิแล้ว',
        status: 'PASS',
        count: taxLineItems.length,
      });
    } else {
      pushCheck({
        code: 'PAYROLL_TAX_SOURCE_STATUS',
        title: 'ยังไม่เปิดใช้รายการภาษีใน Run นี้',
        description: 'ไม่พบพนักงานที่เปิด taxEnabled และไม่พบ TAX Line จึงแสดงภาษีเป็น 0 ตามข้อมูลจริง',
        status: 'INFO',
        severity: 'INFO',
        blocking: false,
      });
    }

    const publication = await this.getRunPayslipPublicationStatus(id);
    if (['APPROVED', 'PAID'].includes(run.status) && !publication.isPublished) {
      pushCheck({
        code: 'PAYSLIPS_PUBLISHED',
        title: 'ยังไม่ได้เผยแพร่สลิปเงินเดือน',
        description: 'Payroll Run นี้อนุมัติหรือจ่ายแล้ว แต่ยังไม่ได้ publish payslips ให้พนักงานดูใน ESS',
        status: 'WARN',
        severity: 'WARNING',
        blocking: false,
        recommendation: 'กด Publish Payslips เมื่อพร้อมให้พนักงานดูสลิปใน ESS',
      });
    } else if (['APPROVED', 'PAID'].includes(run.status)) {
      pushCheck({
        code: 'PAYSLIPS_PUBLISHED',
        title: 'เผยแพร่สลิปเงินเดือนแล้ว',
        description: 'พนักงานสามารถดูสลิปที่ ESS ได้ตามสิทธิ์',
        status: 'PASS',
      });
    }

    const criticalCount = checks.filter((check) => check.status === 'FAIL' && check.severity === 'CRITICAL').length;
    const warningCount = checks.filter((check) => check.status === 'WARN').length;
    const infoCount = checks.filter((check) => check.status === 'INFO').length;
    const blockingCount = checks.filter((check) => check.blocking).length;

    return {
      run: {
        id: run.id,
        runNo: run.runNo,
        name: run.name,
        status: run.status,
        company: run.company,
        period: run.period,
      },
      summary: {
        isApprovable: blockingCount === 0 && ['CALCULATED', 'REVIEWED', 'APPROVED', 'PAID'].includes(run.status),
        isPayable: blockingCount === 0 && ['APPROVED', 'PAID'].includes(run.status),
        criticalCount,
        warningCount,
        infoCount,
        blockingCount,
        checkedAt: new Date().toISOString(),
      },
      attendance: {
        totals: attendanceTotals,
      },
      payslipPublication: publication,
      checks,
    };
  }

  async createRun(
    dto: CreatePayrollRunDto,
    userId?: string,
    scope?: TenantScope,
  ) {
    const companyId = scope
      ? requireCompanyId(scope, dto.companyId)
      : dto.companyId;
    const company = await this.assertCompany(companyId);

    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id: dto.periodId,
        companyId,
        deletedAt: null,
      },
    });

    if (!period) {
      throw new NotFoundException('ไม่พบงวดเงินเดือนในบริษัทนี้');
    }

    if (['LOCKED', 'CLOSED', 'CANCELLED'].includes(period.status)) {
      throw new BadRequestException(
        'งวดเงินเดือนนี้ถูกล็อก ปิด หรือยกเลิกแล้ว ไม่สามารถสร้าง Payroll Run ได้',
      );
    }

    const runNo =
      dto.runNo?.trim().toUpperCase() ||
      (await this.generateRunNo(period.id, period.code, company.code));

    const duplicated = await this.prisma.payrollRun.findUnique({
      where: {
        periodId_runNo: {
          periodId: period.id,
          runNo,
        },
      },
    });

    if (duplicated) {
      throw new BadRequestException('เลขที่ Payroll Run นี้มีอยู่แล้วในงวดนี้');
    }

    await this.ensureDefaultPayrollComponents(companyId);

    /*
     * ตรวจว่าสาขาที่เลือกเป็นของบริษัทนี้จริง
     * ถ้าไม่ตรวจแล้วส่ง id มั่วมา รอบจะคำนวณได้ 0 คนโดยไม่มีใครรู้ว่าเพราะอะไร
     */
    const branchIds = await this.resolveRunBranchIds(companyId, dto.branchIds);

    return this.prisma.payrollRun.create({
      data: {
        branchIds,
        companyId,
        periodId: dto.periodId,
        runNo,
        name: dto.name?.trim() || `Payroll Run ${runNo}`,
        note: dto.note?.trim() || null,
        status: 'DRAFT',
        createdById: userId ?? null,
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
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
  }

  async calculateRun(
    id: string,
    scope: TenantScope,
    dto: CalculatePayrollRunDto,
    userId?: string,
    options?: { responseMode?: 'detail' | 'summary' },
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        period: true,
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    if (isLockedForCalculation(run.status)) {
      throw new BadRequestException(
        'Payroll Run ที่ตรวจสอบ อนุมัติ จ่ายแล้ว หรือยกเลิกแล้ว ไม่สามารถคำนวณใหม่ได้',
      );
    }

    if (['LOCKED', 'CLOSED', 'CANCELLED'].includes(run.period.status)) {
      throw new BadRequestException(
        'งวดเงินเดือนนี้ถูกล็อก ปิด หรือยกเลิกแล้ว ไม่สามารถคำนวณเงินเดือนได้',
      );
    }

    this.payrollProgressService.start(id, {
      operation: 'CALCULATION',
      step: 'PREPARE',
      message: 'เตรียมข้อมูลรอบเงินเดือน',
      percent: 3,
    });
    let calculationStarted = false;

    try {
      this.payrollProgressService.update(id, {
        step: 'ENSURE_COMPONENTS',
        message: 'ตรวจสอบ Payroll Component มาตรฐาน',
        percent: 8,
      });
      await this.ensureDefaultPayrollComponents(run.companyId);

      this.payrollProgressService.update(id, {
        step: 'READINESS',
        message: 'ตรวจสอบความพร้อมก่อนคำนวณ',
        percent: 14,
      });
      await this.payrollReadinessService.assertReadyForCalculation(id, dto.employeeIds);

      this.payrollProgressService.update(id, {
        step: 'RUN_STATUS',
        message: 'เปลี่ยนสถานะรอบเงินเดือนเป็นกำลังคำนวณ',
        percent: 20,
      });
      await this.prisma.payrollRun.update({
        where: { id },
        data: {
          status: 'CALCULATING',
          errorMessage: null,
        },
      });
      calculationStarted = true;

      const result = await this.calculateRunInsideTransaction({
        runId: id,
        scope,
        /* ขอบเขตสาขาถูกตรึงไว้ตั้งแต่ตอนสร้างรอบ กดคำนวณซ้ำกี่ครั้งก็ได้ชุดเดิม */
        branchIds: run.branchIds ?? [],
        companyId: run.companyId,
        periodId: run.periodId,
        periodStartDate: run.period.startDate,
        periodEndDate: run.period.endDate,
        paymentDate: run.period.paymentDate,
        employeeIds: dto.employeeIds,
        userId,
        responseMode: this.normalizePayrollRunResponseMode(options),
      });

      this.payrollProgressService.complete(id, 'คำนวณ Payroll Run เสร็จสิ้น');

      return result;
    } catch (error) {
      const errorMessage = this.toPayrollCalculationErrorMessage(error);

      if (calculationStarted) {
        await this.prisma.payrollRun.update({
          where: { id },
          data: {
            status: 'FAILED',
            errorMessage,
          },
        });
      }

      this.payrollProgressService.fail(id, errorMessage);

      if (this.isPrismaTransactionTimeoutError(error)) {
        throw new BadRequestException(errorMessage);
      }

      throw error;
    }
  }

  async cancelRun(
    id: string,
    scope: TenantScope,
    dto: CancelPayrollRunDto,
    userId?: string,
    options?: { responseMode?: 'detail' | 'summary' },
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    if (run.status === 'PAID' || run.status === 'APPROVED') {
      throw new BadRequestException(
        'Payroll Run ที่อนุมัติหรือจ่ายแล้ว ไม่สามารถยกเลิกได้',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: userId ?? null,
          note: dto.reason
            ? [run.note, `Cancel reason: ${dto.reason}`]
                .filter(Boolean)
                .join('\n')
            : run.note,
        },
      });

      await (tx as any).hrReviewItem.updateMany({
        where: {
          payrollRunId: id,
          status: 'SENT_TO_PAYROLL',
        },
        data: {
          status: 'PAYROLL_READY',
          payrollRunId: null,
          sentToPayrollAt: null,
          sentToPayrollById: null,
        },
      });

      await (tx as any).payrollAdjustment.updateMany({
        where: {
          payrollRunId: id,
          status: 'IMPORTED',
          deletedAt: null,
        },
        data: {
          status: 'APPROVED',
          payrollRunId: null,
          importedAt: null,
          importedById: null,
        },
      });

      await (tx as any).attendanceDailySummary.updateMany({
        where: {
          payrollRunId: id,
          lockedAt: null,
        },
        data: {
          reviewStatus: 'READY_FOR_PAYROLL',
          payrollRunId: null,
          sentToPayrollAt: null,
          sentToPayrollById: null,
        },
      });

      await (tx as any).attendanceDailySummary.updateMany({
        where: {
          payrollRunId: id,
          lockedAt: { not: null },
        },
        data: {
          reviewStatus: 'LOCKED',
          payrollRunId: null,
          sentToPayrollAt: null,
          sentToPayrollById: null,
        },
      });
    });

    return this.normalizePayrollRunResponseMode(options) === 'summary'
      ? this.findRunActionSummary(id)
      : this.findRunById(id, scope);
  }

  async reviewRun(
    id: string,
    scope: TenantScope,
    dto: ReviewPayrollRunDto,
    userId?: string,
    options?: { responseMode?: 'detail' | 'summary' },
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    if (run.status !== 'CALCULATED') {
      throw new BadRequestException(
        'Payroll Run ต้องอยู่สถานะ CALCULATED ก่อนจึงจะตรวจสอบได้',
      );
    }

    if (run._count.items <= 0) {
      throw new BadRequestException(
        'Payroll Run นี้ยังไม่มีรายการพนักงาน กรุณาคำนวณก่อน',
      );
    }

    await this.assertPayrollRunValidationPassed(id, 'REVIEW');

    // transaction เดียวกัน + เงื่อนไขสถานะบน run เพื่อกันกดซ้ำพร้อมกัน
    await this.prisma.$transaction(async (tx) => {
      const marked = await tx.payrollRun.updateMany({
        where: { id, status: 'CALCULATED' },
        data: {
          status: 'REVIEWED',
          reviewedAt: new Date(),
          reviewedById: userId ?? null,
          note: appendPayrollNote(
            run.note,
            dto.note || `Reviewed by ${userId ?? 'system'}`,
          ),
        },
      });

      if (marked.count === 0) {
        throw new BadRequestException(
          'Payroll Run นี้ถูกตรวจสอบไปแล้ว หรือสถานะเปลี่ยนไประหว่างดำเนินการ',
        );
      }

      await tx.payrollItem.updateMany({
        where: {
          runId: id,
          status: 'CALCULATED',
        },
        data: {
          status: 'REVIEWED',
        },
      });
    });

    return this.normalizePayrollRunResponseMode(options) === 'summary'
      ? this.findRunActionSummary(id)
      : this.findRunById(id, scope);
  }

  async approveRun(
    id: string,
    scope: TenantScope,
    dto: ApprovePayrollRunDto,
    userId?: string,
    options?: { responseMode?: 'detail' | 'summary' },
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    /*
     * แยกหน้าที่ในขั้นจ่ายเงิน
     *
     * เดิมยอมรับสถานะ CALCULATED ด้วย ทำให้ข้ามขั้นตรวจสอบได้ทั้งขั้น และ
     * ไม่ได้ตรวจว่าผู้อนุมัติเป็นคนเดียวกับผู้ตรวจหรือไม่ ผลคือคนคนเดียว
     * กดตรวจแล้วกดอนุมัติจ่ายเงินทั้งบริษัทได้ด้วยตัวเอง
     */
    if (run.status !== 'REVIEWED') {
      throw new BadRequestException(
        'Payroll Run ต้องผ่านการตรวจสอบ (REVIEWED) ก่อนจึงจะอนุมัติได้',
      );
    }

    if (userId && run.reviewedById && run.reviewedById === userId) {
      throw new BadRequestException(
        'ผู้อนุมัติต้องไม่ใช่คนเดียวกับผู้ตรวจสอบรอบการจ่าย กรุณาให้ผู้มีสิทธิ์อีกคนเป็นผู้อนุมัติ',
      );
    }

    if (run._count.items <= 0 || Number(run.totalNetPay) <= 0) {
      throw new BadRequestException(
        'Payroll Run นี้ยังไม่มีข้อมูลยอดเงินสุทธิ กรุณาคำนวณก่อน',
      );
    }

    await this.assertPayrollRunValidationPassed(id, 'APPROVE');

    // ทั้งคู่ต้องอยู่ใน transaction เดียว ไม่งั้นพังกลางทางแล้ว item เป็น APPROVED
    // แต่ run ค้าง REVIEWED และกดซ้ำไม่ได้ผลเพราะ updateMany ไม่เหลือแถวให้จับ
    await this.prisma.$transaction(async (tx) => {
      const marked = await tx.payrollRun.updateMany({
        where: { id, status: 'REVIEWED' },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: userId ?? null,
          note: appendPayrollNote(
            run.note,
            dto.note || `Approved by ${userId ?? 'system'}`,
          ),
        },
      });

      if (marked.count === 0) {
        throw new BadRequestException(
          'Payroll Run นี้ถูกอนุมัติไปแล้ว หรือสถานะเปลี่ยนไประหว่างดำเนินการ',
        );
      }

      await tx.payrollItem.updateMany({
        where: {
          runId: id,
          status: {
            in: ['CALCULATED', 'REVIEWED'],
          },
        },
        data: {
          status: 'APPROVED',
        },
      });
    });

    return this.normalizePayrollRunResponseMode(options) === 'summary'
      ? this.findRunActionSummary(id)
      : this.findRunById(id, scope);
  }

  async markRunPaid(
    id: string,
    scope: TenantScope,
    dto: MarkPayrollRunPaidDto,
    userId?: string,
    options?: { responseMode?: 'detail' | 'summary' },
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        period: true,
        items: {
          select: {
            employeeId: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    if (run.status !== 'APPROVED') {
      throw new BadRequestException(
        'Payroll Run ต้องอยู่สถานะ APPROVED ก่อนจึงจะบันทึกจ่ายเงินได้',
      );
    }

    if (run._count.items <= 0 || Number(run.totalNetPay) <= 0) {
      throw new BadRequestException('Payroll Run นี้ไม่มีรายการจ่ายเงิน');
    }

    await this.assertPayrollRunValidationPassed(id, 'PAID');

    const paidNote = [
      dto.paymentReference ? `Payment Reference: ${dto.paymentReference}` : '',
      dto.note ?? '',
      `Paid by ${userId ?? 'system'}`,
    ]
      .filter(Boolean)
      .join(' | ');

    const employeeIds = run.items.map((item) => item.employeeId);

    /*
     * ทั้งสามคำสั่งต้องอยู่ใน transaction เดียวกัน
     *
     * ของเดิมยิงแยกกัน ถ้าพังกลางทางจะได้สถานะที่ซ่อมผ่าน API ไม่ได้:
     * PayrollItem กลายเป็น PAID หมดแล้วแต่ PayrollRun ยังค้าง APPROVED
     * แล้วการกดซ้ำก็ไม่ช่วย เพราะ updateMany กรอง status: 'APPROVED' ซึ่งไม่เหลือแล้ว
     *
     * การ update run ใช้ updateMany + เงื่อนไข status เพื่อกันกดสองครั้งพร้อมกัน
     * (ของเดิมอ่านสถานะแล้วเขียนทับโดยไม่ตรวจซ้ำ = กดรัว ๆ ผ่านได้ทั้งสองครั้ง)
     */
    await this.prisma.$transaction(async (tx) => {
      const marked = await tx.payrollRun.updateMany({
        where: { id, status: 'APPROVED' },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidById: userId ?? null,
          note: appendPayrollNote(run.note, paidNote),
        },
      });

      if (marked.count === 0) {
        throw new BadRequestException(
          'Payroll Run นี้ถูกบันทึกจ่ายเงินไปแล้ว หรือสถานะเปลี่ยนไประหว่างดำเนินการ',
        );
      }

      await tx.payrollItem.updateMany({
        where: {
          runId: id,
          status: 'APPROVED',
        },
        data: {
          status: 'PAID',
        },
      });

      if (employeeIds.length > 0) {
        await (tx as any).attendanceDailySummary.updateMany({
          where: {
            employeeId: { in: employeeIds },
            workDate: {
              gte: run.period.startDate,
              lte: run.period.endDate,
            },
            lockedAt: null,
          },
          data: {
            lockedAt: new Date(),
          },
        });
      }
    });

    return this.normalizePayrollRunResponseMode(options) === 'summary'
      ? this.findRunActionSummary(id)
      : this.findRunById(id, scope);
  }

  /* =========================================================
   * PAYROLL ATTENDANCE DEDUCTIONS
   * ดึง/นำเข้า/คำนวณซ้ำยอดหักจาก attendance_daily_summaries
   * ========================================================= */

  async findRunAttendanceDeductions(id: string, scope: TenantScope) {
    await this.assertRunInScope(id, scope);

    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
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
          orderBy: {
            employee: {
              employeeCode: 'asc',
            },
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                nickname: true,
                title: true,
                firstName: true,
                lastName: true,
                displayName: true,
                position: true,
                status: true,
                // หน้ารายละเอียดงวดใช้สองค่านี้จัดลำดับแถวตามกติกาลงเวลาของแต่ละคน
                attendanceTrackingRequired: true,
                attendanceExemptSessions: true,
                // ระดับตำแหน่ง — ใช้ดันผู้บริหารขึ้นก่อนในแผนกเดียวกัน
                positionMaster: { select: { level: true } },
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
              where: {
                sourceType: 'ATTENDANCE',
              },
              orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    const rows = await this.buildAttendanceDeductionRows(this.prisma, run);

    return {
      run: {
        id: run.id,
        runNo: run.runNo,
        name: run.name,
        status: run.status,
        company: run.company,
        period: run.period,
      },
      totals: this.sumAttendanceDeductionRows(rows),
      items: rows,
    };
  }

  async importAttendanceDeductionsForRun(
    id: string,
    scope: TenantScope,
    userId?: string,
    options?: { responseMode?: 'detail' | 'summary' },
  ) {
    return this.recalculateAttendanceDeductionsForRun(
      id,
      scope,
      userId,
      options,
    );
  }

  /**
   * นำเข้า/คำนวณยอดหักจากการลงเวลาใหม่
   *
   * เดิมเป็นการคำนวณ "เฉพาะส่วน": ลบเฉพาะ PayrollLine ที่มาจาก attendance
   * แล้วรวมยอดใหม่ โดยไม่แตะรายการประกันสังคมและภาษี
   *
   * ซึ่งผิด เพราะการขาดงาน/ลาไม่รับค่าจ้างมี isSocialSecurityBase และ isTaxable
   * เป็น true ทั้งคู่ การเปลี่ยนยอดหักจึงเปลี่ยน "ฐาน" ของทั้งประกันสังคมและภาษี
   * ผลคือยอดนำส่ง สปส. และภาษีหัก ณ ที่จ่ายค้างเป็นค่าเก่าที่คำนวณจากเงินได้
   * ที่พนักงานไม่ได้รับจริง แล้วถูกยื่นเข้าหน่วยงานรัฐตามนั้น
   *
   * จึงเปลี่ยนมาคำนวณทั้งรอบผ่าน calculateRun ซึ่งสร้างรายการทุกชั้นใหม่จากต้นทาง
   * (แลกกับเวลาที่นานขึ้น แต่ตัวเลขที่ยื่นต้องถูกก่อน)
   */
  async recalculateAttendanceDeductionsForRun(
    id: string,
    scope: TenantScope,
    userId?: string,
    options?: { responseMode?: 'detail' | 'summary' },
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, companyId: true, status: true },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    if (['APPROVED', 'PAID', 'CANCELLED'].includes(run.status)) {
      throw new BadRequestException(
        'Payroll Run ที่อนุมัติ จ่ายแล้ว หรือยกเลิกแล้ว ไม่สามารถนำเข้า/คำนวณยอดหัก Attendance ซ้ำได้',
      );
    }

    return this.calculateRun(id, scope, {}, userId, options);
  }

  private async buildAttendanceDeductionRows(client: any, run: any) {
    const payrollItems = run.items ?? [];
    let sources = payrollItems.map((item: any) => ({
      payrollItemId: item.id,
      payrollItemStatus: item.status,
      employee: item.employee,
      lines: item.lines ?? [],
    }));

    if (sources.length === 0) {
      const compensations = await this.findLatestCompensationsForRun({
        /* ต้องใช้ขอบเขตเดียวกับตอนคำนวณ ไม่งั้นรายการหักจากเวลาจะมีคนที่ไม่ได้อยู่ในรอบ */
        branchIds: run.branchIds ?? [],
        companyId: run.companyId,
        periodStartDate: run.period.startDate,
        periodEndDate: run.period.endDate,
      });

      sources = compensations.map((compensation: any) => ({
        payrollItemId: null,
        payrollItemStatus: null,
        employee: compensation.employee,
        lines: [],
      }));
    }

    const rows: any[] = [];

    for (const source of sources) {
      const breakdown =
        await this.payrollAttendanceDeductionImportService.collectEmployeeAttendanceDeductionBreakdown(client, {
          employeeId: source.employee.id,
          periodStartDate: run.period.startDate,
          periodEndDate: run.period.endDate,
        });

      const importedLines = source.lines.filter(
        (line: any) =>
          line.sourceType === 'ATTENDANCE' ||
          (line.sourceType === 'LEAVE' && line.code === 'UNPAID_LEAVE_DEDUCTION'),
      );
      const importedDeductionAmount = addMoney(
        ...importedLines
          .filter((line: any) => line.type === 'DEDUCTION')
          .map((line: any) => toMoney(line.amount)),
      );
      const expectedAttendanceDeductionAmount = toMoney(breakdown.payrollAttendanceDeductionAmount);
      const actualImportedDeductionAmount = toMoney(importedDeductionAmount);
      const attendanceDeductionMatched =
        expectedAttendanceDeductionAmount === actualImportedDeductionAmount;

      rows.push({
        employee: source.employee,
        payrollItemId: source.payrollItemId,
        payrollItemStatus: source.payrollItemStatus,
        dailySummaryCount: breakdown.dailySummaryCount,
        lockedSummaryCount: breakdown.lockedSummaryCount,
        totalLateMinutes: breakdown.lateMinutes,
        lateDays: breakdown.lateDays,
        latePenaltyAmount: toMoneyString(breakdown.latePenaltyAmount),
        missingLogDays: breakdown.missingLogDays,
        missingLogOccurrences: breakdown.missingLogOccurrences,
        missingLogPenaltyAmount: toMoneyString(breakdown.missingLogPenaltyAmount),
        earlyCheckoutMinutes: breakdown.earlyCheckoutMinutes,
        earlyCheckoutDays: breakdown.earlyCheckoutDays,
        earlyCheckoutPenaltyAmount: toMoneyString(breakdown.earlyCheckoutPenaltyAmount),
        absentDays: toMoneyString(breakdown.absentDays),
        absentDeductionAmount: toMoneyString(breakdown.absentDeductionAmount),
        unpaidLeaveDays: toMoneyString(breakdown.unpaidLeaveDays),
        unpaidLeaveDeductionAmount: toMoneyString(breakdown.unpaidLeaveDeductionAmount),
        payrollAttendanceDeductionAmount: toMoneyString(expectedAttendanceDeductionAmount),
        totalDeductionAmount: toMoneyString(breakdown.totalDeductionAmount),
        importedDeductionAmount: toMoneyString(actualImportedDeductionAmount),
        importedLineCount: importedLines.length,
        status:
          breakdown.dailySummaryCount === 0
            ? 'NO_SUMMARY'
            : attendanceDeductionMatched
              ? 'MATCHED'
              : 'NEEDS_IMPORT',
      });
    }

    return rows;
  }

  private sumAttendanceDeductionRows(rows: any[]) {
    return {
      employeeCount: rows.length,
      dailySummaryCount: rows.reduce((sum, row) => sum + Number(row.dailySummaryCount || 0), 0),
      totalLateMinutes: rows.reduce((sum, row) => sum + Number(row.totalLateMinutes || 0), 0),
      latePenaltyAmount: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.latePenaltyAmount))),
      ),
      missingLogDays: rows.reduce((sum, row) => sum + Number(row.missingLogDays || 0), 0),
      missingLogPenaltyAmount: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.missingLogPenaltyAmount))),
      ),
      earlyCheckoutMinutes: rows.reduce((sum, row) => sum + Number(row.earlyCheckoutMinutes || 0), 0),
      earlyCheckoutDays: rows.reduce((sum, row) => sum + Number(row.earlyCheckoutDays || 0), 0),
      earlyCheckoutPenaltyAmount: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.earlyCheckoutPenaltyAmount))),
      ),
      absentDays: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.absentDays))),
      ),
      absentDeductionAmount: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.absentDeductionAmount))),
      ),
      unpaidLeaveDays: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.unpaidLeaveDays))),
      ),
      unpaidLeaveDeductionAmount: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.unpaidLeaveDeductionAmount))),
      ),
      payrollAttendanceDeductionAmount: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.payrollAttendanceDeductionAmount))),
      ),
      importedDeductionAmount: toMoneyString(
        addMoney(...rows.map((row) => toMoney(row.importedDeductionAmount))),
      ),
      needsImportCount: rows.filter((row) => row.status === 'NEEDS_IMPORT').length,
      noSummaryCount: rows.filter((row) => row.status === 'NO_SUMMARY').length,
    };
  }

  /* =========================================================
   * PAYSLIPS
   * สลิปเงินเดือนและ PDF สำหรับพนักงาน/HR
   * ========================================================= */

  private async buildPayslipListSummary(where: Prisma.PayrollItemWhereInput) {
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
          AND: [where, { run: { status: PayrollRunStatus.APPROVED } }],
        },
      }),
      this.prisma.payrollItem.count({
        where: {
          AND: [where, { run: { status: PayrollRunStatus.PAID } }],
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

  private mapPayslipStatusFilter(status?: string) {
    if (status === 'READY') return PayrollRunStatus.APPROVED;
    if (status === 'PAID') return PayrollRunStatus.PAID;
    return null;
  }

  async findPayslipsByRun(
    runId: string,
    scope: TenantScope,
    query: PayslipQueryDto,
  ) {
    await this.assertRunInScope(runId, scope);

    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id: runId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!run) {
      throw new NotFoundException("ไม่พบ Payroll Run");
    }

    if (!["APPROVED", "PAID"].includes(run.status)) {
      throw new BadRequestException(
        "สามารถดูสลิปได้เฉพาะ Payroll Run ที่ APPROVED หรือ PAID แล้วเท่านั้น",
      );
    }

    const where: Prisma.PayrollItemWhereInput = {
      runId,
    };

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    const statusFilter = this.mapPayslipStatusFilter(query.status);

    if (statusFilter && run.status !== statusFilter) {
      return {
        data: [],
        meta: toPageMeta(page, pageSize, 0),
        summary: await this.buildPayslipListSummary({
          AND: [where, { run: { status: statusFilter } }],
        }),
      };
    }

    if (query.q?.trim()) {
      const q = query.q.trim();

      where.OR = [
        {
          employee: {
            employeeCode: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
        {
          employee: {
            firstName: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
        {
          employee: {
            lastName: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
        {
          employee: {
            displayName: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollItem.findMany({
        where,
        orderBy: {
          employee: {
            employeeCode: "asc",
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.getPayslipInclude(),
      }),
      this.prisma.payrollItem.count({ where }),
    ]);
    const summary = await this.buildPayslipListSummary(where);

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
      summary,
    };
  }

  /**
   * @param scope กรองที่ระดับ query ผ่าน run.companyId
   *
   * ใช้การกรองใน where แทน assert หลัง fetch เพื่อไม่ยืนยันการมีอยู่ของสลิป
   * ที่ผู้เรียกไม่มีสิทธิ์ดู (ตอบ 404 เหมือนไม่มีรายการ ไม่ใช่ 403)
   * PayrollRun มีแต่ companyId ไม่มี branchId จึงกรองแค่ระดับบริษัท
   */
  async findPayslipByItemId(itemId: string, scope: TenantScope) {
    const item = await this.prisma.payrollItem.findFirst({
      where: {
        id: itemId,
        run: {
          deletedAt: null,
          status: {
            in: ["APPROVED", "PAID"],
          },
          ...(scope.level === "GLOBAL"
            ? {}
            : { companyId: scope.companyId ?? undefined }),
        },
      },
      include: this.getPayslipInclude(),
    });

    if (!item) {
      throw new NotFoundException(
        "ไม่พบสลิปเงินเดือน หรือสลิปยังไม่อยู่ในสถานะที่เปิดดูได้",
      );
    }

    return item;
  }

  async findMyPayslips(userId: string, query: PayslipQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Prisma.PayrollItemWhereInput = {
      employee: {
        userId,
        deletedAt: null,
      },
      run: {
        deletedAt: null,
        status: {
          in: ["APPROVED", "PAID"],
        },
      },
    };

    const statusFilter = this.mapPayslipStatusFilter(query.status);

    if (statusFilter) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { run: { status: statusFilter } },
      ];
    }

    if (query.q?.trim()) {
      const q = query.q.trim();

      where.OR = [
        {
          run: {
            runNo: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
        {
          run: {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
        {
          run: {
            period: {
              code: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
        {
          run: {
            period: {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollItem.findMany({
        where,
        orderBy: {
          run: {
            period: {
              paymentDate: "desc",
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.getPayslipInclude(),
      }),
      this.prisma.payrollItem.count({ where }),
    ]);
    const summary = await this.buildPayslipListSummary(where);

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
      summary,
    };
  }

  async findMyPayslipByItemId(userId: string, itemId: string) {
    const item = await this.prisma.payrollItem.findFirst({
      where: {
        id: itemId,
        employee: {
          userId,
          deletedAt: null,
        },
        run: {
          deletedAt: null,
          status: {
            in: ["APPROVED", "PAID"],
          },
        },
      },
      include: this.getPayslipInclude(),
    });

    if (!item) {
      throw new NotFoundException("ไม่พบสลิปเงินเดือนของคุณ");
    }

    return item;
  }


  /* =========================================================
   * INTERNAL HELPERS
   * ฟังก์ชันภายในสำหรับ include/query/calculation ที่ยังคงอยู่ใน service หลัก
   * ========================================================= */

  private getPayslipInclude() {
    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
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
            sortOrder: "asc",
          },
          {
            code: "asc",
          },
        ],
        include: {
          component: true,
        },
      },
    } satisfies Prisma.PayrollItemInclude;
  }

  /**
   * ออกสลิปทั้งรอบเป็นไฟล์ ZIP
   * --------------------------
   * HR ที่มีพนักงานหลักร้อยคนกดดาวน์โหลดทีละใบไม่ไหว (130 คน = กด 130 ครั้ง)
   *
   * เปิด Chromium ครั้งเดียวแล้ววนสร้างทุกใบ วัดแล้วต่างกันชัดเจน — เปิด-ปิดใหม่
   * ทุกใบใช้ ~1,280 ms ต่อใบ แต่ใช้ browser ซ้ำเหลือ ~300 ms
   *
   * เขียนลง archive ทีละใบระหว่างสร้าง ไม่ได้เก็บไว้ในหน่วยความจำจนครบ
   * แรมจึงไม่พุ่งตามจำนวนพนักงาน
   */
  async streamRunPayslipsZip(
    runId: string,
    scope: TenantScope,
    layout: PayslipPaperLayout,
    archive: PayslipZipArchive,
  ): Promise<{ total: number; failed: string[] }> {
    await this.assertRunInScope(runId, scope);

    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id: runId,
        deletedAt: null,
        status: { in: ["APPROVED", "PAID"] },
      },
      select: { id: true },
    });

    if (!run) {
      throw new NotFoundException(
        "ไม่พบรอบคำนวณ หรือรอบนี้ยังไม่อยู่ในสถานะที่ออกสลิปได้",
      );
    }

    const items = await this.prisma.payrollItem.findMany({
      where: { runId },
      orderBy: {
        employee: {
          employeeCode: "asc",
        },
      },
      include: this.getPayslipInclude(),
    });

    if (items.length === 0) {
      throw new NotFoundException("รอบนี้ยังไม่มีรายการพนักงาน");
    }

    const browser = await launchPayslipBrowser();
    const failed: string[] = [];

    try {
      for (const item of items) {
        try {
          const pdf = await renderPayslipPdfWithBrowser(
            browser,
            item as never,
            layout,
          );

          archive.append(pdf.buffer, { name: pdf.fileName });
        } catch (error) {
          /*
           * สลิปใบเดียวพังต้องไม่ทำให้ทั้งรอบล้ม — เก็บรหัสพนักงานไว้แล้วแนบเป็น
           * ไฟล์บันทึกไว้ในซิป HR จะได้รู้ว่าต้องตามใครต่อ
           */
          failed.push(
            `${item.employee.employeeCode ?? item.id}: ${
              error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"
            }`,
          );
        }
      }
    } finally {
      await browser.close();
    }

    return { total: items.length, failed };
  }

  async generatePayslipPdfByItemId(
    itemId: string,
    scope: TenantScope,
    layout: PayslipPaperLayout = "FULL",
  ): Promise<PayslipPdfResult> {
    const payslip = await this.findPayslipByItemId(itemId, scope);

    return generatePayslipPdf(payslip, layout);
  }

  async generateRunExcel(
    runId: string,
    scope: TenantScope,
  ): Promise<PayrollRunExportResult> {
    const run = await this.findRunById(runId, scope);

    return generatePayrollRunExcel(run);
  }

  async generateRunPdf(
    runId: string,
    scope: TenantScope,
  ): Promise<PayrollRunExportResult> {
    const run = await this.findRunById(runId, scope);

    return generatePayrollRunPdf(run);
  }


  /**
   * คำนวณ Payroll Run ภายใน transaction
   * จุดนี้ยังคง logic เดิมไว้ก่อนเพื่อความปลอดภัย
   * phase ถัดไปค่อยแยกเป็น PayrollCalculationService ถ้าต้องเชื่อม HR Review / OT / Leave จริง
   */
  private async calculateRunInsideTransaction(params: {
    runId: string;
    scope: TenantScope;
    companyId: string;
    periodId: string;
    periodStartDate: Date;
    periodEndDate: Date;
    paymentDate: Date;
    employeeIds?: string[];
    /** ขอบเขตสาขาของรอบ — ว่าง = ทั้งบริษัท */
    branchIds?: string[];
    userId?: string;
    responseMode?: 'detail' | 'summary';
  }) {
    this.payrollProgressService.update(params.runId, {
      step: 'LOAD_COMPONENTS',
      message: 'โหลดรายการ Payroll Component',
      percent: 24,
    });
    await this.ensureDefaultPayrollComponents(params.companyId);

    const components = await this.prisma.payrollComponent.findMany({
      where: {
        companyId: params.companyId,
        deletedAt: null,
      },
    });

    const componentMap = new Map(
      components.map((component) => [component.code, component]),
    );
    const componentById = new Map(
      components.map((component) => [component.id, component]),
    );

    const compensations = await this.findLatestCompensationsForRun({
      branchIds: params.branchIds,
      companyId: params.companyId,
      periodStartDate: params.periodStartDate,
      periodEndDate: params.periodEndDate,
      employeeIds: params.employeeIds,
    });

    if (compensations.length === 0) {
      throw new BadRequestException(
        'ไม่พบข้อมูลค่าตอบแทนพนักงานสำหรับคำนวณ Payroll Run นี้',
      );
    }

    this.payrollProgressService.update(params.runId, {
      step: 'LOAD_EMPLOYEES',
      message: `พบพนักงานที่ต้องคำนวณ ${compensations.length} ราย`,
      totalEmployees: compensations.length,
      processedEmployees: 0,
      percent: 28,
    });

    const attendanceRules =
      await this.payrollAttendanceDeductionImportService.findActiveRulesForCompany(
        this.prisma,
        params.companyId,
      );
    // ค่าตั้งต้นของธง isTaxable / isSocialSecurityBase เมื่อยังไม่ได้ตั้งกฎ
    const attendanceComponents =
      await this.payrollAttendanceDeductionImportService.findAttendanceComponentsForCompany(
        this.prisma,
        params.companyId,
      );

    const companyPayrollSettings =
      await this.companyPayrollSettingsService.resolvePayrollCalculationSettings(
        params.companyId,
      );
    const payrollCalculationSettings = {
      salaryDivisorDays: this.normalizePositiveNumber(
        companyPayrollSettings.salaryDivisorDays,
        30,
      ),
      workingHoursPerDay: this.normalizePositiveNumber(
        companyPayrollSettings.workingHoursPerDay,
        8,
      ),
    };
    const payrollSettingSnapshot = this.buildPayrollSettingSnapshot(
      params.companyId,
      companyPayrollSettings,
    );

    this.payrollProgressService.update(params.runId, {
      step: 'RESET_LINES',
      message: 'ล้างรายการ PayrollLine เดิมก่อนคำนวณใหม่',
      percent: 30,
    });

    /*
     * คำนวณรายคน = ล้างเฉพาะของคนนั้น
     *
     * เดิมล้างรายการของทั้งรอบทิ้งเสมอแล้วสร้างใหม่ตามรายชื่อที่ส่งมา
     * พอส่งมาคนเดียว คนที่เหลือทั้งรอบจึงหายไปจากตารางทันที ต้องกดคำนวณ
     * ทั้งงวดใหม่ถึงจะกลับมา — ยอดของคนที่ตรวจผ่านไปแล้วก็ถูกคิดใหม่ไปด้วย
     */
    const scopedEmployeeIds = params.employeeIds?.length
      ? params.employeeIds
      : null;

    await this.prisma.$transaction(async (tx) => {
      /*
       * คำนวณงวดนี้ใหม่ ต้องคืนยอดหนี้ของแผนผ่อนงวดก่อน
       * ไม่งั้นยอดที่หักไปรอบก่อนจะค้างอยู่ แล้วรอบใหม่หักซ้ำอีก
       */
      await this.payrollDeductionPlanService.revertDeductionPlanEntries(
        tx,
        params.runId,
        scopedEmployeeIds ?? undefined,
      );

      await tx.payrollLine.deleteMany({
        where: {
          payrollItem: {
            runId: params.runId,
            ...(scopedEmployeeIds
              ? { employeeId: { in: scopedEmployeeIds } }
              : {}),
          },
        },
      });

      await tx.payrollItem.deleteMany({
        where: {
          runId: params.runId,
          ...(scopedEmployeeIds
            ? { employeeId: { in: scopedEmployeeIds } }
            : {}),
        },
      });

      /* ตัวนับสำหรับแถบความคืบหน้าเท่านั้น — ยอดรวมของรอบอ่านจากรายการจริงตอนท้าย */
      let totalEmployees = 0;

      for (const [index, compensation] of compensations.entries()) {
        this.payrollProgressService.updateEmployeeProgress(
          params.runId,
          index,
          compensations.length,
          `เริ่มคำนวณพนักงาน ${index + 1}/${compensations.length}`,
        );

        /*
         * คนที่เป็นพนักงานไม่เต็มงวด (เข้าใหม่กลางงวด / ออกกลางงวด)
         * ต้องได้เงินเดือนกับเงินประจำตำแหน่งตามส่วนของวันที่เป็นพนักงานจริง
         * ใช้ตัวหารเดียวกับที่หักขาดงาน (salaryDivisorDays ปกติ 30) เพื่อให้
         * คนเข้าใหม่กับคนขาดงานคิดจากฐานเดียวกัน ไม่งั้นสองสูตรจะชนกันเอง
         */
        const employmentProration = resolveEmploymentProration({
          employee: compensation.employee,
          periodStartDate: params.periodStartDate,
          periodEndDate: params.periodEndDate,
          divisorDays: payrollCalculationSettings.salaryDivisorDays,
        });

        const prorate = (value: number) =>
          toMoney(value * employmentProration.factor);

        const salaryBasis = salaryBasisOf(compensation);

        /*
         * รายวัน/รายชั่วโมงไม่ต้องคูณสัดส่วนวันที่เป็นพนักงาน
         *
         * baseSalary ของคนกลุ่มนี้คือ "อัตราต่อวัน/ต่อชั่วโมง" ไม่ใช่ยอดทั้งงวด
         * การเข้าใหม่หรือลาออกกลางงวดสะท้อนอยู่ในจำนวนวันที่มาทำงานจริงแล้ว
         * ถ้าคูณสัดส่วนอีกจะกลายเป็นลดอัตราค่าแรงต่อวันลง และทำให้ OT เพี้ยนตาม
         */
        const baseSalary =
          salaryBasis === 'MONTHLY'
            ? prorate(toMoney(compensation.baseSalary))
            : toMoney(compensation.baseSalary);

        /**
         * ดึงรายการ HR Review ที่พร้อมเข้า payroll ของพนักงานคนนี้
         *
         * ตัวอย่างรายการที่ service นี้คืนมา:
         * - OT ที่ HR กด PAYROLL_READY => earning line
         * - ลาไม่รับค่าจ้าง => deduction line
         * - ลาที่ได้รับค่าจ้าง / ขอแก้เวลา => info line
         */
        const handoffSummary =
          await this.payrollHandoffImportService.collectEmployeeHandoffLines(tx, {
            companyId: params.companyId,
            employeeId: compensation.employeeId,
            periodId: params.periodId,
            payrollRunId: params.runId,
            periodStartDate: params.periodStartDate,
            periodEndDate: params.periodEndDate,
            baseSalary,
            salaryBasis,
            payrollCalculationSettings,
          });

        /**
         * รายการค่าตอบแทนประจำเพิ่มเติมของพนักงาน
         * เช่น ค่าเดินทางประจำ ค่าโทรศัพท์ประจำ ค่าอาหาร หรือรายการหักประจำ
         * เก็บไว้ที่ EmployeeCompensationItem เพื่อไม่ต้องเพิ่ม field ใหม่ทุกครั้งที่บริษัทมี allowance ใหม่
         */
        const rawRecurringSummary =
          await this.payrollRecurringLinesService.collectEmployeeRecurringLines(tx, {
            companyId: params.companyId,
            employeeId: compensation.employeeId,
            periodStartDate: params.periodStartDate,
            periodEndDate: params.periodEndDate,
          });

        /*
         * หารรายการประจำตามวันที่เป็นพนักงานจริง เฉพาะรายการที่ตั้งค่าไว้ว่าให้หาร
         *
         * ค่าอาหาร ค่าเดินทาง ค่าตำแหน่ง → คนเข้าวันที่ 16 ควรได้ครึ่งเดียว
         * ประกันกลุ่มรายเดือน ค่าผ่อนงวดคงที่ → ต้องเต็มจำนวนเสมอ HR ติ๊กออกเอง
         *
         * ไม่แตะรายการเฉพาะงวด (โบนัส ปรับปรุง) เพราะยอดของมันคือยอดของงวดนั้นอยู่แล้ว
         */
        const proratedRecurringSummary = prorateRecurringLines(
          rawRecurringSummary,
          employmentProration,
        );

        const recurringSummary = proratedRecurringSummary;

        /**
         * รายการเพิ่ม/หักเฉพาะงวดจาก HR/บัญชี
         * เช่น โบนัส ค่าคอมมิชชั่น หักเงินยืม หักค่าเสียหาย
         */
        const adjustmentSummary =
          await this.payrollAdjustmentImportService.collectEmployeeAdjustmentLines(tx, {
            companyId: params.companyId,
            employeeId: compensation.employeeId,
            periodId: params.periodId,
            payrollRunId: params.runId,
            periodStartDate: params.periodStartDate,
            periodEndDate: params.periodEndDate,
          });

        /**
         * รายการหักจาก Attendance
         * เช่น มาสาย ออกก่อน ลืมลงเวลา หรือขาดงาน ตามกติกา AttendancePayrollRule
         */
        const hasLeaveHandoffUnpaidLeaveDeduction = handoffSummary.deductionLines.some(
          (line) => line.code === 'UNPAID_LEAVE_DEDUCTION' && toMoney(line.amount) > 0,
        );
        const attendanceSummary =
          await this.payrollAttendanceDeductionImportService.collectEmployeeAttendanceDeductions(tx, {
            companyId: params.companyId,
            employeeId: compensation.employeeId,
            periodStartDate: params.periodStartDate,
            periodEndDate: params.periodEndDate,
            baseSalary,
            activeRules: attendanceRules,
            activeComponents: attendanceComponents,
            hasLeaveHandoffUnpaidLeaveDeduction,
          });

        /*
         * ค่าจ้างที่จ่ายจริงในงวด — ขึ้นกับว่า baseSalary เป็นฐานแบบไหน
         *
         *   MONTHLY  จ่ายเต็มเดือน (คิดตามสัดส่วนถ้าเข้า/ออกกลางงวด)
         *   DAILY    จ่ายตามจำนวนวันที่มาทำงานจริง
         *   HOURLY   จ่ายตามจำนวนชั่วโมงที่ทำจริง
         *
         * ก่อนแก้ ระบบจ่ายพนักงานรายวันเท่ากับ "อัตราต่อวัน" ทั้งเดือน
         * เช่น ค่าแรงวันละ 500 ทำงาน 29 วัน ได้รับ 500 บาท แทนที่จะเป็น 14,500
         */
        const workedDaysForBasePay =
          salaryBasis === 'MONTHLY'
            ? 0
            : await this.payrollAttendanceDeductionImportService.countPayableDaysForPeriod(
                tx,
                {
                  employeeId: compensation.employeeId,
                  periodStartDate: params.periodStartDate,
                  periodEndDate: params.periodEndDate,
                },
              );

        const basePayAmount = resolveBasePayForPeriod({
          basis: salaryBasis,
          baseSalary,
          workedDays: workedDaysForBasePay,
          workingHoursPerDay: payrollCalculationSettings.workingHoursPerDay,
        });

        /*
         * ธง "เข้าฐานภาษี / เข้าฐานประกันสังคม" ต้องมาจากรายการเงินเดือนของบริษัท
         * ไม่ใช่กำหนดตายตัวในโค้ด เพราะแต่ละบริษัทตีความต่างกัน
         * เช่น เงินประจำตำแหน่งที่จ่ายประจำมักนับเป็นค่าจ้าง แต่ค่าเดินทางแบบเบิกตามจริงไม่นับ
         * ค่าใน fallback คือค่าเดิมของระบบ ใช้เมื่อบริษัทยังไม่มีรายการนั้นในตาราง
         */
        const earningLines = [
          {
            code: 'BASE_SALARY',
            name: 'เงินเดือน',
            amount: basePayAmount,
            sortOrder: 10,
            sourceType: 'BASE_SALARY' as const,
            fallbackSocialSecurityBase: true,
          },
        ].filter((line) => line.amount > 0);

        const payrollEarningLines = [
          ...earningLines.map(({ fallbackSocialSecurityBase, ...line }) => {
            const component = componentMap.get(line.code);

            return {
              ...line,
              type: 'EARNING' as const,
              sourceId: compensation.id,
              componentId: component?.id ?? null,
              quantity: 1,
              rate: line.amount,
              isTaxable: component ? component.isTaxable !== false : true,
              isSocialSecurityBase: component
                ? component.isSocialSecurityBase === true
                : fallbackSocialSecurityBase,
              note: null as string | null,
            };
          }),
          ...recurringSummary.earningLines,
          ...handoffSummary.earningLines,
          ...adjustmentSummary.earningLines,
        ];

        /*
         * รายการหักที่เกิดก่อนคำนวณประกันสังคมและภาษี
         *
         * ชุดเดียวกันส่งเข้าทั้งสองเครื่องคำนวณ แต่แต่ละเครื่องอ่านคนละธง
         *   ภาษี        ดู isTaxable            → ลาไม่รับค่าจ้าง/ขาดงาน ลดฐาน
         *   ประกันสังคม ดู isSocialSecurityBase → ไม่ลดฐาน คิดจากเงินเดือนเต็ม
         * สองฐานจึงไม่เท่ากันโดยตั้งใจ (ดูเหตุผลที่ payroll-default-components.ts)
         *
         * ส่วนประกันสังคมกับภาษีเองถูกคำนวณทีหลัง จึงไม่อยู่ในชุดนี้
         */
        const baseReducingDeductionLines = [
          ...recurringSummary.deductionLines,
          ...handoffSummary.deductionLines,
          ...adjustmentSummary.deductionLines,
          ...attendanceSummary.deductionLines,
        ];

        const socialSecuritySummary =
          this.payrollSocialSecurityService.collectEmployeeSocialSecurityLines({
            enabled: compensation.socialSecurityEnabled !== false,
            sourceId: compensation.id,
            earningLines: payrollEarningLines,
            deductionLines: baseReducingDeductionLines,
            settings: companyPayrollSettings,
          });

        const taxableIncomeSplit = this.splitTaxableEarningLinesForTax([
          ...payrollEarningLines,
          ...baseReducingDeductionLines,
        ]);

        const taxCalculation = compensation.taxEnabled === false
          ? null
          : await this.payrollTaxCalculatorService.calculateEmployeePayrollTax({
              // ส่ง tx เข้าไป ไม่งั้นตัวคำนวณภาษีจะเปิด connection ที่สองซ้อนในธุรกรรมนี้
              // แล้วมองไม่เห็นรายการที่เพิ่งถูกลบ/เขียนในรอบเดียวกัน
              db: tx,
              companyId: params.companyId,
              employeeId: compensation.employeeId,
              payrollRunId: params.runId,
              taxableIncomeCurrentRun: taxableIncomeSplit.totalTaxableIncome,
              regularTaxableIncomeCurrentRun: taxableIncomeSplit.regularTaxableIncome,
              bonusIncome: taxableIncomeSplit.bonusIncome,
              otherTaxableIncome: taxableIncomeSplit.otherOneTimeIncome,
              socialSecurityCurrentRun: socialSecuritySummary.employeeContribution,
              payDate: params.paymentDate,
              /*
               * งวดสุดท้ายของคนที่ออกจากงาน ต้องไม่ประมาณการเงินได้ต่อไปทั้งปี
               * ปกติสูตรคิดว่า "เดือนนี้ได้เท่านี้ แล้วจะได้เท่านี้ไปจนสิ้นปี"
               * พอคนออกกลางปีแล้วยังทดไปถึงธันวา เงินได้ทั้งปีจะสูงเกินจริง
               * ดันขึ้นขั้นภาษีสูงกว่าที่ควร แล้วหักภาษีงวดสุดท้ายเกิน
               */
              ...(employmentProration.isFinalPeriod
                ? { remainingPeriods: 1 }
                : {}),
            });

        const taxAmount = taxCalculation?.canCreatePayrollLine
          ? toMoney(taxCalculation.currentRunTaxAmount)
          : 0;
        const taxDeductionLines = taxAmount > 0
          ? [
              {
                code: 'TAX',
                name: 'ภาษีหัก ณ ที่จ่าย',
                amount: taxAmount,
                sortOrder: 910,
                sourceType: 'TAX' as const,
                sourceId: taxCalculation?.taxProfile?.id ?? null,
                componentId: componentMap.get('TAX')?.id ?? null,
                quantity: 1,
                rate: taxAmount,
                type: 'DEDUCTION' as const,
                isTaxable: false,
                isSocialSecurityBase: false,
                note: 'คำนวณอัตโนมัติจาก Tax Engine',
              },
            ]
          : [];

        /*
         * รายการหักผ่อนงวด (กยศ. เงินกู้พนักงาน สหกรณ์) หักเป็นลำดับสุดท้าย
         * เพราะต้องรู้ก่อนว่าเหลือเงินสุทธิเท่าไรจริง ๆ หลังหักภาษีและประกันสังคมแล้ว
         * จะได้ไม่หักหนี้จนเงินที่พนักงานได้รับติดลบ
         */
        const deductionsBeforePlans = addMoney(
          ...[
            ...recurringSummary.deductionLines,
            ...handoffSummary.deductionLines,
            ...adjustmentSummary.deductionLines,
            ...attendanceSummary.deductionLines,
            ...socialSecuritySummary.deductionLines,
            ...taxDeductionLines,
          ].map((line) => line.amount),
        );
        const netPayBeforePlans =
          addMoney(...payrollEarningLines.map((line) => line.amount)) -
          deductionsBeforePlans;

        const deductionPlanSummary =
          await this.payrollDeductionPlanService.collectEmployeeDeductionPlanLines(
            tx,
            {
              companyId: params.companyId,
              employeeId: compensation.employeeId,
              payrollRunId: params.runId,
              periodEndDate: params.periodEndDate,
              availableNetPay: netPayBeforePlans,
            },
          );

        /*
         * กันหักซ้ำระหว่าง "แผนผ่อนชำระ" กับ "รายการปรับปรุงรายงวด"
         *
         * หนี้ก้อนเดียวกัน (กยศ. / กรอ. / เงินยืม) ตั้งได้สองทาง: ตั้งเป็นแผนผ่อน
         * ให้ระบบหักเองทุกงวด หรือส่งยอดรายงวดเข้ามาเป็นรายการปรับปรุง
         * ถ้าตั้งไว้ทั้งสองทางด้วยยอดเท่ากัน ตัวคำนวณเดิมหักทั้งคู่ — พนักงานโดนหัก
         * สองเท่าโดยไม่มีอะไรเตือน (เจอจริง 24 คน งวด ส.ค. 2569 รวมกว่า 17,000 บาท)
         *
         * ยึดรายการปรับปรุงเป็นตัวจริง เพราะเป็นยอดที่ส่งเข้ามาต่องวดโดยตรง
         * แล้วตัดบรรทัดจากแผนผ่อนที่ซ้ำกันทิ้ง (ชื่อรายการเดียวกันและยอดเท่ากัน)
         * ยอดหนี้คงเหลือของแผนจึงไม่ถูกตัดในงวดนี้ด้วย เพราะไม่ได้หักผ่านแผน
         */
        const adjustmentDeductionKeys = new Set(
          adjustmentSummary.deductionLines.map(
            (line: { name?: string | null; code?: string | null; amount: number }) =>
              `${String(line.name ?? line.code ?? '').trim()}|${toMoney(line.amount)}`,
          ),
        );

        const planDeductionLines = deductionPlanSummary.deductionLines.filter(
          (line: { name?: string | null; code?: string | null; amount: number }) =>
            !adjustmentDeductionKeys.has(
              `${String(line.name ?? line.code ?? '').trim()}|${toMoney(line.amount)}`,
            ),
        );

        /*
         * แผนที่ถูกตัดออกต้องไม่ถูกบันทึกว่าจ่ายงวดนี้ด้วย
         * ไม่งั้นยอดหนี้คงเหลือจะเดินหน้าไปทั้งที่ไม่ได้หักเงินจริงสักบาท
         */
        const keptPlanIds = new Set(
          planDeductionLines.map((line: { sourceId?: string | null }) =>
            String(line.sourceId ?? ''),
          ),
        );
        const deductionPlanEntriesToCommit =
          deductionPlanSummary.pendingEntries.filter((entry) =>
            keptPlanIds.has(entry.planId),
          );

        const payrollDeductionLines = [
          ...recurringSummary.deductionLines,
          ...handoffSummary.deductionLines,
          ...adjustmentSummary.deductionLines,
          ...attendanceSummary.deductionLines,
          ...socialSecuritySummary.deductionLines,
          ...taxDeductionLines,
          ...planDeductionLines,
        ];
        const payrollEmployerContributionLines = [
          ...socialSecuritySummary.employerContributionLines,
        ];
        const payrollInfoLines = [
          ...recurringSummary.infoLines,
          ...handoffSummary.infoLines,
          ...adjustmentSummary.infoLines,
          ...attendanceSummary.infoLines,
        ];

        const employeeTotalEarnings = addMoney(
          ...payrollEarningLines.map((line) => line.amount),
        );

        const employeeTotalDeductions = addMoney(
          ...payrollDeductionLines.map((line) => line.amount),
        );

        const employeeGrossPay = employeeTotalEarnings;
        const employeeNetPay = employeeGrossPay - employeeTotalDeductions;
        const employeeBranch = compensation.employee.branch;
        const employeeDepartment = compensation.employee.department;

        const item = await tx.payrollItem.create({
          data: {
            runId: params.runId,
            employeeId: compensation.employeeId,
            compensationId: compensation.id,
            status: 'CALCULATED',
            // ยอดค่าจ้างที่จ่ายจริงในงวด ไม่ใช่อัตราต่อวัน/ต่อชั่วโมง
            // ไม่งั้นสลิปพนักงานรายวันจะขึ้นว่าเงินเดือน 500 บาท
            baseSalary: toMoneyString(basePayAmount),
            totalEarnings: toMoneyString(employeeTotalEarnings),
            totalDeductions: toMoneyString(employeeTotalDeductions),
            totalGrossPay: toMoneyString(employeeGrossPay),
            totalNetPay: toMoneyString(employeeNetPay),
            // จำนวนวันทำงานจริงจาก attendance_daily_summaries ของงวดนี้
            // เดิมฮาร์ดโค้ด '0' ทำให้สลิปไม่บอกว่าทำงานกี่วัน
            // คนที่เป็นพนักงานไม่เต็มงวด ให้บอกจำนวนวันที่เป็นพนักงานจริง
            // แทนวันที่มาทำงาน เพื่อให้ตรวจสอบยอดที่หารตามวันได้จากตัวเลขนี้
            // รายวัน/รายชั่วโมงต้องโชว์จำนวนวันชุดเดียวกับที่ใช้คิดเงิน
            // ไม่งั้นสลิปจะอธิบายที่มาของยอดไม่ได้
            workingDays: toMoneyString(
              salaryBasis !== 'MONTHLY'
                ? workedDaysForBasePay
                : employmentProration.isPartial
                  ? employmentProration.employedDays
                  : (attendanceSummary.workedDays ?? 0),
            ),
            paidLeaveDays: toMoneyString(handoffSummary.paidLeaveDays),
            unpaidLeaveDays: toMoneyString(handoffSummary.unpaidLeaveDays),
            absentDays: toMoneyString(attendanceSummary.absentDays ?? 0),
            lateMinutes: (handoffSummary.lateMinutes ?? 0) + (attendanceSummary.lateMinutes ?? 0),
            overtimeHours: toMoneyString(handoffSummary.overtimeHours),
            branchId: employeeBranch?.id ?? null,
            branchCode: employeeBranch?.code ?? null,
            branchName: employeeBranch?.nameTh ?? null,
            departmentId: employeeDepartment?.id ?? null,
            departmentCode: employeeDepartment?.code ?? null,
            departmentName: employeeDepartment?.nameTh ?? null,
            snapshot: {
              compensationId: compensation.id,
              effectiveDate: compensation.effectiveDate.toISOString(),
              employee: {
                id: compensation.employee.id,
                employeeCode: compensation.employee.employeeCode,
                name:
                  compensation.employee.displayName ||
                  `${compensation.employee.firstName} ${compensation.employee.lastName}`,
                position: compensation.employee.position,
                department: employeeDepartment?.nameTh ?? null,
                departmentId: employeeDepartment?.id ?? null,
                departmentCode: employeeDepartment?.code ?? null,
                branch: employeeBranch?.nameTh ?? null,
                branchId: employeeBranch?.id ?? null,
                branchCode: employeeBranch?.code ?? null,
              },
              compensation: {
                baseSalary,
                /*
                 * เก็บฐานค่าจ้างและที่มาของยอดไว้ตรวจย้อนหลัง
                 * baseSalary ด้านบนคืออัตรา ส่วน basePayAmount คือเงินที่จ่ายจริง
                 */
                salaryBasis,
                basePayAmount,
                basePayWorkedDays: workedDaysForBasePay,
                /*
                 * เบี้ยประจำไม่ได้อยู่ในฐานเงินเดือนอีกแล้ว ย้ายไป "รายการประจำ"
                 * ทั้งหมด — ดูยอดจริงของงวดได้จากบรรทัดรายรับของรายการนั้น ๆ
                 */
                // เก็บที่มาของการหารตามวันไว้ ไม่งั้นตรวจย้อนหลังไม่ได้ว่า
                // ทำไมงวดนี้ได้ไม่เต็มเดือน
                employment: {
                  isPartial: employmentProration.isPartial,
                  isFinalPeriod: employmentProration.isFinalPeriod,
                  employedDays: employmentProration.employedDays,
                  periodDays: employmentProration.periodDays,
                  divisorDays: employmentProration.divisorDays,
                  factor: employmentProration.factor,
                  from: employmentProration.from.toISOString(),
                  to: employmentProration.to.toISOString(),
                  fullBaseSalary: toMoney(compensation.baseSalary),
                },
                paymentMethod: compensation.paymentMethod,
                bankName: compensation.bankName,
                bankAccountNo: compensation.bankAccountNo,
                bankAccountName: compensation.bankAccountName,
                socialSecurityEnabled: compensation.socialSecurityEnabled,
                taxEnabled: compensation.taxEnabled,
              },
              payrollSettings: payrollSettingSnapshot,
              handoff: {
                reviewItemIds: handoffSummary.reviewItemIds,
                overtimeHours: handoffSummary.overtimeHours,
                paidLeaveDays: handoffSummary.paidLeaveDays,
                unpaidLeaveDays: handoffSummary.unpaidLeaveDays,
                payrollCalculationSettings,
              },
              recurring: {
                earningCount: recurringSummary.earningLines.length,
                deductionCount: recurringSummary.deductionLines.length,
                infoCount: recurringSummary.infoLines.length,
                /*
                 * บันทึกว่ารายการไหนถูกหารตามวันบ้าง พร้อมยอดเต็มก่อนหาร
                 * เวลาพนักงานทักว่าได้เงินไม่ครบ จะตอบได้จากสลิปโดยไม่ต้องคำนวณใหม่
                 */
                proratedLines: [
                  ...recurringSummary.earningLines,
                  ...recurringSummary.deductionLines,
                  ...recurringSummary.infoLines,
                ]
                  .filter((line) => line.fullAmount !== undefined)
                  .map((line) => ({
                    code: line.code,
                    name: line.name,
                    fullAmount: line.fullAmount,
                    amount: line.amount,
                  })),
              },
              adjustments: {
                adjustmentIds: adjustmentSummary.adjustmentIds ?? [],
              },
              attendance: {
                lateMinutes: attendanceSummary.lateMinutes ?? 0,
                absentDays: attendanceSummary.absentDays ?? 0,
                hasLeaveHandoffUnpaidLeaveDeduction,
              },
              socialSecurity: {
                enabled: socialSecuritySummary.enabled,
                socialSecurityBase: socialSecuritySummary.socialSecurityBase,
                cappedBase: socialSecuritySummary.cappedBase,
                employeeRate: socialSecuritySummary.employeeRate,
                employerRate: socialSecuritySummary.employerRate,
                employeeContribution: socialSecuritySummary.employeeContribution,
                employerContribution: socialSecuritySummary.employerContribution,
                minBase: socialSecuritySummary.minBase,
                maxBase: socialSecuritySummary.maxBase,
                skippedReason: socialSecuritySummary.skippedReason,
              },
              tax: taxCalculation
                ? {
                    enabled: compensation.taxEnabled !== false,
                    integrationStatus: taxCalculation.integrationStatus,
                    taxYearId: taxCalculation.taxYear?.id ?? null,
                    taxProfileId: taxCalculation.taxProfile?.id ?? null,
                    taxableIncomeCurrentRun: taxCalculation.taxableIncomeCurrentRun,
                    regularTaxableIncomeCurrentRun: taxCalculation.regularTaxableIncomeCurrentRun,
                    oneTimeTaxableIncomeCurrentRun: taxCalculation.oneTimeTaxableIncomeCurrentRun,
                    bonusIncome: 'bonusIncome' in taxCalculation ? taxCalculation.bonusIncome : '0.00',
                    otherTaxableIncome: 'otherTaxableIncome' in taxCalculation ? taxCalculation.otherTaxableIncome : '0.00',
                    socialSecurityYtd: taxCalculation.socialSecurityYtd,
                    socialSecurityCurrentRun: taxCalculation.socialSecurityCurrentRun,
                    socialSecurityAllowance: taxCalculation.socialSecurityAllowance,
                    currentRunTax: taxCalculation.currentRunTax,
                    payrollLineCreated: taxDeductionLines.length > 0,
                    warningCodes: (taxCalculation.warnings ?? []).map((warning: any) => warning.code),
                  }
                : {
                    enabled: false,
                    integrationStatus: 'TAX_DISABLED',
                    currentRunTax: '0.00',
                    payrollLineCreated: false,
                  },
            },
          },
        });

        if (taxCalculation?.taxYear?.id && compensation.taxEnabled !== false) {
          await (tx as any).payrollTaxCalculation.create({
            data: {
              companyId: params.companyId,
              payrollRunId: params.runId,
              payrollItemId: item.id,
              employeeId: compensation.employeeId,
              taxYearId: taxCalculation.taxYear.id,
              taxProfileId: taxCalculation.taxProfile?.id ?? null,
              taxableIncomeCurrentRun: toMoneyString(taxCalculation.taxableIncomeCurrentRun),
              projectedAnnualIncome: toMoneyString(taxCalculation.projectedAnnualIncome),
              expenseDeduction: toMoneyString(taxCalculation.expenseDeduction),
              allowanceTotal: toMoneyString(taxCalculation.allowanceTotal),
              netTaxableIncome: toMoneyString(taxCalculation.netTaxableIncome),
              annualTax: toMoneyString(taxCalculation.annualTax),
              taxWithheldYtd: toMoneyString(taxCalculation.taxWithheldYtd),
              remainingTax: toMoneyString(taxCalculation.remainingTax),
              currentRunTax: toMoneyString(taxAmount),
              roundingAdjustment: toMoneyString(taxCalculation.roundingAdjustment),
              status: 'CALCULATED',
              calculationSnapshot: {
                ...(taxCalculation.calculationSnapshot ?? {}),
                isPreviewOnly: false,
                willWritePayrollLine: taxDeductionLines.length > 0,
                integrationStatus: taxCalculation.integrationStatus,
                warnings: taxCalculation.warnings ?? [],
              },
              note: taxDeductionLines.length > 0
                ? 'คำนวณและสร้าง PayrollLine TAX อัตโนมัติ'
                : taxCalculation.taxProfile
                  ? 'คำนวณภาษีแล้ว แต่ไม่มียอดภาษีที่ต้องหักในงวดนี้'
                  : 'ยังไม่มีข้อมูลภาษีพนักงานที่พร้อมใช้ จึงยังไม่สร้าง PayrollLine TAX',
            },
          });
        }

        /**
         * สร้าง PayrollLine ทั้งหมดของพนักงาน
         * - payrollEarningLines: เงินเดือน/allowance/OT
         * - payrollDeductionLines: รายการหักจาก HR Review เช่น ลาไม่รับค่าจ้าง
         * - payrollInfoLines: รายการข้อมูลประกอบ เช่น paid leave / time adjust
         * - payrollEmployerContributionLines: เงินสมทบนายจ้างที่แสดงเพื่อประกอบข้อมูล ไม่กระทบ net pay
         */
        /*
         * เตรียมข้อมูลให้ครบก่อน แล้วเขียนทีเดียวด้วย createMany
         *
         * ของเดิมเขียนทีละบรรทัดใน loop ซ้อน loop พนักงาน ทำให้ยิงคำสั่งไปฐานข้อมูล
         * ~15-25 ครั้งต่อคน · 200 คนคือหลักพันครั้ง ในธุรกรรมเดียวที่มีเพดาน 60 วินาที
         * พอ timeout จะ rollback ทั้งงวด แปลว่ายิ่งบริษัทใหญ่ยิ่งคำนวณไม่ได้เลย
         *
         * การหา component ยังต้อง await ทีละบรรทัด แต่มี cache (componentMap/componentById)
         * ที่ใช้ร่วมกันทั้งงวด หลังพนักงานคนแรกจึงแทบไม่แตะฐานข้อมูลอีก
         */
        const payrollLineData: Prisma.PayrollLineCreateManyInput[] = [];

        for (const line of [
          ...payrollEarningLines,
          ...payrollDeductionLines,
          ...payrollEmployerContributionLines,
          ...payrollInfoLines,
        ]) {
          const component = await this.resolvePayrollLineComponent(tx, {
            companyId: params.companyId,
            componentMap,
            componentById,
            line,
          });

          /*
           * รายการปรับปรุงเฉพาะงวด ให้ใช้ชื่อที่ HR ตั้งไว้กับรายการนั้นจริง ๆ
           *
           * รายการกลุ่มนี้หลายโค้ดผูกกับ component กลางตัวเดียวกัน (OTHER_DEDUCTION)
           * ถ้าเอาชื่อ component มาทับ "ค่าปรับ" กับ "รายจ่ายอื่น ๆ" จะกลายเป็น
           * "รายการหักอื่น ๆ" เหมือนกันทั้งคู่ อ่านสลิปแล้วแยกไม่ออกว่าโดนหักอะไร
           *
           * รายการประเภทอื่นยังใช้ชื่อจาก component เหมือนเดิม เพื่อให้บริษัทที่
           * เปลี่ยนชื่อรายการในหน้าตั้งค่าเห็นชื่อใหม่บนสลิป
           */
          const isAdjustmentLine = line.sourceType === 'ADJUSTMENT';
          const lineName = isAdjustmentLine
            ? (line.name ?? component?.nameTh)
            : (component?.nameTh ?? line.name);

          payrollLineData.push({
            payrollItemId: item.id,
            componentId: component?.id ?? null,
            code: line.code,
            name: lineName,
            type: line.type,
            sourceType: line.sourceType,
            sourceId: line.sourceId,
            quantity: toMoneyString(line.quantity),
            rate: toMoneyString(line.rate),
            amount: toMoneyString(line.amount),
            isTaxable: line.isTaxable ?? component?.isTaxable ?? true,
            isSocialSecurityBase:
              line.isSocialSecurityBase ??
              component?.isSocialSecurityBase ??
              false,
            sortOrder: line.sortOrder,
            note: line.note ?? null,
          });
        }

        if (payrollLineData.length > 0) {
          await tx.payrollLine.createMany({ data: payrollLineData });
        }

        // เดินยอดหนี้ของแผนผ่อนงวดหลังจากรู้ payrollItemId แล้ว
        await this.payrollDeductionPlanService.commitDeductionPlanEntries(tx, {
          payrollRunId: params.runId,
          payrollItemId: item.id,
          entries: deductionPlanEntriesToCommit,
        });

        await this.payrollHandoffImportService.markReviewItemsSentToPayroll(tx, {
          reviewItemIds: handoffSummary.reviewItemIds,
          periodId: params.periodId,
          payrollRunId: params.runId,
          userId: params.userId,
        });

        await this.payrollAdjustmentImportService.markAdjustmentsImported(tx, {
          adjustmentIds: adjustmentSummary.adjustmentIds ?? [],
          periodId: params.periodId,
          payrollRunId: params.runId,
          userId: params.userId,
        });

        totalEmployees += 1;

        this.payrollProgressService.updateEmployeeProgress(
          params.runId,
          totalEmployees,
          compensations.length,
          `คำนวณพนักงาน ${totalEmployees}/${compensations.length} รายแล้ว`,
        );
      }

      this.payrollProgressService.update(params.runId, {
        step: 'MARK_SOURCES',
        message: 'บันทึกสถานะแหล่งข้อมูลที่ส่งเข้า Payroll แล้ว',
        processedEmployees: totalEmployees,
        totalEmployees: compensations.length,
        percent: 90,
      });

      await this.markAttendanceSummariesSentToPayroll(tx, {
        employeeIds: compensations.map((compensation: any) => compensation.employeeId),
        periodId: params.periodId,
        runId: params.runId,
        periodStartDate: params.periodStartDate,
        periodEndDate: params.periodEndDate,
        userId: params.userId,
      });

      this.payrollProgressService.update(params.runId, {
        step: 'SAVE_TOTALS',
        message: 'บันทึกยอดรวม Payroll Run',
        processedEmployees: totalEmployees,
        totalEmployees: compensations.length,
        percent: 94,
      });

      /*
       * ยอดรวมของรอบต้องนับจากรายการทั้งหมดที่อยู่ในรอบ ไม่ใช่จากลูปที่เพิ่งคำนวณ
       * ตอนคำนวณรายคน ลูปจะวนแค่คนเดียว ถ้าเอายอดจากลูปไปเขียนทับ
       * ยอดรวมของงวดจะกลายเป็นยอดของคนคนเดียวทันที
       */
      const runTotals = await tx.payrollItem.aggregate({
        where: { runId: params.runId },
        _count: { _all: true },
        _sum: {
          totalEarnings: true,
          totalDeductions: true,
          totalGrossPay: true,
          totalNetPay: true,
        },
      });

      await tx.payrollRun.update({
        where: {
          id: params.runId,
        },
        data: {
          status: 'CALCULATED',
          totalEmployees: runTotals._count._all,
          totalEarnings: toMoneyString(Number(runTotals._sum.totalEarnings ?? 0)),
          totalDeductions: toMoneyString(
            Number(runTotals._sum.totalDeductions ?? 0),
          ),
          totalGrossPay: toMoneyString(Number(runTotals._sum.totalGrossPay ?? 0)),
          totalNetPay: toMoneyString(Number(runTotals._sum.totalNetPay ?? 0)),
          calculatedAt: new Date(),
          calculatedById: params.userId ?? null,
          errorMessage: null,
          payrollSettingSnapshot,
        },
      });
    }, PAYROLL_CALCULATION_TRANSACTION_OPTIONS);

    this.payrollProgressService.update(params.runId, {
      step: 'VERIFY_SOURCES',
      message: 'ตรวจสอบแหล่งข้อมูลหลังคำนวณ',
      percent: 97,
    });

    const calculationVerification =
      await this.payrollCalculationVerificationService.verifyRunSources(params.runId);
    const response = params.responseMode === 'summary'
      ? await this.findRunActionSummary(params.runId)
      : await this.findRunById(params.runId, params.scope);

    return {
      ...(response as any),
      calculationVerification,
    };
  }


  private collectPayrollRunIntegrityIssues(run: any) {
    const issues: Array<{
      employeeId?: string | null;
      employeeCode?: string | null;
      employeeName?: string | null;
      departmentName?: string | null;
      detail: string;
      amount?: string | null;
    }> = [];
    const items = Array.isArray(run?.items) ? run.items : [];
    let itemEarningsTotal = 0;
    let itemDeductionsTotal = 0;
    let itemGrossTotal = 0;
    let itemNetTotal = 0;

    const employeeName = (employee: any) =>
      employee?.displayName ||
      [employee?.title, employee?.firstName, employee?.lastName]
        .filter(Boolean)
        .join(' ') ||
      employee?.employeeCode ||
      '-';

    const addIssue = (item: any, detail: string, amount?: unknown) => {
      issues.push({
        employeeId: item?.employee?.id ?? item?.employeeId ?? null,
        employeeCode: item?.employee?.employeeCode ?? '-',
        employeeName: employeeName(item?.employee),
        departmentName:
          item?.employee?.department?.nameTh ?? item?.employee?.branch?.nameTh ?? null,
        detail,
        amount: amount == null ? null : toMoneyString(amount),
      });
    };

    for (const item of items) {
      const lines = Array.isArray(item.lines) ? item.lines : [];
      const earningTotal = addMoney(
        ...lines
          .filter((line: any) => line.type === 'EARNING')
          .map((line: any) => line.amount),
      );
      const deductionTotal = addMoney(
        ...lines
          .filter((line: any) => line.type === 'DEDUCTION')
          .map((line: any) => line.amount),
      );
      const grossTotal = earningTotal;
      const netTotal = toMoney(grossTotal - deductionTotal);
      const itemEarnings = toMoney(item.totalEarnings);
      const itemDeductions = toMoney(item.totalDeductions);
      const itemGross = toMoney(item.totalGrossPay);
      const itemNet = toMoney(item.totalNetPay);

      itemEarningsTotal += itemEarnings;
      itemDeductionsTotal += itemDeductions;
      itemGrossTotal += itemGross;
      itemNetTotal += itemNet;

      if (!lines.length) {
        addIssue(item, 'ไม่มี PayrollLine ในรายการพนักงานนี้');
      }
      if (this.hasMoneyMismatch(earningTotal, itemEarnings)) {
        addIssue(item, `ยอดรายได้ line ${toMoneyString(earningTotal)} ไม่ตรงกับ item ${toMoneyString(itemEarnings)}`, itemEarnings);
      }
      if (this.hasMoneyMismatch(deductionTotal, itemDeductions)) {
        addIssue(item, `ยอดรายหัก line ${toMoneyString(deductionTotal)} ไม่ตรงกับ item ${toMoneyString(itemDeductions)}`, itemDeductions);
      }
      if (this.hasMoneyMismatch(grossTotal, itemGross)) {
        addIssue(item, `ยอด gross line ${toMoneyString(grossTotal)} ไม่ตรงกับ item ${toMoneyString(itemGross)}`, itemGross);
      }
      if (this.hasMoneyMismatch(netTotal, itemNet)) {
        addIssue(item, `ยอดสุทธิ line ${toMoneyString(netTotal)} ไม่ตรงกับ item ${toMoneyString(itemNet)}`, itemNet);
      }

      const sourceLineCount = new Map<string, number>();
      lines
        .filter((line: any) =>
          ['OVERTIME', 'LEAVE', 'ADJUSTMENT'].includes(String(line.sourceType)) &&
          Boolean(line.sourceId) &&
          ['EARNING', 'DEDUCTION'].includes(String(line.type)),
        )
        .forEach((line: any) => {
          const key = `${line.sourceType}:${line.sourceId}:${line.type}`;
          sourceLineCount.set(key, (sourceLineCount.get(key) ?? 0) + 1);
        });

      const duplicatedSource = Array.from(sourceLineCount.entries()).find(([, count]) => count > 1);
      if (duplicatedSource) {
        addIssue(item, `พบ PayrollLine ซ้ำจาก source เดียวกัน (${duplicatedSource[0]}) ${duplicatedSource[1]} บรรทัด`);
      }
    }

    const runIssueItem = (detail: string, amount?: unknown) => {
      issues.push({
        detail,
        amount: amount == null ? null : toMoneyString(amount),
      });
    };

    if (Number(run?.totalEmployees ?? 0) !== items.length) {
      runIssueItem(`จำนวนพนักงานใน Run ${Number(run?.totalEmployees ?? 0).toLocaleString('th-TH')} ไม่ตรงกับ item ${items.length.toLocaleString('th-TH')}`);
    }
    if (this.hasMoneyMismatch(itemEarningsTotal, run?.totalEarnings)) {
      runIssueItem(`ยอดรายได้รวม item ${toMoneyString(itemEarningsTotal)} ไม่ตรงกับ run ${toMoneyString(run?.totalEarnings)}`, run?.totalEarnings);
    }
    if (this.hasMoneyMismatch(itemDeductionsTotal, run?.totalDeductions)) {
      runIssueItem(`ยอดรายหักรวม item ${toMoneyString(itemDeductionsTotal)} ไม่ตรงกับ run ${toMoneyString(run?.totalDeductions)}`, run?.totalDeductions);
    }
    if (this.hasMoneyMismatch(itemGrossTotal, run?.totalGrossPay)) {
      runIssueItem(`ยอด gross รวม item ${toMoneyString(itemGrossTotal)} ไม่ตรงกับ run ${toMoneyString(run?.totalGrossPay)}`, run?.totalGrossPay);
    }
    if (this.hasMoneyMismatch(itemNetTotal, run?.totalNetPay)) {
      runIssueItem(`ยอดสุทธิรวม item ${toMoneyString(itemNetTotal)} ไม่ตรงกับ run ${toMoneyString(run?.totalNetPay)}`, run?.totalNetPay);
    }

    return issues;
  }

  /**
   * ยอดสองก้อนต้องตรงกันเป๊ะ ไม่ยอมให้คลาดเคลื่อนแม้แต่สตางค์เดียว
   *
   * ทุกบรรทัดถูกเก็บผ่าน toMoneyString (ทศนิยม 2 ตำแหน่ง) และยอดรวมก็มาจาก
   * addMoney ของค่าเหล่านั้น จึงต้องบวกได้ลงตัวพอดีอยู่แล้ว
   *
   * ของเดิมยอมให้ต่างได้ถึง 0.01 ซึ่งแปลว่าสลิปที่บรรทัดรวมได้ X
   * อาจถูกโอนจริง X±0.01 ต่อคนโดยไม่มีอะไรจับได้ และยังกลบบั๊กการปัดเศษ
   * ที่อาจเกิดขึ้นในอนาคตไปด้วย
   *
   * เทียบเป็นสตางค์ (จำนวนเต็ม) เพื่อไม่ให้ตัวเปรียบเทียบเองเจอปัญหา float
   */
  private hasMoneyMismatch(left: unknown, right: unknown) {
    const leftSatang = Math.round(toMoney(left) * 100);
    const rightSatang = Math.round(toMoney(right) * 100);

    return leftSatang !== rightSatang;
  }

  private async markAttendanceSummariesSentToPayroll(
    tx: Prisma.TransactionClient,
    params: {
      employeeIds: string[];
      periodId: string;
      runId: string;
      periodStartDate: Date;
      periodEndDate: Date;
      userId?: string;
    },
  ) {
    const employeeIds = Array.from(new Set(params.employeeIds.filter(Boolean)));
    if (!employeeIds.length) return;

    await (tx as any).attendanceDailySummary.updateMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: {
          gte: params.periodStartDate,
          lte: params.periodEndDate,
        },
        reviewStatus: {
          in: ['SENT_TO_PAYROLL', 'LOCKED'],
        },
        OR: [
          { payrollRunId: null },
          { payrollRunId: params.runId },
        ],
      },
      data: {
        reviewStatus: 'SENT_TO_PAYROLL',
        payrollPeriodId: params.periodId,
        payrollRunId: params.runId,
        sentToPayrollAt: new Date(),
        sentToPayrollById: params.userId ?? null,
      },
    });
  }

  private normalizePositiveNumber(value: unknown, fallback: number) {
    const number = Number(value ?? fallback);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  /**
   * Phase 9B: ให้ PayrollLine ทุกบรรทัดผูก PayrollComponent ได้เองจาก code/sourceType
   * เพื่อลดรายการ componentId ว่าง และทำให้ตรวจย้อนกลับรายได้/รายหักได้ครบก่อนปิดงวด
   */
  private async resolvePayrollLineComponent(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      componentMap: Map<string, any>;
      componentById: Map<string, any>;
      line: {
        componentId?: string | null;
        code: string;
        name: string;
        type: string;
        sourceType: string;
        isTaxable?: boolean | null;
        isSocialSecurityBase?: boolean | null;
        sortOrder?: number | null;
      };
    },
  ) {
    if (params.line.componentId) {
      const byId = params.componentById.get(params.line.componentId);
      if (byId) return byId;

      const component = await (tx as any).payrollComponent.findFirst({
        where: {
          id: params.line.componentId,
          companyId: params.companyId,
          deletedAt: null,
        },
      });

      if (component) {
        params.componentById.set(component.id, component);
        params.componentMap.set(component.code, component);
        return component;
      }
    }

    const byCode = params.componentMap.get(params.line.code);
    if (byCode) return byCode;

    const existing = await (tx as any).payrollComponent.findFirst({
      where: {
        companyId: params.companyId,
        code: params.line.code,
        deletedAt: null,
      },
    });

    if (existing) {
      params.componentMap.set(existing.code, existing);
      params.componentById.set(existing.id, existing);
      return existing;
    }

    const component = await (tx as any).payrollComponent.create({
      data: {
        companyId: params.companyId,
        code: params.line.code,
        nameTh: params.line.name || params.line.code,
        nameEn: params.line.code,
        description: 'สร้างอัตโนมัติจาก Payroll Calculate เพื่อให้ PayrollLine ตรวจย้อนกลับ component ได้ครบ',
        type: params.line.type,
        sourceType: params.line.sourceType,
        isTaxable: params.line.isTaxable ?? true,
        isSocialSecurityBase: params.line.isSocialSecurityBase ?? false,
        isRecurring: ['BASE_SALARY', 'ALLOWANCE'].includes(params.line.sourceType),
        sortOrder: params.line.sortOrder ?? 999,
        status: 'ACTIVE',
      },
    });

    params.componentMap.set(component.code, component);
    params.componentById.set(component.id, component);

    return component;
  }

  /**
   * ตรวจสาขาที่เลือกให้เป็นของบริษัทนี้จริง แล้วคืนเป็นรายการที่ไม่ซ้ำ
   *
   * คืน array ว่างเมื่อไม่ได้เลือก = ทั้งบริษัท ซึ่งเป็นพฤติกรรมเดิม
   */
  private async resolveRunBranchIds(
    companyId: string,
    branchIds?: string[],
  ): Promise<string[]> {
    const requested = [...new Set((branchIds ?? []).filter(Boolean))];

    if (requested.length === 0) {
      return [];
    }

    const found = await this.prisma.branch.findMany({
      select: { id: true },
      where: { companyId, deletedAt: null, id: { in: requested } },
    });

    if (found.length !== requested.length) {
      throw new BadRequestException(
        'มีสาขาที่เลือกไม่อยู่ในบริษัทนี้ หรือถูกลบไปแล้ว',
      );
    }

    return requested;
  }

  /**
   * หา compensation ล่าสุดของพนักงานแต่ละคน ณ งวดเงินเดือน
   */
  private async findLatestCompensationsForRun(params: {
    companyId: string;
    periodStartDate: Date;
    periodEndDate: Date;
    employeeIds?: string[];
    /** ว่าง/ไม่ส่ง = ทั้งบริษัท (พฤติกรรมเดิม) */
    branchIds?: string[];
  }) {
    const compensations = await this.prisma.employeeCompensation.findMany({
      where: {
        companyId: params.companyId,
        status: 'ACTIVE',
        deletedAt: null,
        effectiveDate: {
          lte: params.periodEndDate,
        },
        OR: [
          { endDate: null },
          { endDate: { gte: params.periodStartDate } },
        ],
        /*
         * ใครควรอยู่ในงวดนี้
         * -----------------
         * เดิมดูแค่ "สถานะตอนนี้เป็น ACTIVE/PROBATION ไหม" ซึ่งเป็นการตัดสินแบบ
         * เปิด/ปิด ไม่ดูเวลา คนที่ออกกลางงวดพอปิดเคสแล้วสถานะเปลี่ยนก็หลุดจากงวด
         * ไปทั้งคน ได้ 0 บาท ทั้งที่ทำงานจริงไปแล้วครึ่งงวด และดึงกลับเข้ามาไม่ได้
         *
         * เปลี่ยนเป็นดู "ช่วงที่เป็นพนักงานทับกับงวดไหม" — เข้างานก่อนงวดจบ และ
         * ยังไม่พ้นสภาพก่อนงวดเริ่ม คนที่ออกกลางงวดจึงกลับมาอยู่ในงวดสุดท้ายเอง
         * โดยไม่ต้องพึ่งลำดับการกดปุ่มของ HR
         */
        employee: {
          deletedAt: null,
          startDate: { lte: params.periodEndDate },
          OR: [
            // ยังทำงานอยู่ — ต้องเป็นสถานะที่ยังจ่ายเงินเดือน
            {
              employmentEndDate: null,
              status: { in: ['ACTIVE', 'PROBATION'] },
            },
            // พ้นสภาพแล้ว แต่วันสุดท้ายยังอยู่ในงวดนี้ = ยังมีวันทำงานที่ต้องจ่าย
            { employmentEndDate: { gte: params.periodStartDate } },
          ],
          /*
           * ขอบเขตสาขาของรอบ — ใส่เงื่อนไขเฉพาะตอนเลือกไว้จริงเท่านั้น
           * ไม่เลือก = ไม่มีเงื่อนไขนี้เลย = ได้ทั้งบริษัทเหมือนเดิมเป๊ะ
           */
          ...(params.branchIds?.length
            ? { branchId: { in: params.branchIds } }
            : {}),
        },
        ...(params.employeeIds?.length
          ? {
              employeeId: {
                in: params.employeeIds,
              },
            }
          : {}),
      },
      orderBy: [
        {
          employeeId: 'asc',
        },
        {
          effectiveDate: 'desc',
        },
      ],
      include: {
        employee: {
          include: {
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
      },
    });

    const latestByEmployee = new Map<string, (typeof compensations)[number]>();

    for (const compensation of compensations) {
      if (!latestByEmployee.has(compensation.employeeId)) {
        latestByEmployee.set(compensation.employeeId, compensation);
      }
    }

    return Array.from(latestByEmployee.values());
  }

  /**
   * แยกเงินได้ของงวดนี้เพื่อส่งให้ Tax Engine
   * logic จริงอยู่ที่ utils/payroll-taxable-base.util.ts เพื่อให้เขียนเทสต์คุมได้
   */
  private splitTaxableEarningLinesForTax(lines: Array<any>) {
    return splitTaxableIncome(lines);
  }

  private toPayrollCalculationErrorMessage(error: unknown) {
    if (this.isPrismaTransactionTimeoutError(error)) {
      return PAYROLL_CALCULATION_TIMEOUT_MESSAGE;
    }

    return error instanceof Error ? error.message : String(error);
  }

  private isPrismaTransactionTimeoutError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');

    return (
      message.includes('Transaction API error') ||
      message.includes('expired transaction') ||
      message.includes('timeout for this transaction')
    );
  }


  /**
   * สร้างเลข Payroll Run ไม่ให้ชนกันในงวดเดียวกัน
   */
  /**
   * เลขที่รอบ: <รหัสบริษัท>-<รหัสงวด>-<ลำดับ> เช่น TJC-202608-001
   *
   * ใส่รหัสบริษัทไว้ด้วยเพราะเลขนี้ไปโผล่บนชื่อไฟล์นำส่ง (ktb-ipay-*.txt,
   * sso-1-10-*.txt) สลิป PDF และไฟล์ export ซึ่งไม่ได้บอกบริษัทในตัวมันเอง
   * ถ้าใช้แค่รหัสงวด สองบริษัทที่ทำงวดเดือนเดียวกันจะได้ชื่อไฟล์ชนกันทันที
   *
   * ความไม่ซ้ำระดับฐานข้อมูลยังคุมด้วย unique(periodId, runNo) เหมือนเดิม
   */
  private async generateRunNo(
    periodId: string,
    periodCode: string,
    companyCode?: string | null,
  ) {
    const count = await this.prisma.payrollRun.count({
      where: {
        periodId,
      },
    });

    const sequence = String(count + 1).padStart(3, '0');
    const prefix = companyCode?.trim().toUpperCase();
    // รหัสงวดขึ้นต้นด้วย PAY- อยู่แล้ว ตัดทิ้งไม่ให้เลขยาวเกินจำเป็น
    const periodPart = periodCode.replace(/^PAY-/i, '');

    return [prefix, periodPart, sequence].filter(Boolean).join('-');
  }


  /**
   * ตรวจว่าบริษัทมีอยู่จริงและยังไม่ถูกลบ
   */
  private async assertCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (!company) {
      throw new NotFoundException('ไม่พบบริษัทหรือบริษัทถูกปิดใช้งาน');
    }

    return company;
  }
}
