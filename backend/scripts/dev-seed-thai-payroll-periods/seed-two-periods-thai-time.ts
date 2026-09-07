/* eslint-disable no-console */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

type PeriodKey = "2026-04" | "2026-05";

type SeedPeriod = {
  key: PeriodKey;
  label: string;
  startDate: string;
  endDate: string;
  prefixDate: string;
};

type Args = {
  dryRun: boolean;
  companyId?: string;
  employeeCodes?: string[];
  maxEmployees: number;
  periods: PeriodKey[];
  summaryStatus: "READY_FOR_PAYROLL" | "CALCULATED" | "NEED_REVIEW";
};

type EmployeeSeedRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  companyId: string;
  userId: string | null;
  branchId: string | null;
  departmentId: string | null;
};

type LeaveTypeSeedRow = {
  id: string;
  code: string;
  nameTh: string;
  isPaid: boolean;
};

type ScenarioKey =
  | "NORMAL"
  | "MORNING_LATE"
  | "AFTERNOON_LATE"
  | "MISSING_CHECKOUT"
  | "PAID_FULL_DAY_LEAVE"
  | "UNPAID_FULL_DAY_LEAVE"
  | "UNPAID_HALF_MORNING"
  | "PAID_HALF_AFTERNOON"
  | "UNPAID_HOURLY"
  | "OFFSITE_APPROVED_FULL"
  | "OFFSITE_APPROVED_WITH_LOGS"
  | "OFFSITE_SUBMITTED_REVIEW"
  | "EARLY_CHECKOUT"
  | "LATE_CHECKOUT"
  | "ABSENT_NO_LOGS";

type SummaryData = {
  morningInAt?: Date | null;
  afternoonInAt?: Date | null;
  checkOutAt?: Date | null;
  morningLateMinutes?: number;
  afternoonLateMinutes?: number;
  totalLateMinutes?: number;
  isMorningMissing?: boolean;
  isAfternoonMissing?: boolean;
  isCheckoutMissing?: boolean;
  hasMissingLog?: boolean;
  isAbsent?: boolean;
  absentDays?: string;
  earlyCheckoutMinutes?: number;
  lateCheckoutMinutes?: number;
  extraPresenceMinutes?: number;
  latePenaltyAmount?: string;
  missingLogPenaltyAmount?: string;
  missingMorningPenaltyAmount?: string;
  missingAfternoonPenaltyAmount?: string;
  missingCheckoutPenaltyAmount?: string;
  earlyCheckoutPenaltyAmount?: string;
  absentDeductionAmount?: string;
  unpaidLeaveDeductionAmount?: string;
  totalDeductionAmount?: string;
  paidLeaveMinutes?: number;
  unpaidLeaveMinutes?: number;
  offsiteMinutes?: number;
  offsiteStatus?: string | null;
  leaveRequestId?: string | null;
  leaveTypeId?: string | null;
  leaveIsPaid?: boolean | null;
  leaveDayType?: string | null;
  leaveDurationDays?: string;
  reviewStatus?: string;
  calculationStatus?: string;
  calculationNote?: string;
};

type CreatedIds = {
  leaveRequestId?: string;
  offsiteRequestId?: string;
};

const PERIODS: SeedPeriod[] = [
  {
    key: "2026-04",
    label: "26/04/2026 - 25/05/2026",
    startDate: "2026-04-26",
    endDate: "2026-05-25",
    prefixDate: "20260426",
  },
  {
    key: "2026-05",
    label: "26/05/2026 - 25/06/2026",
    startDate: "2026-05-26",
    endDate: "2026-06-25",
    prefixDate: "20260526",
  },
];

const SCENARIOS: ScenarioKey[] = [
  "NORMAL",
  "MORNING_LATE",
  "AFTERNOON_LATE",
  "MISSING_CHECKOUT",
  "PAID_FULL_DAY_LEAVE",
  "UNPAID_FULL_DAY_LEAVE",
  "UNPAID_HALF_MORNING",
  "PAID_HALF_AFTERNOON",
  "UNPAID_HOURLY",
  "OFFSITE_APPROVED_FULL",
  "OFFSITE_APPROVED_WITH_LOGS",
  "OFFSITE_SUBMITTED_REVIEW",
  "EARLY_CHECKOUT",
  "LATE_CHECKOUT",
  "ABSENT_NO_LOGS",
];

const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  NORMAL: "ปกติครบ 3 รอบ",
  MORNING_LATE: "สายเช้า",
  AFTERNOON_LATE: "สายบ่าย",
  MISSING_CHECKOUT: "ลืมสแกนออกงาน",
  PAID_FULL_DAY_LEAVE: "ลาได้รับค่าจ้างเต็มวัน",
  UNPAID_FULL_DAY_LEAVE: "ลาไม่รับค่าจ้างเต็มวัน",
  UNPAID_HALF_MORNING: "ลาไม่รับค่าจ้างครึ่งวันเช้า",
  PAID_HALF_AFTERNOON: "ลาได้รับค่าจ้างครึ่งวันบ่าย",
  UNPAID_HOURLY: "ลาไม่รับค่าจ้างรายชั่วโมง",
  OFFSITE_APPROVED_FULL: "Offsite อนุมัติเต็มวัน",
  OFFSITE_APPROVED_WITH_LOGS: "Offsite อนุมัติพร้อมลงเวลา",
  OFFSITE_SUBMITTED_REVIEW: "Offsite รอตรวจ/ยังไม่อนุมัติ",
  EARLY_CHECKOUT: "ออกก่อนเวลา",
  LATE_CHECKOUT: "กลับช้า",
  ABSENT_NO_LOGS: "ขาดงาน/ไม่มีเวลาทั้งวัน",
};

const DEFAULT_MAX_EMPLOYEES = 9;
const DEV_SOURCE = "DEV_SEED_THAI_TIME";
const MORNING_START_MINUTES = 8 * 60 + 30;
const AFTERNOON_START_MINUTES = 13 * 60;
const CHECKOUT_MINUTES = 17 * 60;
const LATE_PENALTY_PER_15_MIN = 25;
const MISSING_LOG_PENALTY = 100;
const EARLY_CHECKOUT_PENALTY = 100;
const ABSENT_DEDUCTION = 500;
const HALF_DAY_DEDUCTION = 250;
const HOURLY_DEDUCTION = 125;

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const getValue = (name: string) => {
    const prefix = `--${name}=`;
    const exactIndex = args.findIndex((item) => item === `--${name}`);
    const withValue = args.find((item) => item.startsWith(prefix));
    if (withValue) return withValue.slice(prefix.length);
    if (exactIndex >= 0) return args[exactIndex + 1];
    return undefined;
  };

  const dryRun = args.includes("--dryRun");
  const companyId = getValue("companyId");
  const employeeCodesRaw = getValue("employeeCodes");
  const periodRaw = getValue("period");
  const periodsRaw = getValue("periods");
  const maxEmployeesRaw = getValue("maxEmployees");
  const summaryStatusRaw = getValue("summaryStatus") as Args["summaryStatus"] | undefined;

  let periods: PeriodKey[] = ["2026-04", "2026-05"];
  const selectedPeriodRaw = periodRaw ?? periodsRaw;
  if (selectedPeriodRaw && selectedPeriodRaw !== "all") {
    periods = selectedPeriodRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean) as PeriodKey[];
  }

  const allowedPeriods = new Set<PeriodKey>(["2026-04", "2026-05"]);
  const invalidPeriod = periods.find((item) => !allowedPeriods.has(item));
  if (invalidPeriod) {
    throw new Error(`Unsupported period: ${invalidPeriod}. Use 2026-04, 2026-05 or all.`);
  }

  const maxEmployees = Number(maxEmployeesRaw ?? DEFAULT_MAX_EMPLOYEES);
  if (!Number.isFinite(maxEmployees) || maxEmployees < 1) {
    throw new Error("--maxEmployees must be a positive number");
  }

  const summaryStatus = summaryStatusRaw ?? "READY_FOR_PAYROLL";
  if (!["READY_FOR_PAYROLL", "CALCULATED", "NEED_REVIEW"].includes(summaryStatus)) {
    throw new Error("--summaryStatus must be READY_FOR_PAYROLL, CALCULATED or NEED_REVIEW");
  }

  const employeeCodes = employeeCodesRaw
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    dryRun,
    companyId,
    employeeCodes,
    maxEmployees,
    periods,
    summaryStatus,
  };
}

function splitDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function dateOnly(date: string) {
  const { year, month, day } = splitDate(date);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function bkkDateTime(date: string, hour: number, minute = 0) {
  const { year, month, day } = splitDate(date);
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0));
}

function addDays(date: string, days: number) {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function datesBetween(startDate: string, endDate: string) {
  const output: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    output.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return output;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "EMP";
}

function minutes(hour: number, minute = 0) {
  return hour * 60 + minute;
}

function latePenalty(lateMinutes: number) {
  if (lateMinutes <= 0) return 0;
  return Math.ceil(lateMinutes / 15) * LATE_PENALTY_PER_15_MIN;
}

function scenarioFor(employeeIndex: number, dateIndex: number): ScenarioKey {
  return SCENARIOS[(employeeIndex + dateIndex) % SCENARIOS.length];
}

function buildSeedPrefix(period: SeedPeriod) {
  return `DEV-TH2P-${period.prefixDate}`;
}

function buildRawRecordId(period: SeedPeriod, employee: EmployeeSeedRow, date: string, session: string) {
  return `${buildSeedPrefix(period)}-${sanitize(employee.employeeCode)}-${date.replace(/-/g, "")}-${session}`;
}

function buildRequestNo(kind: "LV" | "OS" | "TA", period: SeedPeriod, employee: EmployeeSeedRow, date: string, scenario: ScenarioKey) {
  return `${kind}-TH2P-${period.prefixDate}-${sanitize(employee.employeeCode)}-${date.replace(/-/g, "")}-${scenario}`.slice(0, 96);
}

function displayName(employee: EmployeeSeedRow) {
  return employee.displayName || `${employee.firstName} ${employee.lastName}`.trim() || employee.employeeCode;
}

function logRow(params: {
  employeeId: string;
  workDate: string;
  logType: "CHECK_IN" | "CHECK_OUT";
  logTime: Date;
  status?: string;
  session: "MORNING" | "AFTERNOON" | "EVENING";
  rawScannerRecordId: string;
  isOffsite?: boolean;
  offsiteRequestId?: string | null;
  note?: string;
}) {
  return {
    employeeId: params.employeeId,
    workDate: dateOnly(params.workDate),
    logType: params.logType,
    logTime: params.logTime,
    channel: "IMPORT",
    status: params.status ?? "NORMAL",
    source: DEV_SOURCE,
    session: params.session,
    rawScannerRecordId: params.rawScannerRecordId,
    isOffsite: params.isOffsite ?? false,
    offsiteRequestId: params.offsiteRequestId ?? null,
    locationVerified: params.isOffsite ? true : null,
    distanceFromApprovedLocationMeters: params.isOffsite ? "12.00" : null,
    gpsVerificationStatus: params.isOffsite ? "VERIFIED" : null,
    note: params.note ?? "Dev seed Thai payroll period attendance log",
  };
}

function buildBaseSummary(params: {
  employeeId: string;
  workDate: string;
  period: SeedPeriod;
  summaryStatus: Args["summaryStatus"];
  payrollPeriodId?: string | null;
  scenario: ScenarioKey;
}): SummaryData {
  const status = params.summaryStatus;
  const now = bkkDateTime(params.workDate, 18, 30);
  return {
    morningInAt: null,
    afternoonInAt: null,
    checkOutAt: null,
    morningLateMinutes: 0,
    afternoonLateMinutes: 0,
    totalLateMinutes: 0,
    isMorningMissing: false,
    isAfternoonMissing: false,
    isCheckoutMissing: false,
    hasMissingLog: false,
    isAbsent: false,
    absentDays: "0.00",
    earlyCheckoutMinutes: 0,
    lateCheckoutMinutes: 0,
    extraPresenceMinutes: 0,
    latePenaltyAmount: "0.00",
    missingLogPenaltyAmount: "0.00",
    missingMorningPenaltyAmount: "0.00",
    missingAfternoonPenaltyAmount: "0.00",
    missingCheckoutPenaltyAmount: "0.00",
    earlyCheckoutPenaltyAmount: "0.00",
    absentDeductionAmount: "0.00",
    unpaidLeaveDeductionAmount: "0.00",
    totalDeductionAmount: "0.00",
    paidLeaveMinutes: 0,
    unpaidLeaveMinutes: 0,
    offsiteMinutes: 0,
    offsiteStatus: null,
    reviewStatus: status,
    calculationStatus: "CALCULATED",
    calculationNote: `${buildSeedPrefix(params.period)} | ${params.period.startDate}_${params.period.endDate} | ${params.scenario} | Asia/Bangkok timestamps`,
  };
}

async function createLeaveRequest(params: {
  tx: any;
  period: SeedPeriod;
  employee: EmployeeSeedRow;
  workDate: string;
  scenario: ScenarioKey;
  leaveType: LeaveTypeSeedRow;
  dayType: "FULL_DAY" | "HALF_DAY_MORNING" | "HALF_DAY_AFTERNOON" | "HOURLY";
  totalDays: string;
  totalMinutes: number;
  startTime?: string;
  endTime?: string;
  submittedById?: string | null;
}) {
  const requestNo = buildRequestNo("LV", params.period, params.employee, params.workDate, params.scenario);
  const created = await params.tx.leaveRequest.create({
    data: {
      requestNo,
      employeeId: params.employee.id,
      leaveTypeId: params.leaveType.id,
      startDate: dateOnly(params.workDate),
      endDate: dateOnly(params.workDate),
      dayType: params.dayType,
      totalDays: params.totalDays,
      startTime: params.startTime ?? null,
      endTime: params.endTime ?? null,
      totalMinutes: params.totalMinutes,
      isRetroactive: false,
      reason: `Dev seed: ${SCENARIO_LABELS[params.scenario]}`,
      contactInfo: "080-000-0000",
      note: `${buildSeedPrefix(params.period)} Asia/Bangkok leave seed`,
      status: "APPROVED",
      submittedAt: bkkDateTime(params.workDate, 7, 35),
      approvedAt: bkkDateTime(params.workDate, 7, 50),
      submittedById: params.submittedById ?? params.employee.userId ?? null,
    },
  });

  await params.tx.leaveApprovalStep.create({
    data: {
      leaveRequestId: created.id,
      stepNo: 1,
      nameTh: "Dev seed auto approval",
      description: "สร้างโดย seed ชุดทดสอบเวลาไทย",
      approverType: "HR_ADMIN",
      minApproverCount: 1,
      approvedCount: 1,
      status: "APPROVED",
      actedById: params.submittedById ?? null,
      actedAt: bkkDateTime(params.workDate, 7, 50),
      note: `${buildSeedPrefix(params.period)} auto approved`,
    },
  });

  await params.tx.leaveApprovalLog.createMany({
    data: [
      {
        leaveRequestId: created.id,
        action: "SUBMIT",
        oldStatus: "DRAFT",
        newStatus: "SUBMITTED",
        note: `${buildSeedPrefix(params.period)} auto submit`,
        approvedById: params.employee.userId ?? params.submittedById ?? null,
        createdAt: bkkDateTime(params.workDate, 7, 35),
      },
      {
        leaveRequestId: created.id,
        action: "APPROVE",
        oldStatus: "SUBMITTED",
        newStatus: "APPROVED",
        note: `${buildSeedPrefix(params.period)} auto approve`,
        approvedById: params.submittedById ?? null,
        createdAt: bkkDateTime(params.workDate, 7, 50),
      },
    ],
  });

  return created.id as string;
}

async function createOffsiteRequest(params: {
  tx: any;
  period: SeedPeriod;
  employee: EmployeeSeedRow;
  workDate: string;
  scenario: ScenarioKey;
  status: "APPROVED" | "SUBMITTED";
  submittedById?: string | null;
}) {
  const requestNo = buildRequestNo("OS", params.period, params.employee, params.workDate, params.scenario);
  const approved = params.status === "APPROVED";
  const created = await params.tx.offsiteWorkRequest.create({
    data: {
      requestNo,
      companyId: params.employee.companyId,
      employeeId: params.employee.id,
      workDate: dateOnly(params.workDate),
      startTime: "08:30",
      endTime: "17:00",
      locationType: "CUSTOMER_SITE",
      locationName: "Dev seed customer site",
      address: "พื้นที่ทดสอบนอกสถานที่ (Asia/Bangkok)",
      latitude: "15.2442000",
      longitude: "104.8479000",
      radiusMeters: 300,
      reason: `Dev seed: ${SCENARIO_LABELS[params.scenario]}`,
      status: params.status,
      submittedAt: bkkDateTime(params.workDate, 7, 20),
      approvedAt: approved ? bkkDateTime(params.workDate, 7, 45) : null,
      submittedById: params.employee.userId ?? params.submittedById ?? null,
      approvedById: approved ? params.submittedById ?? null : null,
      policySnapshot: {
        seedPrefix: buildSeedPrefix(params.period),
        timezone: "Asia/Bangkok",
        generatedBy: "seed-two-periods-thai-time.ts",
      },
      approvalSnapshot: {
        mode: approved ? "AUTO_APPROVED" : "WAITING_REVIEW",
        seedPrefix: buildSeedPrefix(params.period),
      },
    },
  });

  return created.id as string;
}

async function clearOwnSeedData(tx: any, periods: SeedPeriod[]) {
  const prefixes = periods.map((period) => buildSeedPrefix(period));
  const rawPrefixes = prefixes.map((prefix) => `${prefix}-%`);
  const leavePrefixes = periods.map((period) => `LV-TH2P-${period.prefixDate}-%`);
  const offsitePrefixes = periods.map((period) => `OS-TH2P-${period.prefixDate}-%`);
  const timeAdjustPrefixes = periods.map((period) => `TA-TH2P-${period.prefixDate}-%`);
  const notes = prefixes.map((prefix) => `${prefix}%`);

  const timeAdjustIds = await tx.timeAdjustRequest.findMany({
    where: { OR: timeAdjustPrefixes.map((prefix) => ({ requestNo: { startsWith: prefix.replace("%", "") } })) },
    select: { id: true },
  });
  const timeAdjustIdList = timeAdjustIds.map((row: { id: string }) => row.id);
  if (timeAdjustIdList.length) {
    await tx.timeAdjustAttachment.deleteMany({ where: { timeAdjustRequestId: { in: timeAdjustIdList } } });
    await tx.timeAdjustApprovalStep.deleteMany({ where: { timeAdjustRequestId: { in: timeAdjustIdList } } });
    await tx.timeAdjustLog.deleteMany({ where: { timeAdjustRequestId: { in: timeAdjustIdList } } });
    await tx.attendanceEditLog.deleteMany({ where: { timeAdjustRequestId: { in: timeAdjustIdList } } });
    await tx.timeAdjustRequest.deleteMany({ where: { id: { in: timeAdjustIdList } } });
  }

  const leaveIds = await tx.leaveRequest.findMany({
    where: { OR: leavePrefixes.map((prefix) => ({ requestNo: { startsWith: prefix.replace("%", "") } })) },
    select: { id: true },
  });
  const leaveIdList = leaveIds.map((row: { id: string }) => row.id);
  if (leaveIdList.length) {
    await tx.attendanceDailySummary.updateMany({
      where: { leaveRequestId: { in: leaveIdList } },
      data: {
        leaveRequestId: null,
        leaveTypeId: null,
        leaveIsPaid: null,
        leaveDayType: null,
        leaveDurationDays: "0.00",
      },
    });
    await tx.leaveAttachment.deleteMany({ where: { leaveRequestId: { in: leaveIdList } } });
    await tx.leaveApprovalStep.deleteMany({ where: { leaveRequestId: { in: leaveIdList } } });
    await tx.leaveApprovalLog.deleteMany({ where: { leaveRequestId: { in: leaveIdList } } });
    await tx.leaveRequest.deleteMany({ where: { id: { in: leaveIdList } } });
  }

  await tx.offsiteWorkRequest.deleteMany({
    where: { OR: offsitePrefixes.map((prefix) => ({ requestNo: { startsWith: prefix.replace("%", "") } })) },
  });

  await tx.attendanceDailySummary.deleteMany({
    where: { OR: notes.map((prefix) => ({ calculationNote: { startsWith: prefix.replace("%", "") } })) },
  });

  await tx.attendanceLog.deleteMany({
    where: { OR: rawPrefixes.map((prefix) => ({ rawScannerRecordId: { startsWith: prefix.replace("%", "") } })) },
  });

  await tx.auditLog.deleteMany({
    where: {
      entity: "DevSeedThaiPayrollPeriods",
      OR: prefixes.map((prefix) => ({ description: { contains: prefix } })),
    },
  });
}

function computeSummaryFromTimes(params: {
  period: SeedPeriod;
  employee: EmployeeSeedRow;
  workDate: string;
  scenario: ScenarioKey;
  summaryStatus: Args["summaryStatus"];
  payrollPeriodId?: string | null;
  morning?: { hour: number; minute: number; status?: string } | null;
  afternoon?: { hour: number; minute: number; status?: string } | null;
  checkout?: { hour: number; minute: number; status?: string } | null;
}) {
  const logs: any[] = [];
  const summary = buildBaseSummary({
    employeeId: params.employee.id,
    workDate: params.workDate,
    period: params.period,
    summaryStatus: params.summaryStatus,
    payrollPeriodId: params.payrollPeriodId,
    scenario: params.scenario,
  });

  if (params.morning) {
    const logTime = bkkDateTime(params.workDate, params.morning.hour, params.morning.minute);
    summary.morningInAt = logTime;
    const late = Math.max(0, minutes(params.morning.hour, params.morning.minute) - MORNING_START_MINUTES);
    summary.morningLateMinutes = late;
    logs.push(logRow({
      employeeId: params.employee.id,
      workDate: params.workDate,
      logType: "CHECK_IN",
      logTime,
      status: params.morning.status ?? (late > 0 ? "LATE" : "NORMAL"),
      session: "MORNING",
      rawScannerRecordId: buildRawRecordId(params.period, params.employee, params.workDate, "MORNING"),
    }));
  }

  if (params.afternoon) {
    const logTime = bkkDateTime(params.workDate, params.afternoon.hour, params.afternoon.minute);
    summary.afternoonInAt = logTime;
    const late = Math.max(0, minutes(params.afternoon.hour, params.afternoon.minute) - AFTERNOON_START_MINUTES);
    summary.afternoonLateMinutes = late;
    logs.push(logRow({
      employeeId: params.employee.id,
      workDate: params.workDate,
      logType: "CHECK_IN",
      logTime,
      status: params.afternoon.status ?? (late > 0 ? "LATE" : "NORMAL"),
      session: "AFTERNOON",
      rawScannerRecordId: buildRawRecordId(params.period, params.employee, params.workDate, "AFTERNOON"),
    }));
  }

  if (params.checkout) {
    const logTime = bkkDateTime(params.workDate, params.checkout.hour, params.checkout.minute);
    summary.checkOutAt = logTime;
    const checkoutMinutes = minutes(params.checkout.hour, params.checkout.minute);
    summary.earlyCheckoutMinutes = Math.max(0, CHECKOUT_MINUTES - checkoutMinutes);
    summary.lateCheckoutMinutes = Math.max(0, checkoutMinutes - CHECKOUT_MINUTES);
    summary.extraPresenceMinutes = summary.lateCheckoutMinutes;
    summary.earlyCheckoutPenaltyAmount = summary.earlyCheckoutMinutes > 0 ? money(EARLY_CHECKOUT_PENALTY) : "0.00";
    logs.push(logRow({
      employeeId: params.employee.id,
      workDate: params.workDate,
      logType: "CHECK_OUT",
      logTime,
      status: params.checkout.status ?? (summary.earlyCheckoutMinutes > 0 ? "EARLY_LEAVE" : "NORMAL"),
      session: "EVENING",
      rawScannerRecordId: buildRawRecordId(params.period, params.employee, params.workDate, "EVENING"),
    }));
  }

  summary.totalLateMinutes = (summary.morningLateMinutes ?? 0) + (summary.afternoonLateMinutes ?? 0);
  summary.latePenaltyAmount = money(latePenalty(summary.totalLateMinutes));
  const total = toNum(summary.latePenaltyAmount) + toNum(summary.earlyCheckoutPenaltyAmount);
  summary.totalDeductionAmount = money(total);

  return { logs, summary };
}

function money(value: number) {
  return value.toFixed(2);
}

function toNum(value: string | undefined) {
  return Number(value ?? 0) || 0;
}

async function buildScenarioRows(params: {
  tx: any;
  period: SeedPeriod;
  employee: EmployeeSeedRow;
  workDate: string;
  scenario: ScenarioKey;
  summaryStatus: Args["summaryStatus"];
  payrollPeriodId?: string | null;
  paidLeaveType?: LeaveTypeSeedRow | null;
  unpaidLeaveType?: LeaveTypeSeedRow | null;
  submittedById?: string | null;
}) {
  const created: CreatedIds = {};
  let logs: any[] = [];
  let summary: SummaryData;

  const base = {
    employeeId: params.employee.id,
    period: params.period,
    employee: params.employee,
    workDate: params.workDate,
    scenario: params.scenario,
    summaryStatus: params.summaryStatus,
    payrollPeriodId: params.payrollPeriodId,
  };

  switch (params.scenario) {
    case "NORMAL":
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 4 },
        afternoon: { hour: 12, minute: 59 },
        checkout: { hour: 17, minute: 6 },
      }));
      break;

    case "MORNING_LATE":
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 47 },
        afternoon: { hour: 12, minute: 58 },
        checkout: { hour: 17, minute: 5 },
      }));
      break;

    case "AFTERNOON_LATE":
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 3 },
        afternoon: { hour: 13, minute: 14 },
        checkout: { hour: 17, minute: 4 },
      }));
      break;

    case "MISSING_CHECKOUT":
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 6 },
        afternoon: { hour: 12, minute: 59 },
        checkout: null,
      }));
      summary.isCheckoutMissing = true;
      summary.hasMissingLog = true;
      summary.missingCheckoutPenaltyAmount = money(MISSING_LOG_PENALTY);
      summary.missingLogPenaltyAmount = money(MISSING_LOG_PENALTY);
      summary.totalDeductionAmount = money(toNum(summary.totalDeductionAmount) + MISSING_LOG_PENALTY);
      break;

    case "PAID_FULL_DAY_LEAVE": {
      const leaveType = params.paidLeaveType;
      summary = buildBaseSummary({ ...base });
      if (leaveType) {
        created.leaveRequestId = await createLeaveRequest({
          tx: params.tx,
          period: params.period,
          employee: params.employee,
          workDate: params.workDate,
          scenario: params.scenario,
          leaveType,
          dayType: "FULL_DAY",
          totalDays: "1.00",
          totalMinutes: 480,
          submittedById: params.submittedById,
        });
        summary.leaveRequestId = created.leaveRequestId;
        summary.leaveTypeId = leaveType.id;
        summary.leaveIsPaid = true;
        summary.leaveDayType = "FULL_DAY";
        summary.leaveDurationDays = "1.00";
        summary.paidLeaveMinutes = 480;
      }
      break;
    }

    case "UNPAID_FULL_DAY_LEAVE": {
      const leaveType = params.unpaidLeaveType ?? params.paidLeaveType;
      summary = buildBaseSummary({ ...base });
      if (leaveType) {
        created.leaveRequestId = await createLeaveRequest({
          tx: params.tx,
          period: params.period,
          employee: params.employee,
          workDate: params.workDate,
          scenario: params.scenario,
          leaveType,
          dayType: "FULL_DAY",
          totalDays: "1.00",
          totalMinutes: 480,
          submittedById: params.submittedById,
        });
        summary.leaveRequestId = created.leaveRequestId;
        summary.leaveTypeId = leaveType.id;
        summary.leaveIsPaid = false;
        summary.leaveDayType = "FULL_DAY";
        summary.leaveDurationDays = "1.00";
        summary.unpaidLeaveMinutes = 480;
        summary.unpaidLeaveDeductionAmount = money(ABSENT_DEDUCTION);
        summary.totalDeductionAmount = money(ABSENT_DEDUCTION);
      }
      break;
    }

    case "UNPAID_HALF_MORNING": {
      const leaveType = params.unpaidLeaveType ?? params.paidLeaveType;
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: null,
        afternoon: { hour: 12, minute: 58 },
        checkout: { hour: 17, minute: 5 },
      }));
      if (leaveType) {
        created.leaveRequestId = await createLeaveRequest({
          tx: params.tx,
          period: params.period,
          employee: params.employee,
          workDate: params.workDate,
          scenario: params.scenario,
          leaveType,
          dayType: "HALF_DAY_MORNING",
          totalDays: "0.50",
          totalMinutes: 240,
          startTime: "08:30",
          endTime: "12:00",
          submittedById: params.submittedById,
        });
        summary.leaveRequestId = created.leaveRequestId;
        summary.leaveTypeId = leaveType.id;
        summary.leaveIsPaid = false;
        summary.leaveDayType = "HALF_DAY_MORNING";
        summary.leaveDurationDays = "0.50";
        summary.unpaidLeaveMinutes = 240;
        summary.unpaidLeaveDeductionAmount = money(HALF_DAY_DEDUCTION);
        summary.totalDeductionAmount = money(toNum(summary.totalDeductionAmount) + HALF_DAY_DEDUCTION);
      }
      break;
    }

    case "PAID_HALF_AFTERNOON": {
      const leaveType = params.paidLeaveType;
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 5 },
        afternoon: null,
        checkout: { hour: 17, minute: 2 },
      }));
      if (leaveType) {
        created.leaveRequestId = await createLeaveRequest({
          tx: params.tx,
          period: params.period,
          employee: params.employee,
          workDate: params.workDate,
          scenario: params.scenario,
          leaveType,
          dayType: "HALF_DAY_AFTERNOON",
          totalDays: "0.50",
          totalMinutes: 240,
          startTime: "13:00",
          endTime: "17:00",
          submittedById: params.submittedById,
        });
        summary.leaveRequestId = created.leaveRequestId;
        summary.leaveTypeId = leaveType.id;
        summary.leaveIsPaid = true;
        summary.leaveDayType = "HALF_DAY_AFTERNOON";
        summary.leaveDurationDays = "0.50";
        summary.paidLeaveMinutes = 240;
      }
      break;
    }

    case "UNPAID_HOURLY": {
      const leaveType = params.unpaidLeaveType ?? params.paidLeaveType;
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 5 },
        afternoon: { hour: 13, minute: 0 },
        checkout: { hour: 17, minute: 3 },
      }));
      if (leaveType) {
        created.leaveRequestId = await createLeaveRequest({
          tx: params.tx,
          period: params.period,
          employee: params.employee,
          workDate: params.workDate,
          scenario: params.scenario,
          leaveType,
          dayType: "HOURLY",
          totalDays: "0.25",
          totalMinutes: 120,
          startTime: "10:00",
          endTime: "12:00",
          submittedById: params.submittedById,
        });
        summary.leaveRequestId = created.leaveRequestId;
        summary.leaveTypeId = leaveType.id;
        summary.leaveIsPaid = false;
        summary.leaveDayType = "HOURLY";
        summary.leaveDurationDays = "0.25";
        summary.unpaidLeaveMinutes = 120;
        summary.unpaidLeaveDeductionAmount = money(HOURLY_DEDUCTION);
        summary.totalDeductionAmount = money(toNum(summary.totalDeductionAmount) + HOURLY_DEDUCTION);
      }
      break;
    }

    case "OFFSITE_APPROVED_FULL":
      created.offsiteRequestId = await createOffsiteRequest({
        tx: params.tx,
        period: params.period,
        employee: params.employee,
        workDate: params.workDate,
        scenario: params.scenario,
        status: "APPROVED",
        submittedById: params.submittedById,
      });
      summary = buildBaseSummary({ ...base });
      summary.offsiteMinutes = 480;
      summary.offsiteStatus = "APPROVED";
      break;

    case "OFFSITE_APPROVED_WITH_LOGS": {
      created.offsiteRequestId = await createOffsiteRequest({
        tx: params.tx,
        period: params.period,
        employee: params.employee,
        workDate: params.workDate,
        scenario: params.scenario,
        status: "APPROVED",
        submittedById: params.submittedById,
      });
      const morning = bkkDateTime(params.workDate, 8, 20);
      const afternoon = bkkDateTime(params.workDate, 12, 55);
      const checkout = bkkDateTime(params.workDate, 17, 8);
      summary = buildBaseSummary({ ...base });
      summary.morningInAt = morning;
      summary.afternoonInAt = afternoon;
      summary.checkOutAt = checkout;
      summary.offsiteMinutes = 480;
      summary.offsiteStatus = "APPROVED";
      logs = [
        logRow({
          employeeId: params.employee.id,
          workDate: params.workDate,
          logType: "CHECK_IN",
          logTime: morning,
          session: "MORNING",
          rawScannerRecordId: buildRawRecordId(params.period, params.employee, params.workDate, "MORNING"),
          isOffsite: true,
          offsiteRequestId: created.offsiteRequestId,
        }),
        logRow({
          employeeId: params.employee.id,
          workDate: params.workDate,
          logType: "CHECK_IN",
          logTime: afternoon,
          session: "AFTERNOON",
          rawScannerRecordId: buildRawRecordId(params.period, params.employee, params.workDate, "AFTERNOON"),
          isOffsite: true,
          offsiteRequestId: created.offsiteRequestId,
        }),
        logRow({
          employeeId: params.employee.id,
          workDate: params.workDate,
          logType: "CHECK_OUT",
          logTime: checkout,
          session: "EVENING",
          rawScannerRecordId: buildRawRecordId(params.period, params.employee, params.workDate, "EVENING"),
          isOffsite: true,
          offsiteRequestId: created.offsiteRequestId,
        }),
      ];
      break;
    }

    case "OFFSITE_SUBMITTED_REVIEW":
      created.offsiteRequestId = await createOffsiteRequest({
        tx: params.tx,
        period: params.period,
        employee: params.employee,
        workDate: params.workDate,
        scenario: params.scenario,
        status: "SUBMITTED",
        submittedById: params.submittedById,
      });
      summary = buildBaseSummary({ ...base });
      summary.offsiteMinutes = 0;
      summary.offsiteStatus = "NEED_REVIEW";
      summary.isAbsent = true;
      summary.absentDays = "1.00";
      summary.absentDeductionAmount = money(ABSENT_DEDUCTION);
      summary.totalDeductionAmount = money(ABSENT_DEDUCTION);
      break;

    case "EARLY_CHECKOUT":
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 3 },
        afternoon: { hour: 12, minute: 58 },
        checkout: { hour: 16, minute: 25 },
      }));
      break;

    case "LATE_CHECKOUT":
      ({ logs, summary } = computeSummaryFromTimes({
        ...base,
        morning: { hour: 8, minute: 6 },
        afternoon: { hour: 12, minute: 59 },
        checkout: { hour: 18, minute: 10 },
      }));
      break;

    case "ABSENT_NO_LOGS":
      summary = buildBaseSummary({ ...base });
      summary.isAbsent = true;
      summary.absentDays = "1.00";
      summary.absentDeductionAmount = money(ABSENT_DEDUCTION);
      summary.totalDeductionAmount = money(ABSENT_DEDUCTION);
      break;

    default:
      throw new Error(`Unhandled scenario: ${params.scenario}`);
  }

  return { logs, summary, created };
}

async function main() {
  const args = parseArgs();
  const selectedPeriods = PERIODS.filter((period) => args.periods.includes(period.key));
  const scenarioCoverage = new Map<ScenarioKey, number>();
  for (const scenario of SCENARIOS) scenarioCoverage.set(scenario, 0);

  console.log("\nDev Seed Thai Payroll Periods");
  console.log("------------------------------------------------------------");
  console.log(`Mode              : ${args.dryRun ? "DRY RUN" : "WRITE"}`);
  console.log(`Timezone          : Asia/Bangkok (stores UTC-correct DateTime values)`);
  console.log(`Periods           : ${selectedPeriods.map((period) => period.label).join(", ")}`);
  console.log(`Summary status    : ${args.summaryStatus}`);
  console.log(`Company filter    : ${args.companyId ?? "ALL"}`);
  console.log(`Employee filter   : ${args.employeeCodes?.join(", ") ?? `first ${args.maxEmployees} active/probation employees per company`}`);
  console.log("OT                : NO, this script does not create OT data");
  console.log("------------------------------------------------------------\n");

  const companies = await (prisma as any).company.findMany({
    where: {
      deletedAt: null,
      ...(args.companyId ? { id: args.companyId } : {}),
    },
    orderBy: [{ code: "asc" }, { nameTh: "asc" }],
    select: { id: true, code: true, nameTh: true },
  });

  if (!companies.length) {
    throw new Error("No companies found. Check --companyId or seed master data first.");
  }

  const actor = await (prisma as any).user.findFirst({
    where: { deletedAt: null, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, displayName: true },
  });

  const preview: any[] = [];
  let totalEmployees = 0;
  let totalLogs = 0;
  let totalSummaries = 0;
  let totalLeaves = 0;
  let totalOffsites = 0;

  for (const company of companies) {
    const employees: EmployeeSeedRow[] = await (prisma as any).employee.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        status: { in: ["ACTIVE", "PROBATION"] },
        ...(args.employeeCodes?.length ? { employeeCode: { in: args.employeeCodes } } : {}),
      },
      orderBy: [{ employeeCode: "asc" }, { firstName: "asc" }],
      take: args.employeeCodes?.length ? undefined : args.maxEmployees,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        companyId: true,
        userId: true,
        branchId: true,
        departmentId: true,
      },
    });

    const leaveTypes: LeaveTypeSeedRow[] = await (prisma as any).leaveType.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        status: "ACTIVE",
        affectAttendance: true,
      },
      orderBy: [{ isPaid: "desc" }, { code: "asc" }],
      select: { id: true, code: true, nameTh: true, isPaid: true },
    });

    const paidLeaveType = leaveTypes.find((item) => item.isPaid) ?? null;
    const unpaidLeaveType = leaveTypes.find((item) => !item.isPaid) ?? null;

    const periodRows = await Promise.all(
      selectedPeriods.map(async (period) => {
        const payrollPeriod = await (prisma as any).payrollPeriod.findFirst({
          where: {
            companyId: company.id,
            deletedAt: null,
            startDate: dateOnly(period.startDate),
            endDate: dateOnly(period.endDate),
          },
          select: { id: true, code: true, name: true },
        });
        return { period, payrollPeriod };
      }),
    );

    const days = selectedPeriods.reduce((sum, period) => sum + datesBetween(period.startDate, period.endDate).length, 0);
    preview.push({
      company: `${company.code} ${company.nameTh}`,
      employeeCount: employees.length,
      days,
      paidLeaveType: paidLeaveType ? `${paidLeaveType.code} ${paidLeaveType.nameTh}` : "NOT FOUND",
      unpaidLeaveType: unpaidLeaveType ? `${unpaidLeaveType.code} ${unpaidLeaveType.nameTh}` : "NOT FOUND",
      payrollPeriods: periodRows.map((row) => `${row.period.key}:${row.payrollPeriod?.code ?? "not found"}`).join(", "),
    });

    totalEmployees += employees.length;
    if (!employees.length) continue;

    for (const period of selectedPeriods) {
      const dateList = datesBetween(period.startDate, period.endDate);
      totalSummaries += employees.length * dateList.length;
      for (let employeeIndex = 0; employeeIndex < employees.length; employeeIndex += 1) {
        for (let dateIndex = 0; dateIndex < dateList.length; dateIndex += 1) {
          const scenario = scenarioFor(employeeIndex, dateIndex);
          scenarioCoverage.set(scenario, (scenarioCoverage.get(scenario) ?? 0) + 1);
          if (["PAID_FULL_DAY_LEAVE", "UNPAID_FULL_DAY_LEAVE", "UNPAID_HALF_MORNING", "PAID_HALF_AFTERNOON", "UNPAID_HOURLY"].includes(scenario)) {
            totalLeaves += 1;
          }
          if (["OFFSITE_APPROVED_FULL", "OFFSITE_APPROVED_WITH_LOGS", "OFFSITE_SUBMITTED_REVIEW"].includes(scenario)) {
            totalOffsites += 1;
          }
          if (!["PAID_FULL_DAY_LEAVE", "UNPAID_FULL_DAY_LEAVE", "OFFSITE_APPROVED_FULL", "OFFSITE_SUBMITTED_REVIEW", "ABSENT_NO_LOGS"].includes(scenario)) {
            totalLogs += scenario === "MISSING_CHECKOUT" ? 2 : scenario === "UNPAID_HALF_MORNING" || scenario === "PAID_HALF_AFTERNOON" ? 2 : 3;
          }
        }
      }
    }
  }

  console.table(preview);
  console.log("Scenario coverage:");
  for (const scenario of SCENARIOS) {
    console.log(`- ${scenario.padEnd(28)} ${String(scenarioCoverage.get(scenario) ?? 0).padStart(4)} day(s) | ${SCENARIO_LABELS[scenario]}`);
  }
  console.log("------------------------------------------------------------");
  console.log(`Employees selected        : ${totalEmployees}`);
  console.log(`Attendance logs to create : ${totalLogs}`);
  console.log(`Daily summaries to create : ${totalSummaries}`);
  console.log(`Leave requests to create  : ${totalLeaves}`);
  console.log(`Offsite requests to create: ${totalOffsites}`);
  console.log("------------------------------------------------------------\n");

  if (args.dryRun) {
    console.log("Dry run only. No data changed.");
    return;
  }

  let createdLogs = 0;
  let createdSummaries = 0;
  let createdLeaves = 0;
  let createdOffsites = 0;

  await (prisma as any).$transaction(async (tx: any) => {
    await clearOwnSeedData(tx, selectedPeriods);

    for (const company of companies) {
      const employees: EmployeeSeedRow[] = await tx.employee.findMany({
        where: {
          companyId: company.id,
          deletedAt: null,
          status: { in: ["ACTIVE", "PROBATION"] },
          ...(args.employeeCodes?.length ? { employeeCode: { in: args.employeeCodes } } : {}),
        },
        orderBy: [{ employeeCode: "asc" }, { firstName: "asc" }],
        take: args.employeeCodes?.length ? undefined : args.maxEmployees,
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          companyId: true,
          userId: true,
          branchId: true,
          departmentId: true,
        },
      });

      const leaveTypes: LeaveTypeSeedRow[] = await tx.leaveType.findMany({
        where: {
          companyId: company.id,
          deletedAt: null,
          status: "ACTIVE",
          affectAttendance: true,
        },
        orderBy: [{ isPaid: "desc" }, { code: "asc" }],
        select: { id: true, code: true, nameTh: true, isPaid: true },
      });

      const paidLeaveType = leaveTypes.find((item) => item.isPaid) ?? null;
      const unpaidLeaveType = leaveTypes.find((item) => !item.isPaid) ?? null;

      for (const period of selectedPeriods) {
        const payrollPeriod = await tx.payrollPeriod.findFirst({
          where: {
            companyId: company.id,
            deletedAt: null,
            startDate: dateOnly(period.startDate),
            endDate: dateOnly(period.endDate),
          },
          select: { id: true },
        });

        const dateList = datesBetween(period.startDate, period.endDate);
        const attendanceLogs: any[] = [];
        const summaries: any[] = [];

        for (let employeeIndex = 0; employeeIndex < employees.length; employeeIndex += 1) {
          const employee = employees[employeeIndex];
          for (let dateIndex = 0; dateIndex < dateList.length; dateIndex += 1) {
            const workDate = dateList[dateIndex];
            const scenario = scenarioFor(employeeIndex, dateIndex);
            const { logs, summary } = await buildScenarioRows({
              tx,
              period,
              employee,
              workDate,
              scenario,
              summaryStatus: args.summaryStatus,
              payrollPeriodId: payrollPeriod?.id ?? null,
              paidLeaveType,
              unpaidLeaveType,
              submittedById: actor?.id ?? null,
            });

            if (summary.leaveRequestId) createdLeaves += 1;
            if (summary.offsiteStatus) {
              if (["APPROVED", "NEED_REVIEW"].includes(summary.offsiteStatus)) createdOffsites += 1;
            }

            attendanceLogs.push(...logs);
            summaries.push({
              employeeId: employee.id,
              workDate: dateOnly(workDate),
              morningInAt: summary.morningInAt ?? null,
              afternoonInAt: summary.afternoonInAt ?? null,
              checkOutAt: summary.checkOutAt ?? null,
              morningLateMinutes: summary.morningLateMinutes ?? 0,
              afternoonLateMinutes: summary.afternoonLateMinutes ?? 0,
              totalLateMinutes: summary.totalLateMinutes ?? 0,
              isMorningMissing: summary.isMorningMissing ?? false,
              isAfternoonMissing: summary.isAfternoonMissing ?? false,
              isCheckoutMissing: summary.isCheckoutMissing ?? false,
              hasMissingLog: summary.hasMissingLog ?? false,
              isAbsent: summary.isAbsent ?? false,
              absentDays: summary.absentDays ?? "0.00",
              earlyCheckoutMinutes: summary.earlyCheckoutMinutes ?? 0,
              lateCheckoutMinutes: summary.lateCheckoutMinutes ?? 0,
              extraPresenceMinutes: summary.extraPresenceMinutes ?? 0,
              latePenaltyAmount: summary.latePenaltyAmount ?? "0.00",
              missingLogPenaltyAmount: summary.missingLogPenaltyAmount ?? "0.00",
              missingMorningPenaltyAmount: summary.missingMorningPenaltyAmount ?? "0.00",
              missingAfternoonPenaltyAmount: summary.missingAfternoonPenaltyAmount ?? "0.00",
              missingCheckoutPenaltyAmount: summary.missingCheckoutPenaltyAmount ?? "0.00",
              earlyCheckoutPenaltyAmount: summary.earlyCheckoutPenaltyAmount ?? "0.00",
              absentDeductionAmount: summary.absentDeductionAmount ?? "0.00",
              unpaidLeaveDeductionAmount: summary.unpaidLeaveDeductionAmount ?? "0.00",
              totalDeductionAmount: summary.totalDeductionAmount ?? "0.00",
              paidLeaveMinutes: summary.paidLeaveMinutes ?? 0,
              unpaidLeaveMinutes: summary.unpaidLeaveMinutes ?? 0,
              offsiteMinutes: summary.offsiteMinutes ?? 0,
              approvedOtMinutes: 0,
              payableOtMinutes: 0,
              offsiteStatus: summary.offsiteStatus ?? null,
              reviewStatus: summary.reviewStatus ?? args.summaryStatus,
              leaveRequestId: summary.leaveRequestId ?? null,
              leaveTypeId: summary.leaveTypeId ?? null,
              leaveIsPaid: summary.leaveIsPaid ?? null,
              leaveDayType: summary.leaveDayType ?? null,
              leaveDurationDays: summary.leaveDurationDays ?? "0.00",
              calculationStatus: summary.calculationStatus ?? "CALCULATED",
              calculationNote: summary.calculationNote ?? `${buildSeedPrefix(period)} | ${scenario}`,
              calculatedAt: bkkDateTime(workDate, 18, 30),
              payrollPeriodId: payrollPeriod?.id ?? null,
              readyForPayrollAt: args.summaryStatus === "READY_FOR_PAYROLL" ? bkkDateTime(workDate, 18, 45) : null,
              sentToPayrollAt: null,
              payrollRunId: null,
            });
          }
        }

        if (attendanceLogs.length) {
          const result = await tx.attendanceLog.createMany({ data: attendanceLogs, skipDuplicates: true });
          createdLogs += result.count ?? attendanceLogs.length;
        }
        if (summaries.length) {
          const result = await tx.attendanceDailySummary.createMany({ data: summaries, skipDuplicates: true });
          createdSummaries += result.count ?? summaries.length;
        }
      }
    }

    await tx.auditLog.create({
      data: {
        action: "IMPORT",
        entity: "DevSeedThaiPayrollPeriods",
        description: `${selectedPeriods.map((period) => buildSeedPrefix(period)).join(", ")} seed Thai payroll period attendance/leave/offsite data`,
        userId: actor?.id ?? null,
        method: "SCRIPT",
        path: "scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts",
        statusCode: 200,
        userAgent: "manual-script",
        metadata: {
          periods: selectedPeriods.map((period) => ({
            key: period.key,
            startDate: period.startDate,
            endDate: period.endDate,
            prefix: buildSeedPrefix(period),
          })),
          timezone: "Asia/Bangkok",
          summaryStatus: args.summaryStatus,
          companyId: args.companyId ?? null,
          employeeCodes: args.employeeCodes ?? null,
          maxEmployees: args.maxEmployees,
          created: {
            attendanceLogs: createdLogs,
            attendanceDailySummaries: createdSummaries,
            leaveRequests: createdLeaves,
            offsiteWorkRequests: createdOffsites,
          },
        },
      },
    });
  }, { timeout: 120000 });

  console.log("Seed completed.");
  console.log("------------------------------------------------------------");
  console.log(`Created attendance logs     : ${createdLogs}`);
  console.log(`Created daily summaries     : ${createdSummaries}`);
  console.log(`Created leave requests      : ${createdLeaves}`);
  console.log(`Created offsite requests    : ${createdOffsites}`);
  console.log("------------------------------------------------------------");
  console.log("Next steps:");
  console.log("1) เปิดหน้าเข้างาน/HR Review แล้วเลือกช่วง 2026-04-26 ถึง 2026-05-25 หรือ 2026-05-26 ถึง 2026-06-25");
  console.log("2) ถ้า summaryStatus=READY_FOR_PAYROLL สามารถไป Payroll งวดเดียวกันแล้ว Calculate ได้เลย");
  console.log("3) ข้อมูลเวลาเก็บแบบ UTC-correct สำหรับแสดงผลเวลาไทย ไม่ต้องรัน fix timezone เพิ่ม");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
