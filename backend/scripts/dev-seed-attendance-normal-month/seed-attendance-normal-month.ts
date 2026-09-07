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

const SEED_SOURCE = "DEV_SEED_NORMAL_MONTH";
const SEED_PREFIX = "DNM";
const DEFAULT_DATE_FROM = "2026-05-26";
const DEFAULT_DATE_TO = "2026-06-25";
const BANGKOK_TIMEZONE = "Asia/Bangkok";
const DEFAULT_MAX_REVIEW_CASES = 10;

type Args = {
  dateFrom: string;
  dateTo: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  employeeCodes: string[];
  limit?: number;
  dryRun: boolean;
  replace: boolean;
  skipSundays: boolean;
  noReviewCases: boolean;
  maxReviewCases: number;
};

type EmployeeRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  divisionId: string | null;
  employeeTypeId: string | null;
  userId: string | null;
};

type SessionRule = {
  sessionCode: string;
  punchType: string;
  openTime?: string | null;
  expectedTime?: string | null;
  closeTime?: string | null;
  lateAfterTime?: string | null;
  earlyBeforeTime?: string | null;
  lateGraceMinutes?: number | null;
  sortOrder?: number | null;
  status?: string | null;
};

type PolicyRow = {
  id: string;
  companyId: string;
  branchId: string | null;
  employeeTypeId: string | null;
  code: string;
  name: string;
  morningCheckInDeadline: string;
  afternoonCheckInDeadline: string;
  checkoutAllowedFrom: string;
  lateGraceMinutes: number;
  priority: number;
  timezone: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sessionRules?: SessionRule[];
};

type LeaveTypeRow = {
  id: string;
  companyId: string;
  code: string;
  nameTh: string;
  isPaid: boolean;
};

type ScenarioKey =
  | "NORMAL"
  | "MORNING_LATE"
  | "AFTERNOON_LATE"
  | "EARLY_CHECKOUT"
  | "PAID_FULL_DAY_LEAVE"
  | "PAID_HALF_MORNING_LEAVE"
  | "PAID_HALF_AFTERNOON_LEAVE"
  | "UNPAID_HALF_AFTERNOON_LEAVE"
  | "OFFSITE_APPROVED_FULL"
  | "OT_APPROVED"
  | "MISSING_CHECKOUT_REVIEW";

type SeedCounters = Record<ScenarioKey, number>;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dateFrom: DEFAULT_DATE_FROM,
    dateTo: DEFAULT_DATE_TO,
    employeeCodes: [],
    dryRun: false,
    replace: false,
    skipSundays: false,
    noReviewCases: false,
    maxReviewCases: DEFAULT_MAX_REVIEW_CASES,
  };

  for (const raw of argv) {
    const [key, value = ""] = raw.replace(/^--/, "").split("=");

    if (key === "dateFrom") args.dateFrom = value;
    if (key === "dateTo") args.dateTo = value;
    if (key === "companyId") args.companyId = value || undefined;
    if (key === "branchId") args.branchId = value || undefined;
    if (key === "departmentId") args.departmentId = value || undefined;
    if (key === "employeeCodes") {
      args.employeeCodes = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (key === "limit") {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) args.limit = Math.floor(parsed);
    }
    if (key === "dryRun") args.dryRun = true;
    if (key === "replace") args.replace = true;
    if (key === "skipSundays") args.skipSundays = true;
    if (key === "noReviewCases") args.noReviewCases = true;
    if (key === "maxReviewCases") {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) args.maxReviewCases = Math.floor(parsed);
    }
  }

  assertDateInput(args.dateFrom, "dateFrom");
  assertDateInput(args.dateTo, "dateTo");

  if (dateOnly(args.dateFrom).getTime() > dateOnly(args.dateTo).getTime()) {
    throw new Error("dateFrom ต้องไม่มากกว่า dateTo");
  }

  return args;
}

function assertDateInput(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} ต้องอยู่ในรูปแบบ YYYY-MM-DD เช่น 2026-05-26`);
  }
}

function dateOnly(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function enumerateDateKeys(dateFrom: string, dateTo: string, skipSundays: boolean) {
  const dates: string[] = [];
  const start = dateOnly(dateFrom);
  const end = dateOnly(dateTo);

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (skipSundays && day === 0) continue;
    dates.push(formatDateKey(cursor));
  }

  return dates;
}

function parseTimeToMinutes(value?: string | null) {
  if (!value) return Number.NaN;
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
  return hour * 60 + minute;
}

function minutesToTime(minutes: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function bangkokDateTime(dateKey: string, time: string, minuteOffset = 0) {
  const minutes = parseTimeToMinutes(time);
  const safeMinutes = Number.isFinite(minutes) ? minutes + minuteOffset : minuteOffset;
  const localTime = minutesToTime(safeMinutes);
  return new Date(`${dateKey}T${localTime}:00+07:00`);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pad(num: number, length = 4) {
  return String(num).padStart(length, "0");
}

function safeCode(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "EMP";
}

function humanName(employee: EmployeeRow) {
  return employee.displayName || `${employee.firstName} ${employee.lastName}`.trim();
}

function buildDefaultPolicy(employee: EmployeeRow, effectiveDate: Date): PolicyRow {
  return {
    id: "default-attendance-policy",
    companyId: employee.companyId,
    branchId: employee.branchId,
    employeeTypeId: null,
    code: "DEFAULT_ATTENDANCE_POLICY",
    name: "นโยบายเวลาเข้าออกงานมาตรฐาน",
    morningCheckInDeadline: "08:00",
    afternoonCheckInDeadline: "13:00",
    checkoutAllowedFrom: "17:00",
    lateGraceMinutes: 0,
    priority: 100,
    timezone: BANGKOK_TIMEZONE,
    effectiveFrom: effectiveDate,
    effectiveTo: null,
    sessionRules: [],
  };
}

function buildDefaultSessionRules(policy: PolicyRow): SessionRule[] {
  return [
    {
      sessionCode: "MORNING_IN",
      punchType: "CHECK_IN",
      openTime: "06:00",
      expectedTime: policy.morningCheckInDeadline || "08:00",
      closeTime: "11:59",
      lateAfterTime: policy.morningCheckInDeadline || "08:00",
      lateGraceMinutes: policy.lateGraceMinutes ?? 0,
      sortOrder: 1,
    },
    {
      sessionCode: "AFTERNOON_IN",
      punchType: "CHECK_IN",
      openTime: "12:00",
      expectedTime: policy.afternoonCheckInDeadline || "13:00",
      closeTime: "16:59",
      lateAfterTime: policy.afternoonCheckInDeadline || "13:00",
      lateGraceMinutes: policy.lateGraceMinutes ?? 0,
      sortOrder: 2,
    },
    {
      sessionCode: "CHECK_OUT",
      punchType: "CHECK_OUT",
      openTime: "00:00",
      expectedTime: policy.checkoutAllowedFrom || "17:00",
      closeTime: "23:59",
      earlyBeforeTime: policy.checkoutAllowedFrom || "17:00",
      sortOrder: 3,
    },
  ];
}

function getPolicySessionRules(policy: PolicyRow) {
  const activeRules = (policy.sessionRules ?? [])
    .filter((rule) => !rule.status || rule.status === "ACTIVE")
    .sort((a, b) => {
      const sortA = Number(a.sortOrder ?? 0);
      const sortB = Number(b.sortOrder ?? 0);
      if (sortA !== sortB) return sortA - sortB;
      return String(a.openTime ?? "").localeCompare(String(b.openTime ?? ""));
    });

  return activeRules.length > 0 ? activeRules : buildDefaultSessionRules(policy);
}

function findRule(policy: PolicyRow, sessionCode: string) {
  return getPolicySessionRules(policy).find((rule) => rule.sessionCode === sessionCode);
}

function mapSessionCodeToLogSession(sessionCode: string) {
  if (sessionCode === "MORNING_IN") return "MORNING";
  if (sessionCode === "AFTERNOON_IN") return "AFTERNOON";
  if (sessionCode === "CHECK_OUT") return "EVENING";
  if (sessionCode === "OFFSITE_IN") return "OFFSITE_IN";
  if (sessionCode === "OFFSITE_OUT") return "OFFSITE_OUT";
  return "CUSTOM";
}

function resolveLogStatus(rule: SessionRule, logTime: Date, expectedOffset = 0) {
  if (expectedOffset === 0) return "NORMAL";
  if (rule.punchType === "CHECK_OUT" && expectedOffset < 0) return "EARLY_LEAVE";
  if (rule.punchType !== "CHECK_OUT" && expectedOffset > 0) return "LATE";
  return "NORMAL";
}

function resolveEffectivePolicy(
  policies: PolicyRow[],
  employee: EmployeeRow,
  dateKey: string,
): PolicyRow {
  const workDate = dateOnly(dateKey);
  const candidates = policies.filter((policy) => {
    const effectiveFrom = new Date(policy.effectiveFrom);
    const effectiveTo = policy.effectiveTo ? new Date(policy.effectiveTo) : null;
    const branchMatches = employee.branchId
      ? policy.branchId === employee.branchId || policy.branchId === null
      : policy.branchId === null;
    const employeeTypeMatches = employee.employeeTypeId
      ? policy.employeeTypeId === employee.employeeTypeId || policy.employeeTypeId === null
      : policy.employeeTypeId === null;

    return (
      policy.companyId === employee.companyId &&
      effectiveFrom <= workDate &&
      (!effectiveTo || effectiveTo >= workDate) &&
      branchMatches &&
      employeeTypeMatches
    );
  });

  candidates.sort((a, b) => {
    const priority = Number(b.priority ?? 0) - Number(a.priority ?? 0);
    if (priority !== 0) return priority;

    const branchScore = Number(Boolean(b.branchId)) - Number(Boolean(a.branchId));
    if (branchScore !== 0) return branchScore;

    const typeScore = Number(Boolean(b.employeeTypeId)) - Number(Boolean(a.employeeTypeId));
    if (typeScore !== 0) return typeScore;

    return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
  });

  return candidates[0] ?? buildDefaultPolicy(employee, workDate);
}

function chooseScenario(
  employee: EmployeeRow,
  dateKey: string,
  leaveTypes: LeaveTypeRow[],
  counters: SeedCounters,
  args: Args,
): ScenarioKey {
  const hash = hashText(`${employee.id}|${employee.employeeCode}|${dateKey}`);
  const hasPaidLeaveType = leaveTypes.some(
    (item) => item.companyId === employee.companyId && item.isPaid,
  );
  const hasUnpaidLeaveType = leaveTypes.some(
    (item) => item.companyId === employee.companyId && !item.isPaid,
  );

  if (
    !args.noReviewCases &&
    counters.MISSING_CHECKOUT_REVIEW < args.maxReviewCases &&
    hash % 251 === 0
  ) {
    return "MISSING_CHECKOUT_REVIEW";
  }

  if (hasPaidLeaveType && hash % 47 === 0) return "PAID_FULL_DAY_LEAVE";
  if (hasPaidLeaveType && hash % 67 === 0) return "PAID_HALF_MORNING_LEAVE";
  if (hasPaidLeaveType && hash % 73 === 0) return "PAID_HALF_AFTERNOON_LEAVE";
  if (hasUnpaidLeaveType && hash % 89 === 0) return "UNPAID_HALF_AFTERNOON_LEAVE";
  if (hash % 53 === 0) return "OFFSITE_APPROVED_FULL";
  if (hash % 41 === 0) return "OT_APPROVED";
  if (hash % 23 === 0) return "MORNING_LATE";
  if (hash % 37 === 0) return "AFTERNOON_LATE";
  if (hash % 59 === 0) return "EARLY_CHECKOUT";

  return "NORMAL";
}

function chooseLeaveType(
  employee: EmployeeRow,
  dateKey: string,
  leaveTypes: LeaveTypeRow[],
  paid: boolean,
) {
  const pool = leaveTypes.filter(
    (item) => item.companyId === employee.companyId && item.isPaid === paid,
  );
  if (pool.length === 0) return null;
  return pool[hashText(`${employee.id}|${dateKey}|${paid ? "paid" : "unpaid"}`) % pool.length];
}

function buildLog(params: {
  employee: EmployeeRow;
  dateKey: string;
  rule: SessionRule | undefined;
  offsetMinutes: number;
  note: string;
  createdById: string | null;
  isOffsite?: boolean;
  offsiteRequestId?: string | null;
}) {
  const rule = params.rule;
  if (!rule) return null;
  const expectedTime = rule.expectedTime ?? rule.lateAfterTime ?? rule.earlyBeforeTime ?? "08:00";
  const logTime = bangkokDateTime(params.dateKey, expectedTime, params.offsetMinutes);

  return {
    employeeId: params.employee.id,
    workDate: dateOnly(params.dateKey),
    logType: rule.punchType === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN",
    logTime,
    channel: "WEB",
    status: resolveLogStatus(rule, logTime, params.offsetMinutes),
    source: SEED_SOURCE,
    session: mapSessionCodeToLogSession(rule.sessionCode),
    isOffsite: Boolean(params.isOffsite),
    offsiteRequestId: params.offsiteRequestId ?? null,
    locationVerified: params.isOffsite ? true : null,
    gpsVerificationStatus: params.isOffsite ? "VERIFIED" : null,
    note: params.note,
    createdById: params.createdById,
  };
}

function pushIfPresent<T>(items: T[], value: T | null | undefined) {
  if (value) items.push(value);
}

function emptyCounters(): SeedCounters {
  return {
    NORMAL: 0,
    MORNING_LATE: 0,
    AFTERNOON_LATE: 0,
    EARLY_CHECKOUT: 0,
    PAID_FULL_DAY_LEAVE: 0,
    PAID_HALF_MORNING_LEAVE: 0,
    PAID_HALF_AFTERNOON_LEAVE: 0,
    UNPAID_HALF_AFTERNOON_LEAVE: 0,
    OFFSITE_APPROVED_FULL: 0,
    OT_APPROVED: 0,
    MISSING_CHECKOUT_REVIEW: 0,
  };
}

async function loadSystemUserId() {
  const active = await prisma.user.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true },
  });
  return active?.id ?? null;
}

async function cleanPreviousSeed(args: Args, employeeIds: string[]) {
  const dateFrom = dateOnly(args.dateFrom);
  const dateTo = dateOnly(args.dateTo);
  const prismaAny = prisma as any;

  const seedRequestPrefix = `${SEED_PREFIX}-`;

  if (args.replace) {
    console.log("[replace] ลบข้อมูลลงเวลา/คำขอ/summary ในช่วงที่เลือกของพนักงานกลุ่มนี้ก่อน seed ใหม่...");

    await prisma.attendanceDailySummary.deleteMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: { gte: dateFrom, lte: dateTo },
      },
    });

    await prisma.attendanceLog.deleteMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: { gte: dateFrom, lte: dateTo },
      },
    });

    await prismaAny.leaveRequest.deleteMany({
      where: {
        employeeId: { in: employeeIds },
        startDate: { lte: dateTo },
        endDate: { gte: dateFrom },
      },
    });

    await prismaAny.overtimeRequest.deleteMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: { gte: dateFrom, lte: dateTo },
      },
    });

    await prismaAny.offsiteWorkRequest.deleteMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: { gte: dateFrom, lte: dateTo },
      },
    });

    return;
  }

  console.log("ลบเฉพาะข้อมูล seed เดิมของสคริปต์นี้ เพื่อให้รันซ้ำได้โดยไม่ซ้ำ...");

  await prisma.attendanceLog.deleteMany({
    where: {
      employeeId: { in: employeeIds },
      workDate: { gte: dateFrom, lte: dateTo },
      source: SEED_SOURCE,
    },
  });

  await prismaAny.leaveRequest.deleteMany({
    where: {
      employeeId: { in: employeeIds },
      requestNo: { startsWith: `${seedRequestPrefix}LV-` },
      startDate: { lte: dateTo },
      endDate: { gte: dateFrom },
    },
  });

  await prismaAny.overtimeRequest.deleteMany({
    where: {
      employeeId: { in: employeeIds },
      requestNo: { startsWith: `${seedRequestPrefix}OT-` },
      workDate: { gte: dateFrom, lte: dateTo },
    },
  });

  await prismaAny.offsiteWorkRequest.deleteMany({
    where: {
      employeeId: { in: employeeIds },
      requestNo: { startsWith: `${seedRequestPrefix}OF-` },
      workDate: { gte: dateFrom, lte: dateTo },
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dateKeys = enumerateDateKeys(args.dateFrom, args.dateTo, args.skipSundays);

  if (dateKeys.length === 0) {
    throw new Error("ไม่พบวันที่สำหรับ seed");
  }

  console.log("==== DEV SEED ATTENDANCE NORMAL MONTH ====");
  console.log(`ช่วงวันที่: ${args.dateFrom} ถึง ${args.dateTo}`);
  console.log(`ข้ามวันอาทิตย์: ${args.skipSundays ? "ใช่" : "ไม่"}`);
  console.log(`Dry run: ${args.dryRun ? "ใช่" : "ไม่"}`);
  console.log(`Replace: ${args.replace ? "ใช่ - ลบข้อมูลจริงในช่วงที่เลือกก่อน" : "ไม่ - ลบเฉพาะ seed เดิม"}`);

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["RESIGNED", "TERMINATED", "INACTIVE"] },
      ...(args.companyId ? { companyId: args.companyId } : {}),
      ...(args.branchId ? { branchId: args.branchId } : {}),
      ...(args.departmentId ? { departmentId: args.departmentId } : {}),
      ...(args.employeeCodes.length > 0 ? { employeeCode: { in: args.employeeCodes } } : {}),
    },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      displayName: true,
      companyId: true,
      branchId: true,
      departmentId: true,
      divisionId: true,
      employeeTypeId: true,
      userId: true,
    },
    orderBy: [{ employeeCode: "asc" }],
    ...(args.limit ? { take: args.limit } : {}),
  });

  if (employees.length === 0) {
    console.log("ไม่พบพนักงานที่ตรงเงื่อนไข");
    return;
  }

  const companyIds = Array.from(new Set(employees.map((employee) => employee.companyId)));
  const [systemUserId, policiesRaw, leaveTypesRaw] = await Promise.all([
    loadSystemUserId(),
    (prisma as any).attendancePolicy.findMany({
      where: {
        companyId: { in: companyIds },
        status: "ACTIVE",
        deletedAt: null,
        effectiveFrom: { lte: dateOnly(args.dateTo) },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: dateOnly(args.dateFrom) } }],
      },
      include: {
        sessionRules: {
          where: { deletedAt: null, status: "ACTIVE" },
          orderBy: [{ sortOrder: "asc" }, { openTime: "asc" }],
        },
      },
      orderBy: [
        { priority: "desc" },
        { branchId: "desc" },
        { employeeTypeId: "desc" },
        { effectiveFrom: "desc" },
        { updatedAt: "desc" },
      ],
    }),
    (prisma as any).leaveType.findMany({
      where: {
        companyId: { in: companyIds },
        status: "ACTIVE",
        deletedAt: null,
        affectAttendance: true,
      },
      select: {
        id: true,
        companyId: true,
        code: true,
        nameTh: true,
        isPaid: true,
      },
      orderBy: [{ code: "asc" }],
    }),
  ]);

  const policies = policiesRaw as PolicyRow[];
  const leaveTypes = leaveTypesRaw as LeaveTypeRow[];

  console.log(`พนักงานที่จะ seed: ${employees.length} คน`);
  console.log(`วันที่ที่จะ seed: ${dateKeys.length} วัน`);
  console.log(`Attendance policies ที่พบ: ${policies.length} รายการ`);
  console.log(`Leave types ที่ใช้ได้: ${leaveTypes.length} รายการ`);

  const employeeIds = employees.map((employee) => employee.id);

  if (!args.dryRun) {
    await cleanPreviousSeed(args, employeeIds);
  }

  const counters = emptyCounters();
  const logs: any[] = [];
  const leaveRequests: any[] = [];
  const overtimeRequests: any[] = [];
  const offsiteRequests: any[] = [];

  for (const employee of employees) {
    for (const dateKey of dateKeys) {
      const policy = resolveEffectivePolicy(policies, employee, dateKey);
      const morningRule = findRule(policy, "MORNING_IN");
      const afternoonRule = findRule(policy, "AFTERNOON_IN");
      const checkoutRule = findRule(policy, "CHECK_OUT");
      const hash = hashText(`${employee.id}|${dateKey}|time-offset`);
      const normalMorningOffset = -10 + (hash % 16); // -10 ถึง +5 นาที
      const normalAfternoonOffset = -5 + (hash % 9); // -5 ถึง +3 นาที
      const normalCheckoutOffset = 0 + (hash % 21); // 0 ถึง +20 นาที
      const employeeUserId = employee.userId ?? systemUserId;
      const scenario = chooseScenario(employee, dateKey, leaveTypes, counters, args);
      const dateCompact = dateKey.replace(/-/g, "");
      const employeeCode = safeCode(employee.employeeCode);
      const uniqueSuffix = hashText(`${employee.id}|${dateKey}|${scenario}`).toString(36).slice(0, 6);
      const baseNote = `${SEED_SOURCE}: ${scenario} ${dateKey} ${humanName(employee)}`;

      counters[scenario] += 1;

      if (scenario === "PAID_FULL_DAY_LEAVE") {
        const leaveType = chooseLeaveType(employee, dateKey, leaveTypes, true);
        if (!leaveType) {
          counters[scenario] -= 1;
          counters.NORMAL += 1;
        } else {
          leaveRequests.push({
            requestNo: `${SEED_PREFIX}-LV-${dateCompact}-${employeeCode}-${uniqueSuffix}`,
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            startDate: dateOnly(dateKey),
            endDate: dateOnly(dateKey),
            dayType: "FULL_DAY",
            totalDays: "1.00",
            totalMinutes: 480,
            reason: "ข้อมูลทดสอบ: ลาเต็มวันอนุมัติแล้ว",
            contactInfo: "-",
            note: baseNote,
            status: "APPROVED",
            submittedAt: bangkokDateTime(dateKey, "07:30"),
            approvedAt: bangkokDateTime(dateKey, "07:45"),
            submittedById: employeeUserId,
            deletedAt: null,
          });
          continue;
        }
      }

      if (scenario === "PAID_HALF_MORNING_LEAVE" || scenario === "PAID_HALF_AFTERNOON_LEAVE" || scenario === "UNPAID_HALF_AFTERNOON_LEAVE") {
        const paid = scenario !== "UNPAID_HALF_AFTERNOON_LEAVE";
        const leaveType = chooseLeaveType(employee, dateKey, leaveTypes, paid);
        if (leaveType) {
          const isMorning = scenario === "PAID_HALF_MORNING_LEAVE";
          leaveRequests.push({
            requestNo: `${SEED_PREFIX}-LV-${dateCompact}-${employeeCode}-${uniqueSuffix}`,
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            startDate: dateOnly(dateKey),
            endDate: dateOnly(dateKey),
            dayType: isMorning ? "HALF_DAY_MORNING" : "HALF_DAY_AFTERNOON",
            totalDays: "0.50",
            totalMinutes: 240,
            reason: isMorning
              ? "ข้อมูลทดสอบ: ลาครึ่งเช้าอนุมัติแล้ว"
              : "ข้อมูลทดสอบ: ลาครึ่งบ่ายอนุมัติแล้ว",
            contactInfo: "-",
            note: baseNote,
            status: "APPROVED",
            submittedAt: bangkokDateTime(dateKey, "07:30"),
            approvedAt: bangkokDateTime(dateKey, "07:45"),
            submittedById: employeeUserId,
            deletedAt: null,
          });

          if (isMorning) {
            pushIfPresent(
              logs,
              buildLog({
                employee,
                dateKey,
                rule: afternoonRule,
                offsetMinutes: normalAfternoonOffset,
                note: `${baseNote} | เข้างานบ่ายหลังลาครึ่งเช้า`,
                createdById: employeeUserId,
              }),
            );
            pushIfPresent(
              logs,
              buildLog({
                employee,
                dateKey,
                rule: checkoutRule,
                offsetMinutes: normalCheckoutOffset,
                note: `${baseNote} | ออกงานหลังลาครึ่งเช้า`,
                createdById: employeeUserId,
              }),
            );
          } else {
            pushIfPresent(
              logs,
              buildLog({
                employee,
                dateKey,
                rule: morningRule,
                offsetMinutes: normalMorningOffset,
                note: `${baseNote} | เข้างานเช้าก่อนลาครึ่งบ่าย`,
                createdById: employeeUserId,
              }),
            );
          }
          continue;
        }
      }

      if (scenario === "OFFSITE_APPROVED_FULL") {
        const requestNo = `${SEED_PREFIX}-OF-${dateCompact}-${employeeCode}-${uniqueSuffix}`;
        const offsiteStart = morningRule?.expectedTime ?? policy.morningCheckInDeadline ?? "08:00";
        const offsiteEnd = checkoutRule?.expectedTime ?? policy.checkoutAllowedFrom ?? "17:00";
        offsiteRequests.push({
          requestNo,
          companyId: employee.companyId,
          employeeId: employee.id,
          workDate: dateOnly(dateKey),
          startTime: offsiteStart,
          endTime: offsiteEnd,
          locationType: "CUSTOMER_SITE",
          locationName: "ออกงานนอกสถานที่ตามแผนงาน",
          address: "สถานที่ปฏิบัติงานนอกบริษัท (ข้อมูลทดสอบ)",
          radiusMeters: 300,
          reason: "ข้อมูลทดสอบ: ทำงานนอกสถานที่อนุมัติแล้ว",
          status: "APPROVED",
          submittedAt: bangkokDateTime(dateKey, "07:30"),
          approvedAt: bangkokDateTime(dateKey, "07:45"),
          submittedById: employeeUserId,
          approvedById: systemUserId,
          policySnapshot: {
            seedSource: SEED_SOURCE,
            timezone: BANGKOK_TIMEZONE,
          },
          approvalSnapshot: {
            seedSource: SEED_SOURCE,
            status: "APPROVED",
          },
          deletedAt: null,
        });
        continue;
      }

      if (scenario === "MISSING_CHECKOUT_REVIEW") {
        pushIfPresent(
          logs,
          buildLog({
            employee,
            dateKey,
            rule: morningRule,
            offsetMinutes: normalMorningOffset,
            note: `${baseNote} | เคสทดสอบต้องตรวจสอบเล็กน้อย: ไม่มีออกงาน`,
            createdById: employeeUserId,
          }),
        );
        pushIfPresent(
          logs,
          buildLog({
            employee,
            dateKey,
            rule: afternoonRule,
            offsetMinutes: normalAfternoonOffset,
            note: `${baseNote} | เคสทดสอบต้องตรวจสอบเล็กน้อย: ไม่มีออกงาน`,
            createdById: employeeUserId,
          }),
        );
        continue;
      }

      const morningOffset = scenario === "MORNING_LATE" ? 8 + (hash % 18) : normalMorningOffset;
      const afternoonOffset = scenario === "AFTERNOON_LATE" ? 6 + (hash % 14) : normalAfternoonOffset;
      const checkoutOffset = scenario === "EARLY_CHECKOUT"
        ? -(10 + (hash % 21))
        : scenario === "OT_APPROVED"
          ? 60 + (hash % 61)
          : normalCheckoutOffset;

      pushIfPresent(
        logs,
        buildLog({
          employee,
          dateKey,
          rule: morningRule,
          offsetMinutes: morningOffset,
          note: baseNote,
          createdById: employeeUserId,
        }),
      );
      pushIfPresent(
        logs,
        buildLog({
          employee,
          dateKey,
          rule: afternoonRule,
          offsetMinutes: afternoonOffset,
          note: baseNote,
          createdById: employeeUserId,
        }),
      );
      pushIfPresent(
        logs,
        buildLog({
          employee,
          dateKey,
          rule: checkoutRule,
          offsetMinutes: checkoutOffset,
          note: baseNote,
          createdById: employeeUserId,
        }),
      );

      if (scenario === "OT_APPROVED") {
        const checkoutExpected = checkoutRule?.expectedTime ?? policy.checkoutAllowedFrom ?? "17:00";
        const startTime = addMinutes(bangkokDateTime(dateKey, checkoutExpected), 30);
        const endTime = addMinutes(startTime, 90 + (hash % 61));
        const totalHours = Math.max(1, Math.round(((endTime.getTime() - startTime.getTime()) / 3_600_000) * 100) / 100);

        overtimeRequests.push({
          requestNo: `${SEED_PREFIX}-OT-${dateCompact}-${employeeCode}-${uniqueSuffix}`,
          employeeId: employee.id,
          workDate: dateOnly(dateKey),
          startTime,
          endTime,
          breakMinutes: 0,
          totalHours: totalHours.toFixed(2),
          workType: "WORKDAY",
          reason: "ข้อมูลทดสอบ: OT อนุมัติแล้ว",
          note: baseNote,
          status: "APPROVED",
          submittedAt: bangkokDateTime(dateKey, "14:30"),
          approvedAt: bangkokDateTime(dateKey, "15:00"),
          submittedById: employeeUserId,
          deletedAt: null,
        });
      }
    }
  }

  console.log("\nสรุป scenario ที่เตรียม seed:");
  for (const [key, value] of Object.entries(counters)) {
    console.log(`- ${key}: ${value}`);
  }

  console.log("\nจำนวนข้อมูลที่จะสร้าง:");
  console.log(`- attendance_logs: ${logs.length}`);
  console.log(`- leave_requests: ${leaveRequests.length}`);
  console.log(`- offsite_work_requests: ${offsiteRequests.length}`);
  console.log(`- overtime_requests: ${overtimeRequests.length}`);

  if (args.dryRun) {
    console.log("\nDry run เท่านั้น ยังไม่ได้บันทึกข้อมูลจริง");
    return;
  }

  const prismaAny = prisma as any;

  if (logs.length > 0) {
    await prisma.attendanceLog.createMany({ data: logs });
  }
  if (leaveRequests.length > 0) {
    await prismaAny.leaveRequest.createMany({ data: leaveRequests, skipDuplicates: true });
  }
  if (offsiteRequests.length > 0) {
    await prismaAny.offsiteWorkRequest.createMany({ data: offsiteRequests, skipDuplicates: true });
  }
  if (overtimeRequests.length > 0) {
    await prismaAny.overtimeRequest.createMany({ data: overtimeRequests, skipDuplicates: true });
  }

  console.log("\nSeed สำเร็จ");
  console.log("ขั้นตอนถัดไป: ไปหน้า HR Review แล้วกดคำนวณใหม่ หรือเรียก endpoint recalculate ตามสิทธิ์ HR/Admin");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
