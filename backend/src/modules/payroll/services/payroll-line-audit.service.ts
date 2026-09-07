import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { toMoneyString } from '../utils/payroll-money.util';

type AuditStatus = 'PASS' | 'FAIL' | 'WARN' | 'INFO';
type AuditSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

type AuditIssueItem = {
  employeeId?: string | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  departmentName?: string | null;
  lineId?: string | null;
  code?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  detail: string;
  amount?: string | null;
};

type AuditCheck = {
  code: string;
  title: string;
  description: string;
  severity: AuditSeverity;
  status: AuditStatus;
  count: number;
  blocking: boolean;
  recommendation: string | null;
  items: AuditIssueItem[];
};

type EmployeeLike = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  department?: { nameTh?: string | null } | null;
  branch?: { nameTh?: string | null } | null;
};

type PayrollLineLike = {
  id: string;
  payrollItemId: string;
  componentId: string | null;
  code: string;
  name: string;
  type: string;
  sourceType: string | null;
  sourceId: string | null;
  amount: unknown;
  component?: { id: string; code: string; sourceType: string | null } | null;
};

type PayrollItemLike = {
  id: string;
  employeeId: string;
  compensationId: string | null;
  baseSalary: unknown;
  totalEarnings: unknown;
  totalDeductions: unknown;
  totalGrossPay: unknown;
  totalNetPay: unknown;
  employee: EmployeeLike;
  lines: PayrollLineLike[];
};

const MONEY_TOLERANCE = 0.01;
const SOURCE_REQUIRED_TYPES = new Set(['EARNING', 'DEDUCTION']);
const SOURCE_OPTIONAL_TYPES = new Set(['INFO', 'EMPLOYER_CONTRIBUTION']);

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isDifferent(left: number, right: number) {
  return Math.abs(roundMoney(left) - roundMoney(right)) > MONEY_TOLERANCE;
}

function getEmployeeName(employee?: EmployeeLike | null) {
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

function getDepartmentName(employee?: EmployeeLike | null) {
  return employee?.department?.nameTh || employee?.branch?.nameTh || null;
}

function lineIssue(item: PayrollItemLike, line: PayrollLineLike, detail: string): AuditIssueItem {
  return {
    employeeId: item.employeeId,
    employeeCode: item.employee.employeeCode,
    employeeName: getEmployeeName(item.employee),
    departmentName: getDepartmentName(item.employee),
    lineId: line.id,
    code: line.code,
    sourceType: line.sourceType,
    sourceId: line.sourceId,
    detail,
    amount: toMoneyString(toNumber(line.amount)),
  };
}

function employeeIssue(item: PayrollItemLike, detail: string, amount?: number): AuditIssueItem {
  return {
    employeeId: item.employeeId,
    employeeCode: item.employee.employeeCode,
    employeeName: getEmployeeName(item.employee),
    departmentName: getDepartmentName(item.employee),
    detail,
    amount: typeof amount === 'number' ? toMoneyString(amount) : null,
  };
}

function buildCheck(params: {
  code: string;
  title: string;
  description: string;
  severity: AuditSeverity;
  blocking: boolean;
  items: AuditIssueItem[];
  passDescription?: string;
  recommendation?: string | null;
}): AuditCheck {
  const hasItems = params.items.length > 0;
  return {
    code: params.code,
    title: params.title,
    description: hasItems ? params.description : params.passDescription || params.description,
    severity: params.severity,
    status: hasItems ? (params.blocking ? 'FAIL' : 'WARN') : 'PASS',
    count: params.items.length,
    blocking: params.blocking && hasItems,
    recommendation: hasItems ? params.recommendation ?? null : null,
    items: params.items.slice(0, 50),
  };
}

@Injectable()
export class PayrollLineAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async auditRun(id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        company: true,
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
                department: { select: { nameTh: true } },
                branch: { select: { nameTh: true } },
              },
            },
            lines: {
              include: { component: true },
              orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบ Payroll Run');
    }

    const items = run.items as unknown as PayrollItemLike[];
    const employeeIds = items.map((item) => item.employeeId);
    const employeeMap = new Map(items.map((item) => [item.employeeId, item]));
    const allLines = items.flatMap((item) => item.lines.map((line) => ({ item, line })));

    const sourceMissingItems: AuditIssueItem[] = [];
    const manualSourceItems: AuditIssueItem[] = [];
    const componentMissingItems: AuditIssueItem[] = [];
    const itemTotalMismatchItems: AuditIssueItem[] = [];

    let lineWithSourceCount = 0;
    let componentMappedCount = 0;
    let manualSourceCount = 0;

    for (const { item, line } of allLines) {
      const hasSourceId = Boolean(line.sourceId);
      const hasSourceType = Boolean(line.sourceType);
      const sourceIsManual = line.sourceType === 'MANUAL';
      const sourceRequired = SOURCE_REQUIRED_TYPES.has(line.type);
      const sourceOptional = SOURCE_OPTIONAL_TYPES.has(line.type);

      if (hasSourceId && hasSourceType && !sourceIsManual) {
        lineWithSourceCount += 1;
      }

      if (line.componentId) {
        componentMappedCount += 1;
      }

      if (sourceIsManual) {
        manualSourceCount += 1;
        manualSourceItems.push(
          lineIssue(
            item,
            line,
            `รายการ ${line.code} ใช้ sourceType = MANUAL ควร map เป็น BASE_SALARY / ALLOWANCE / ADJUSTMENT / ATTENDANCE / OVERTIME ตามต้นทางจริง`,
          ),
        );
      }

      if (sourceRequired && (!hasSourceId || !hasSourceType)) {
        sourceMissingItems.push(
          lineIssue(
            item,
            line,
            `รายการ ${line.code} ยังไม่มี sourceType/sourceId ครบ จึงตรวจย้อนกลับต้นทางไม่ได้`,
          ),
        );
      }

      if (!sourceRequired && !sourceOptional && (!hasSourceId || !hasSourceType)) {
        sourceMissingItems.push(
          lineIssue(
            item,
            line,
            `รายการ ${line.code} ยังไม่มี source ครบ`,
          ),
        );
      }

      if (line.type !== 'INFO' && !line.componentId) {
        componentMissingItems.push(
          lineIssue(
            item,
            line,
            `รายการ ${line.code} ยังไม่ผูก PayrollComponent ทำให้ mapping ภาษี/ประกัน/ชนิดรายการตรวจสอบได้ไม่ครบ`,
          ),
        );
      }
    }

    for (const item of items) {
      const earningSum = item.lines
        .filter((line) => line.type === 'EARNING')
        .reduce((sum, line) => sum + toNumber(line.amount), 0);
      const deductionSum = item.lines
        .filter((line) => line.type === 'DEDUCTION')
        .reduce((sum, line) => sum + toNumber(line.amount), 0);
      const grossSum = earningSum;
      const netSum = grossSum - deductionSum;

      const mismatches: string[] = [];
      if (isDifferent(earningSum, toNumber(item.totalEarnings))) {
        mismatches.push(`รายรับ line ${toMoneyString(earningSum)} แต่ item ${toMoneyString(toNumber(item.totalEarnings))}`);
      }
      if (isDifferent(deductionSum, toNumber(item.totalDeductions))) {
        mismatches.push(`รายการหัก line ${toMoneyString(deductionSum)} แต่ item ${toMoneyString(toNumber(item.totalDeductions))}`);
      }
      if (isDifferent(grossSum, toNumber(item.totalGrossPay))) {
        mismatches.push(`Gross line ${toMoneyString(grossSum)} แต่ item ${toMoneyString(toNumber(item.totalGrossPay))}`);
      }
      if (isDifferent(netSum, toNumber(item.totalNetPay))) {
        mismatches.push(`สุทธิ line ${toMoneyString(netSum)} แต่ item ${toMoneyString(toNumber(item.totalNetPay))}`);
      }

      if (mismatches.length) {
        itemTotalMismatchItems.push(employeeIssue(item, mismatches.join(' / '), netSum));
      }
    }

    const runItemTotalEarnings = items.reduce((sum, item) => sum + toNumber(item.totalEarnings), 0);
    const runItemTotalDeductions = items.reduce((sum, item) => sum + toNumber(item.totalDeductions), 0);
    const runItemTotalGross = items.reduce((sum, item) => sum + toNumber(item.totalGrossPay), 0);
    const runItemTotalNet = items.reduce((sum, item) => sum + toNumber(item.totalNetPay), 0);
    const runMismatchItems: AuditIssueItem[] = [];

    if (isDifferent(runItemTotalEarnings, toNumber(run.totalEarnings))) {
      runMismatchItems.push({
        detail: `รายรับรวมจาก item ${toMoneyString(runItemTotalEarnings)} แต่ PayrollRun ${toMoneyString(toNumber(run.totalEarnings))}`,
        amount: toMoneyString(runItemTotalEarnings),
      });
    }
    if (isDifferent(runItemTotalDeductions, toNumber(run.totalDeductions))) {
      runMismatchItems.push({
        detail: `รายการหักรวมจาก item ${toMoneyString(runItemTotalDeductions)} แต่ PayrollRun ${toMoneyString(toNumber(run.totalDeductions))}`,
        amount: toMoneyString(runItemTotalDeductions),
      });
    }
    if (isDifferent(runItemTotalGross, toNumber(run.totalGrossPay))) {
      runMismatchItems.push({
        detail: `Gross รวมจาก item ${toMoneyString(runItemTotalGross)} แต่ PayrollRun ${toMoneyString(toNumber(run.totalGrossPay))}`,
        amount: toMoneyString(runItemTotalGross),
      });
    }
    if (isDifferent(runItemTotalNet, toNumber(run.totalNetPay))) {
      runMismatchItems.push({
        detail: `สุทธิรวมจาก item ${toMoneyString(runItemTotalNet)} แต่ PayrollRun ${toMoneyString(toNumber(run.totalNetPay))}`,
        amount: toMoneyString(runItemTotalNet),
      });
    }

    const attendanceSummaries = employeeIds.length
      ? await (this.prisma as any).attendanceDailySummary.findMany({
          where: {
            employeeId: { in: employeeIds },
            workDate: {
              gte: run.period.startDate,
              lte: run.period.endDate,
            },
          },
          select: {
            id: true,
            employeeId: true,
            workDate: true,
            latePenaltyAmount: true,
            missingLogPenaltyAmount: true,
            absentDeductionAmount: true,
            earlyCheckoutPenaltyAmount: true,
            unpaidLeaveDeductionAmount: true,
            totalDeductionAmount: true,
            reviewStatus: true,
          },
        })
      : [];

    const attendanceExpectedByEmployee = new Map<string, number>();
    for (const summary of attendanceSummaries) {
      const expected =
        toNumber(summary.latePenaltyAmount) +
        toNumber(summary.missingLogPenaltyAmount) +
        toNumber((summary as any).absentDeductionAmount) +
        toNumber((summary as any).earlyCheckoutPenaltyAmount) +
        toNumber((summary as any).unpaidLeaveDeductionAmount);
      attendanceExpectedByEmployee.set(
        summary.employeeId,
        roundMoney((attendanceExpectedByEmployee.get(summary.employeeId) || 0) + expected),
      );
    }

    const attendanceLineByEmployee = new Map<string, number>();
    for (const { item, line } of allLines) {
      if (
        line.type === 'DEDUCTION' &&
        (line.sourceType === 'ATTENDANCE' ||
          (line.sourceType === 'LEAVE' && line.code === 'UNPAID_LEAVE_DEDUCTION'))
      ) {
        attendanceLineByEmployee.set(
          item.employeeId,
          roundMoney((attendanceLineByEmployee.get(item.employeeId) || 0) + toNumber(line.amount)),
        );
      }
    }

    const attendanceMismatchItems: AuditIssueItem[] = [];
    for (const [employeeId, expected] of attendanceExpectedByEmployee.entries()) {
      const imported = attendanceLineByEmployee.get(employeeId) || 0;
      if (isDifferent(expected, imported)) {
        const item = employeeMap.get(employeeId);
        attendanceMismatchItems.push({
          employeeId,
          employeeCode: item?.employee.employeeCode ?? null,
          employeeName: getEmployeeName(item?.employee),
          departmentName: getDepartmentName(item?.employee),
          detail: `ยอดหัก Attendance จาก Daily Summary ${toMoneyString(expected)} แต่ PayrollLine ${toMoneyString(imported)} ให้กดดึงข้อมูลเข้าเงินเดือนใหม่เพื่อซิงก์ Attendance / Leave แล้วคำนวณ Payroll Run ใหม่`,
          amount: toMoneyString(expected - imported),
        });
      }
    }

    const approvedAdjustments = employeeIds.length
      ? await (this.prisma as any).payrollAdjustment.findMany({
          where: {
            companyId: run.companyId,
            employeeId: { in: employeeIds },
            deletedAt: null,
            status: { in: ['APPROVED', 'IMPORTED'] },
            OR: [
              { payrollRunId: run.id },
              { periodId: run.periodId },
              {
                effectiveDate: {
                  gte: run.period.startDate,
                  lte: run.period.endDate,
                },
              },
            ],
          },
          select: {
            id: true,
            employeeId: true,
            code: true,
            name: true,
            type: true,
            amount: true,
            status: true,
            importedAt: true,
          },
        })
      : [];

    const adjustmentLineSourceIds = new Set(
      allLines
        .filter(({ line }) => line.sourceType === 'ADJUSTMENT' && line.sourceId)
        .map(({ line }) => line.sourceId),
    );

    const adjustmentMissingItems: AuditIssueItem[] = [];
    for (const adjustment of approvedAdjustments) {
      if (!adjustmentLineSourceIds.has(adjustment.id)) {
        const item = employeeMap.get(adjustment.employeeId);
        adjustmentMissingItems.push({
          employeeId: adjustment.employeeId,
          employeeCode: item?.employee.employeeCode ?? null,
          employeeName: getEmployeeName(item?.employee),
          departmentName: getDepartmentName(item?.employee),
          code: adjustment.code,
          sourceType: 'ADJUSTMENT',
          sourceId: adjustment.id,
          detail: `Adjustment ${adjustment.code} (${adjustment.name}) สถานะ ${adjustment.status} ยังไม่พบ PayrollLine ที่ผูก sourceId นี้`,
          amount: toMoneyString(toNumber(adjustment.amount)),
        });
      }
    }

    const approvedOtRequests = employeeIds.length
      ? await (this.prisma as any).overtimeRequest.findMany({
          where: {
            employeeId: { in: employeeIds },
            deletedAt: null,
            status: 'APPROVED',
            workDate: {
              gte: run.period.startDate,
              lte: run.period.endDate,
            },
          },
          select: {
            id: true,
            employeeId: true,
            requestNo: true,
            workDate: true,
            totalHours: true,
          },
        })
      : [];

    const overtimeLineSourceIds = new Set(
      allLines
        .filter(({ line }) => line.sourceType === 'OVERTIME' && line.sourceId)
        .map(({ line }) => line.sourceId),
    );

    const overtimeMissingItems: AuditIssueItem[] = [];
    for (const overtime of approvedOtRequests) {
      if (!overtimeLineSourceIds.has(overtime.id)) {
        const item = employeeMap.get(overtime.employeeId);
        overtimeMissingItems.push({
          employeeId: overtime.employeeId,
          employeeCode: item?.employee.employeeCode ?? null,
          employeeName: getEmployeeName(item?.employee),
          departmentName: getDepartmentName(item?.employee),
          sourceType: 'OVERTIME',
          sourceId: overtime.id,
          detail: `OT ${overtime.requestNo ?? overtime.id} อนุมัติแล้ว ${toNumber(overtime.totalHours)} ชม. แต่ยังไม่พบ PayrollLine OVERTIME ที่ผูก sourceId นี้`,
          amount: null,
        });
      }
    }

    const checks = [
      buildCheck({
        code: 'PAYROLL_LINE_SOURCE_REQUIRED',
        title: 'PayrollLine ต้องมี source ตรวจย้อนกลับได้',
        description: 'พบ PayrollLine ที่ยังไม่มี sourceType/sourceId ครบ ทำให้ตรวจไม่ได้ว่ายอดเงินมาจากข้อมูลใด',
        passDescription: 'PayrollLine ที่เป็นรายรับ/รายหักมี sourceType/sourceId ครบ',
        severity: 'CRITICAL',
        blocking: true,
        items: sourceMissingItems,
        recommendation: 'แก้ payroll calculation/import ให้สร้าง sourceType/sourceId ทุกบรรทัด หรือ Recalculate Payroll Run หลังแก้ mapping',
      }),
      buildCheck({
        code: 'PAYROLL_LINE_MANUAL_SOURCE',
        title: 'PayrollLine ไม่ควรใช้ MANUAL ถ้ามีต้นทางชัดเจน',
        description: 'พบ PayrollLine ที่ใช้ sourceType = MANUAL แม้มี sourceId แล้ว ควร map เป็น sourceType ตามต้นทางจริง',
        passDescription: 'ไม่พบรายการที่ใช้ sourceType = MANUAL',
        severity: 'WARNING',
        blocking: false,
        items: manualSourceItems,
        recommendation: 'ตรวจ PayrollComponent ของ BASE_SALARY/ALLOWANCE ให้มี sourceType ที่ถูกต้อง เช่น BASE_SALARY หรือ ALLOWANCE',
      }),
      buildCheck({
        code: 'PAYROLL_COMPONENT_MAPPING',
        title: 'PayrollLine ควรผูก PayrollComponent',
        description: 'พบรายการรายรับ/รายหักที่ยังไม่ผูก PayrollComponent ทำให้ตรวจ mapping ภาษี/ประกัน/หมวดรายได้ได้ไม่ครบ',
        passDescription: 'PayrollLine รายรับ/รายหักผูก PayrollComponent ครบ',
        severity: 'WARNING',
        blocking: false,
        items: componentMissingItems,
        recommendation: 'สร้าง PayrollComponent ให้ครบตาม code และคำนวณใหม่',
      }),
      buildCheck({
        code: 'PAYROLL_ITEM_TOTAL_MATCH',
        title: 'ยอดรวมรายคนต้องตรงกับ PayrollLine',
        description: 'พบยอดรวมใน PayrollItem ไม่ตรงกับผลรวม PayrollLine รายคน',
        passDescription: 'ยอดรวม PayrollItem ตรงกับผลรวม PayrollLine รายคน',
        severity: 'CRITICAL',
        blocking: true,
        items: itemTotalMismatchItems,
        recommendation: 'Recalculate Payroll Run เพื่อสร้าง item totals จาก line ใหม่',
      }),
      buildCheck({
        code: 'PAYROLL_RUN_TOTAL_MATCH',
        title: 'ยอดรวม Run ต้องตรงกับผลรวมรายคน',
        description: 'พบยอดรวม PayrollRun ไม่ตรงกับผลรวม PayrollItem',
        passDescription: 'ยอดรวม PayrollRun ตรงกับผลรวม PayrollItem',
        severity: 'CRITICAL',
        blocking: true,
        items: runMismatchItems,
        recommendation: 'Recalculate Payroll Run เพื่อ sync run totals ใหม่',
      }),
      buildCheck({
        code: 'ATTENDANCE_DEDUCTION_MATCH',
        title: 'ยอดหัก Attendance ต้องตรงกับ Daily Summary',
        description: 'พบยอดหัก Attendance ใน PayrollLine ไม่ตรงกับ AttendanceDailySummary ของงวดนี้',
        passDescription: 'ยอดหัก Attendance ใน PayrollLine ตรงกับ Daily Summary',
        severity: 'CRITICAL',
        blocking: true,
        items: attendanceMismatchItems,
        recommendation: 'กดปุ่มดึงข้อมูลเข้าเงินเดือนใหม่ เพื่อซิงก์ Attendance / Leave และคำนวณ Payroll Run ใหม่ แล้วตรวจอีกครั้ง',
      }),
      buildCheck({
        code: 'ADJUSTMENT_IMPORTED_MATCH',
        title: 'Adjustment ที่อนุมัติแล้วต้องเข้า PayrollLine',
        description: 'พบ PayrollAdjustment ที่อนุมัติ/นำเข้าแล้ว แต่ยังไม่พบ PayrollLine ที่ผูก sourceId',
        passDescription: 'Adjustment ที่อนุมัติแล้วถูกผูกกับ PayrollLine ครบ',
        severity: 'WARNING',
        blocking: false,
        items: adjustmentMissingItems,
        recommendation: 'ตรวจ Payroll Adjustment และ Recalculate Payroll Run',
      }),
      buildCheck({
        code: 'OVERTIME_SOURCE_MATCH',
        title: 'OT ที่อนุมัติแล้วต้องมี PayrollLine',
        description: 'พบ OT ที่อนุมัติแล้วในงวด แต่ยังไม่พบ PayrollLine OVERTIME ที่ผูก sourceId',
        passDescription: 'OT ที่อนุมัติแล้วผูกกับ PayrollLine ครบ',
        severity: 'WARNING',
        blocking: false,
        items: overtimeMissingItems,
        recommendation: 'ตรวจ HR Review / OT Ready for Payroll และ Recalculate Payroll Run',
      }),
    ];

    const criticalCount = checks.filter((check) => check.status === 'FAIL' && check.severity === 'CRITICAL').length;
    const warningCount = checks.filter((check) => check.status === 'WARN' || (check.status === 'FAIL' && check.severity === 'WARNING')).length;
    const infoCount = checks.filter((check) => check.status === 'INFO').length;
    const blockingCount = checks.filter((check) => check.blocking).length;

    const attendanceExpectedAmount = Array.from(attendanceExpectedByEmployee.values()).reduce((sum, value) => sum + value, 0);
    const attendanceLineAmount = Array.from(attendanceLineByEmployee.values()).reduce((sum, value) => sum + value, 0);
    const overtimeLineAmount = allLines
      .filter(({ line }) => line.sourceType === 'OVERTIME')
      .reduce((sum, { line }) => sum + toNumber(line.amount), 0);
    const adjustmentLineAmount = allLines
      .filter(({ line }) => line.sourceType === 'ADJUSTMENT')
      .reduce((sum, { line }) => sum + toNumber(line.amount), 0);

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
        isTraceable: blockingCount === 0,
        lineCount: allLines.length,
        lineWithSourceCount,
        sourceMissingCount: sourceMissingItems.length,
        manualSourceCount,
        componentMappedCount,
        componentMissingCount: componentMissingItems.length,
        itemTotalMismatchCount: itemTotalMismatchItems.length,
        runTotalMismatchCount: runMismatchItems.length,
        attendanceMismatchCount: attendanceMismatchItems.length,
        adjustmentMissingCount: adjustmentMissingItems.length,
        overtimeMissingCount: overtimeMissingItems.length,
        attendanceExpectedAmount: toMoneyString(attendanceExpectedAmount),
        attendanceLineAmount: toMoneyString(attendanceLineAmount),
        adjustmentLineAmount: toMoneyString(adjustmentLineAmount),
        overtimeLineAmount: toMoneyString(overtimeLineAmount),
        criticalCount,
        warningCount,
        infoCount,
        blockingCount,
        checkedAt: new Date().toISOString(),
      },
      checks,
    };
  }
}
