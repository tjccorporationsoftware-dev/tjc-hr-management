import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import {
  normalizeSalaryBasis,
  resolveMonthlyEquivalentWage,
} from "../../../common/utils/salary-rate.util";
import { toMoneyString } from "../utils/payroll-money.util";
import { DEFAULT_PAYROLL_COMPONENT_CODES } from "../constants/payroll-default-components";
import { PayrollSourcePreviewService } from "./payroll-source-preview.service";

type ReadinessStatus = "PASS" | "FAIL" | "WARN" | "INFO";
type ReadinessSeverity = "CRITICAL" | "WARNING" | "INFO";

type ReadinessIssueItem = {
  employeeId?: string | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  departmentName?: string | null;
  detail: string;
  amount?: string | null;
};

type ReadinessCheck = {
  code: string;
  title: string;
  description: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  blocking: boolean;
  count: number;
  recommendation: string | null;
  items: ReadinessIssueItem[];
};

type EmployeeLike = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  position?: string | null;
  status?: string | null;
  department?: { nameTh?: string | null } | null;
  branch?: { nameTh?: string | null } | null;
};

type RunScope = {
  run: any;
  employees: EmployeeLike[];
  employeeIds: string[];
  /** ขอบเขตสาขาของรอบ — ว่าง = ทั้งบริษัท */
  branchIds: string[];
};

function getEmployeeName(employee?: EmployeeLike | null) {
  if (!employee) return "-";
  return (
    employee.displayName ||
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ") ||
    employee.employeeCode ||
    "-"
  );
}

function getDepartmentName(employee?: EmployeeLike | null) {
  return employee?.department?.nameTh || employee?.branch?.nameTh || null;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return {
    year: Number.isFinite(year) ? year : 1970,
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
  };
}

function formatDateKeyParts(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function toPayrollDateKey(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  // Payroll/HR Review ใช้วันตาม Asia/Bangkok เป็น date-only
  // ห้ามใช้ toISOString().slice(0, 10) ตรง ๆ เพราะจะเป็น UTC และทำให้วันที่งวด 26-25 เลื่อนวันได้
  const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return formatDateKeyParts(
    bangkokDate.getUTCFullYear(),
    bangkokDate.getUTCMonth() + 1,
    bangkokDate.getUTCDate(),
  );
}

function formatDateOnly(value?: Date | string | null) {
  return toPayrollDateKey(value) || "-";
}

function payrollDayStartUtc(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day) - BANGKOK_OFFSET_MS);
}

function payrollDayEndUtc(dateKey: string) {
  return new Date(payrollDayStartUtc(dateKey).getTime() + DAY_MS - 1);
}

/**
 * ขอบเขตสำหรับคอลัมน์ชนิด date (เช่น AttendanceDailySummary.workDate)
 * -----------------------------------------------------------------
 * startUtc/endUtc เป็น timestamp ที่ขยับตามเขตเวลากรุงเทพ (ลบ 7 ชม.)
 * ซึ่งใช้กับคอลัมน์ timestamp ได้ถูกต้อง แต่พอเอาไปเทียบกับคอลัมน์ date
 * Postgres จะตัดเวลาทิ้งเหลือแค่วันที่ ทำให้ขอบล่างเลื่อนไปเป็นวันก่อนหน้า
 *
 * ผลคือช่วงงวดกินวันสุดท้ายของงวดก่อนเข้ามาด้วย แล้วการตรวจ
 * "มี Attendance Summary ที่ผูก Payroll Run อื่นแล้ว" ก็ฟ้องทุกงวดที่ไม่ใช่งวดแรก
 * จนคำนวณเงินเดือนไม่ได้
 */
function payrollDateColumnBounds(startKey: string, endKey: string) {
  const parse = (key: string) => {
    const { year, month, day } = parseDateKey(key);
    return new Date(Date.UTC(year, month - 1, day));
  };

  return { gte: parse(startKey), lte: parse(endKey) };
}

function buildPayrollDateRange(start: Date, end: Date) {
  const startKey = toPayrollDateKey(start);
  const endKey = toPayrollDateKey(end);

  return {
    startKey,
    endKey,
    startUtc: payrollDayStartUtc(startKey),
    endUtc: payrollDayEndUtc(endKey),
    dateKeys: dateKeysInRange(startKey, endKey),
  };
}

function inclusiveDateDiffDays(start: Date, end: Date) {
  return buildPayrollDateRange(start, end).dateKeys.length;
}

function dateKeysInRange(start: Date | string, end: Date | string) {
  const startKey = typeof start === "string" ? start : toPayrollDateKey(start);
  const endKey = typeof end === "string" ? end : toPayrollDateKey(end);
  if (!startKey || !endKey || startKey > endKey) return [];

  const keys: string[] = [];
  const { year, month, day } = parseDateKey(startKey);
  const endParts = parseDateKey(endKey);
  const current = new Date(Date.UTC(year, month - 1, day));
  const final = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));

  while (current <= final) {
    keys.push(
      formatDateKeyParts(
        current.getUTCFullYear(),
        current.getUTCMonth() + 1,
        current.getUTCDate(),
      ),
    );
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return keys;
}

function moneyToNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function hoursToString(value: unknown) {
  const hours = Number(value ?? 0);
  if (!Number.isFinite(hours)) return "0";
  return hours.toLocaleString("th-TH", {
    minimumFractionDigits: hours % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function compactText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function summarizeRequestStatuses(requests: any[]) {
  if (!requests.length) return "ไม่พบรายการค้าง";

  const counts = new Map<string, number>();
  for (const request of requests) {
    const status = compactText(request.status, "UNKNOWN");
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => `${status} ${count.toLocaleString("th-TH")} รายการ`)
    .join(", " );
}

function joinDetailParts(parts: Array<string | null | undefined>) {
  return parts.map((part) => compactText(part, "")).filter(Boolean).join(" · " );
}

@Injectable()
export class PayrollReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollSourcePreviewService: PayrollSourcePreviewService,
  ) {}

  async getReadiness(runId: string, employeeIds?: string[]) {
    const scope = await this.getRunScope(runId, employeeIds);
    const checks: ReadinessCheck[] = [];
    const pushCheck = (params: {
      code: string;
      title: string;
      description: string;
      status?: ReadinessStatus;
      severity?: ReadinessSeverity;
      blocking?: boolean;
      count?: number;
      recommendation?: string | null;
      items?: ReadinessIssueItem[];
    }) => {
      const status = params.status ?? "PASS";
      const severity =
        params.severity ??
        (status === "FAIL"
          ? "CRITICAL"
          : status === "WARN"
            ? "WARNING"
            : "INFO");

      checks.push({
        code: params.code,
        title: params.title,
        description: params.description,
        status,
        severity,
        blocking: Boolean(
          params.blocking ?? (status === "FAIL" && severity === "CRITICAL"),
        ),
        count: params.count ?? 0,
        recommendation: params.recommendation ?? null,
        items: params.items ?? [],
      });
    };

    const {
      run,
      employees,
      employeeIds: scopedEmployeeIds,
      branchIds: runBranchIds,
    } = scope;
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const periodStartDate = run.period.startDate;
    const periodEndDate = run.period.endDate;
    const paymentDate = run.period.paymentDate ?? periodEndDate;
    const periodRange = buildPayrollDateRange(periodStartDate, periodEndDate);
    const periodStartForQuery = periodRange.startUtc;
    const periodEndForQuery = periodRange.endUtc;
    const expectedDateKeys = periodRange.dateKeys;
    const periodDateBounds = payrollDateColumnBounds(
      periodRange.startKey,
      periodRange.endKey,
    );
    const periodDayCount = expectedDateKeys.length;

    if (["LOCKED", "CLOSED", "CANCELLED"].includes(run.period.status)) {
      pushCheck({
        code: "PERIOD_OPEN_FOR_CALCULATION",
        title: "งวดเงินเดือนไม่เปิดให้คำนวณ",
        description: `สถานะงวดเงินเดือนปัจจุบันคือ ${run.period.status}`,
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        recommendation: "เปิดงวดเงินเดือน หรือสร้างงวดใหม่ก่อนคำนวณ Payroll",
      });
    } else {
      pushCheck({
        code: "PERIOD_OPEN_FOR_CALCULATION",
        title: "งวดเงินเดือนเปิดให้คำนวณได้",
        description: `งวด ${run.period.code ?? run.period.name ?? ""} อยู่สถานะ ${run.period.status}`,
        status: "PASS",
      });
    }

    if (!["DRAFT", "FAILED", "CALCULATED"].includes(run.status)) {
      pushCheck({
        code: "RUN_STATUS_CALCULATABLE",
        title: "Payroll Run ไม่อยู่สถานะที่คำนวณใหม่ได้",
        description: `สถานะ Payroll Run ปัจจุบันคือ ${run.status}`,
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        recommendation:
          "คำนวณได้เฉพาะ Payroll Run สถานะ DRAFT, FAILED หรือ CALCULATED เท่านั้น",
      });
    } else {
      pushCheck({
        code: "RUN_STATUS_CALCULATABLE",
        title: "Payroll Run พร้อมสำหรับ Precheck/Calculate",
        description: `สถานะ Payroll Run คือ ${run.status}`,
        status: "PASS",
      });
    }

    if (employees.length <= 0) {
      pushCheck({
        code: "ACTIVE_EMPLOYEES_REQUIRED",
        title: "ไม่พบพนักงานในขอบเขตงวดนี้",
        description:
          "ต้องมีพนักงาน ACTIVE/PROBATION อย่างน้อย 1 คนก่อนคำนวณ Payroll",
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        recommendation: "ตรวจข้อมูลพนักงาน บริษัท และตัวกรอง employeeIds",
      });
    } else {
      pushCheck({
        code: "ACTIVE_EMPLOYEES_REQUIRED",
        title: "พบพนักงานสำหรับคำนวณ Payroll",
        description: `พบพนักงาน ${employees.length.toLocaleString("th-TH")} คน`,
        status: "PASS",
        count: employees.length,
      });
    }

    /*
     * คนเข้า-ออกกลางงวด
     * ----------------
     * ตัวคำนวณคิดเงินเดือนตามสัดส่วนวันที่เป็นพนักงานจริงให้แล้ว
     * แต่ยังต้องชี้ให้ HR เห็น เพราะเป็นกลุ่มที่ยอดต่างจากเดือนปกติ
     * และมักมีรายการเพิ่ม/หักเฉพาะงวดแรกที่ระบบไม่รู้
     */
    const midPeriodJoiners = employees.filter((employee: any) => {
      if (!employee.startDate) return false;
      const startDate = new Date(employee.startDate);
      return (
        !Number.isNaN(startDate.getTime()) &&
        startDate.getTime() > periodStartForQuery.getTime()
      );
    });

    if (midPeriodJoiners.length > 0) {
      pushCheck({
        code: "MID_PERIOD_NEW_HIRE",
        title: "มีพนักงานเข้าใหม่กลางงวด",
        description: `พบพนักงาน ${midPeriodJoiners.length.toLocaleString("th-TH")} คนที่เริ่มงานหลังวันเริ่มงวด ระบบคิดเงินเดือนตามสัดส่วนวันที่เป็นพนักงานให้แล้ว`,
        status: "WARN",
        severity: "WARNING",
        count: midPeriodJoiners.length,
        recommendation:
          "ตรวจยอดของคนกลุ่มนี้ก่อนอนุมัติ อย่าเพิ่มรายการปรับปรุงลดยอดซ้ำ เพราะระบบหารตามวันไปแล้ว",
        items: midPeriodJoiners.map((employee: any) => ({
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: getEmployeeName(employee),
          departmentName: employee.department?.nameTh ?? null,
          detail: `เริ่มงาน ${formatDateOnly(employee.startDate)} · งวดเริ่ม ${formatDateOnly(periodStartForQuery)}`,
        })),
      });
    } else {
      pushCheck({
        code: "MID_PERIOD_NEW_HIRE",
        title: "ไม่มีพนักงานเข้าใหม่กลางงวด",
        description: "พนักงานทุกคนในงวดนี้เริ่มงานก่อนวันเริ่มงวดแล้ว",
        status: "PASS",
      });
    }

    const leaversInPeriod = await (this.prisma as any).offboardingCase.findMany({
      where: {
        companyId: run.companyId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        effectiveDate: { gte: periodStartForQuery, lte: periodEndForQuery },
        // ใช้ employeeIds ที่ผู้เรียกระบุมาเท่านั้น ห้ามใช้ scopedEmployeeIds
        // เพราะตัวนั้นมาจากรายชื่อ ACTIVE/PROBATION ซึ่งตัดคนที่ลาออกแล้วทิ้ง
        // — คนที่ต้องเตือนพอดี
        ...(employeeIds?.length ? { employeeId: { in: employeeIds } } : {}),
        /*
         * ขอบเขตสาขาต้องกรองที่นี่ด้วย เพราะ query นี้ตั้งใจไม่ใช้ scopedEmployeeIds
         * ถ้าไม่กรอง คนลาออกของสาขาอื่นจะโผล่มาเตือนในรอบที่ไม่เกี่ยวกับเขา
         */
        ...(runBranchIds.length
          ? { employee: { branchId: { in: runBranchIds } } }
          : {}),
      },
      select: {
        employeeId: true,
        status: true,
        effectiveDate: true,
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            status: true,
            department: { select: { nameTh: true } },
          },
        },
      },
      orderBy: { effectiveDate: "asc" },
    });

    if (leaversInPeriod.length > 0) {
      // คนที่ปิดเคสไปแล้วจะไม่อยู่ในรายชื่อที่ดึงมาคำนวณ = งวดสุดท้ายได้ 0 บาท
      const droppedFromRun = leaversInPeriod.filter(
        (item: any) => !employeeById.has(item.employeeId),
      );

      pushCheck({
        code: "MID_PERIOD_LEAVER",
        title:
          droppedFromRun.length > 0
            ? "มีพนักงานที่พ้นสภาพในงวดนี้และหลุดจากการคำนวณแล้ว"
            : "มีพนักงานที่พ้นสภาพในงวดนี้",
        description:
          droppedFromRun.length > 0
            ? `พบ ${droppedFromRun.length.toLocaleString("th-TH")} คนที่พ้นสภาพแล้วจึงไม่ถูกดึงเข้างวดนี้ ทั้งที่ยังมีวันทำงานอยู่ในงวด`
            : `พบพนักงาน ${leaversInPeriod.length.toLocaleString("th-TH")} คนที่มีวันพ้นสภาพอยู่ในงวดนี้ ระบบยังคิดเงินเดือนให้เต็มเดือน`,
        status: "WARN",
        severity: droppedFromRun.length > 0 ? "CRITICAL" : "WARNING",
        count: leaversInPeriod.length,
        recommendation:
          droppedFromRun.length > 0
            ? "คนที่ปิดเคสไปแล้วจะได้เงินงวดนี้ 0 บาท ต้องเพิ่มรายการจ่ายเอง — ครั้งต่อไปให้คำนวณงวดสุดท้ายก่อนปิดเคสที่หน้าพนักงานออกจากงาน"
            : "ตรวจยอดเงินเดือนของคนกลุ่มนี้ และคำนวณงวดนี้ให้เสร็จก่อนปิดเคสที่หน้าพนักงานออกจากงาน",
        items: leaversInPeriod.map((item: any) => ({
          employeeId: item.employeeId,
          employeeCode: item.employee?.employeeCode ?? null,
          employeeName: getEmployeeName(item.employee),
          departmentName: item.employee?.department?.nameTh ?? null,
          detail: employeeById.has(item.employeeId)
            ? `พ้นสภาพ ${formatDateOnly(item.effectiveDate)} · ยังอยู่ในงวด`
            : `พ้นสภาพ ${formatDateOnly(item.effectiveDate)} · ไม่ถูกดึงเข้างวด (สถานะพนักงาน ${item.employee?.status ?? "-"})`,
        })),
      });
    } else {
      pushCheck({
        code: "MID_PERIOD_LEAVER",
        title: "ไม่มีพนักงานพ้นสภาพในงวดนี้",
        description: "ไม่พบเคสออกจากงานที่มีวันพ้นสภาพอยู่ในช่วงงวดนี้",
        status: "PASS",
      });
    }

    const latestCompensationByEmployeeId = await this.getLatestCompensationMap({
      companyId: run.companyId,
      periodStartDate: periodStartForQuery,
      periodEndDate: periodEndForQuery,
      employeeIds: scopedEmployeeIds,
    });
    const futureCompensationByEmployeeId =
      await this.getNearestFutureCompensationMap({
        companyId: run.companyId,
        periodEndDate: periodEndForQuery,
        employeeIds: scopedEmployeeIds,
      });

    /*
     * ประเภทพนักงานกับฐานค่าจ้างต้องสอดคล้องกัน
     * -------------------------------------
     * ฐานค่าจ้างเป็นตัวบอกว่าเลข baseSalary หมายถึงอะไร ถ้าตั้งไม่ตรงกับ
     * ประเภทพนักงาน ยอดจะผิดเป็นสามสิบเท่าโดยไม่มีอะไรฟ้อง
     *
     *   ตั้งประเภท "รายวัน" แต่ฐานเป็นรายเดือน  -> ค่าแรงวันละ 500 จ่ายทั้งงวด 500
     *   ตั้งฐาน "รายวัน" แต่ประเภทเป็นรายเดือน   -> เงินเดือน 15,000 คูณวันทำงาน
     *
     * เช็คจากคำในชื่อ/รหัสประเภทพนักงาน เพราะแต่ละบริษัทตั้งรหัสเองได้
     * เตือนอย่างเดียว ไม่บล็อก เพราะบางบริษัทตั้งใจใช้ต่างจากชื่อจริง ๆ
     */
    const looksDailyOrHourly = (employee: any) => {
      const text = `${employee.employeeType?.code ?? ""} ${employee.employeeType?.nameTh ?? ""}`;
      return /DAILY|HOURLY|รายวัน|รายชั่วโมง|พาร์ทไทม์|พาร์ไทม์/i.test(text);
    };

    const salaryBasisMismatches = employees
      .map((employee: any) => {
        const compensation = latestCompensationByEmployeeId.get(employee.id);
        if (!compensation) return null;

        const basis = normalizeSalaryBasis(compensation.salaryBasis);
        const typeIsDaily = looksDailyOrHourly(employee);
        const basisIsDaily = basis !== "MONTHLY";
        if (typeIsDaily === basisIsDaily) return null;

        return {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: getEmployeeName(employee),
          departmentName: employee.department?.nameTh ?? null,
          detail: typeIsDaily
            ? `ประเภท "${employee.employeeType?.nameTh ?? employee.employeeType?.code}" แต่ฐานค่าจ้างเป็นรายเดือน · ค่าจ้างจะถูกจ่ายเพียง ${toMoneyString(compensation.baseSalary)} บาทตลอดงวด`
            : `ฐานค่าจ้างเป็น ${basis === "DAILY" ? "รายวัน" : "รายชั่วโมง"} แต่ประเภทพนักงานคือ "${employee.employeeType?.nameTh ?? employee.employeeType?.code ?? "ไม่ระบุ"}" · ยอดจะถูกคูณจำนวนวันทำงาน`,
        };
      })
      .filter(Boolean) as ReadinessIssueItem[];

    if (salaryBasisMismatches.length > 0) {
      pushCheck({
        code: "SALARY_BASIS_MATCHES_EMPLOYEE_TYPE",
        title: "ฐานค่าจ้างไม่ตรงกับประเภทพนักงาน",
        description: `พบพนักงาน ${salaryBasisMismatches.length.toLocaleString("th-TH")} คนที่ตั้งประเภทกับฐานค่าจ้างไม่สอดคล้องกัน ยอดอาจผิดหลายสิบเท่า`,
        status: "WARN",
        severity: "WARNING",
        count: salaryBasisMismatches.length,
        recommendation:
          'แก้ที่ เงินเดือนพนักงาน > ฐานค่าจ้าง ให้ตรงกับประเภทพนักงาน แล้วคำนวณงวดใหม่',
        items: salaryBasisMismatches,
      });
    } else {
      pushCheck({
        code: "SALARY_BASIS_MATCHES_EMPLOYEE_TYPE",
        title: "ฐานค่าจ้างตรงกับประเภทพนักงาน",
        description: "ทุกคนตั้งฐานค่าจ้าง (รายเดือน/รายวัน/รายชั่วโมง) สอดคล้องกับประเภทพนักงานแล้ว",
        status: "PASS",
      });
    }

    const missingCompensationEmployees = employees.filter((employee) => {
      const compensation = latestCompensationByEmployeeId.get(employee.id);
      return !compensation || moneyToNumber(compensation.baseSalary) <= 0;
    });
    const futureCompensationEmployees = missingCompensationEmployees.filter(
      (employee) => {
        const futureCompensation = futureCompensationByEmployeeId.get(
          employee.id,
        );
        return (
          futureCompensation && moneyToNumber(futureCompensation.baseSalary) > 0
        );
      },
    );
    const noUsableCompensationEmployees = missingCompensationEmployees.filter(
      (employee) => !futureCompensationByEmployeeId.has(employee.id),
    );

    if (missingCompensationEmployees.length > 0) {
      pushCheck({
        code: "EMPLOYEE_COMPENSATION_READY",
        title: "ฐานเงินเดือนยังไม่พร้อมสำหรับงวดนี้",
        description: `Payroll ต้องมี Employee Compensation ที่มีผลใช้ไม่เกินวันสิ้นงวด (${formatDateOnly(periodEndDate)}) และ baseSalary มากกว่า 0`,
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: missingCompensationEmployees.length,
        items: missingCompensationEmployees.slice(0, 30).map((employee) => {
          const futureCompensation = futureCompensationByEmployeeId.get(
            employee.id,
          );
          const futureBaseSalary = moneyToNumber(
            futureCompensation?.baseSalary,
          );

          return {
            employeeId: employee.id,
            employeeCode: employee.employeeCode,
            employeeName: getEmployeeName(employee),
            departmentName: getDepartmentName(employee),
            detail:
              futureCompensation && futureBaseSalary > 0
                ? `มีฐานเงินเดือน ${toMoneyString(futureCompensation.baseSalary)} แล้ว แต่เริ่มใช้วันที่ ${formatDateOnly(futureCompensation.effectiveDate)} ซึ่งอยู่หลังวันสิ้นงวด ${formatDateOnly(periodEndDate)}`
                : "ยังไม่มีฐานเงินเดือน active ที่ใช้ได้ในงวดนี้ หรือ baseSalary = 0",
            amount:
              futureCompensation && futureBaseSalary > 0
                ? toMoneyString(futureCompensation.baseSalary)
                : null,
          };
        }),
        recommendation:
          futureCompensationEmployees.length > 0 &&
          noUsableCompensationEmployees.length <= 0
            ? `ปรับ/เพิ่ม Employee Compensation ให้มี effectiveDate ไม่เกิน ${formatDateOnly(periodEndDate)} เช่น วันเริ่มงวด ${formatDateOnly(periodStartDate)} หรือรัน dev script ด้วย --effectiveDate=${formatDateOnly(periodStartDate)} --copyFuture`
            : `ตรวจ Payroll > Compensation ให้พนักงานทุกคนมีฐานเงินเดือนที่มีผลใช้ในงวดนี้ หรือรัน dev script ด้วย --effectiveDate=${formatDateOnly(periodStartDate)} --copyFuture`,
      });
    } else {
      pushCheck({
        code: "EMPLOYEE_COMPENSATION_READY",
        title: "ฐานเงินเดือนพนักงานพร้อมสำหรับงวดนี้",
        description: `พบ Employee Compensation ที่มีผลใช้ถึงวันสิ้นงวด ${formatDateOnly(periodEndDate)} ครบทุกคน`,
        status: "PASS",
        count: employees.length,
      });
    }

    const taxEnabledEmployees = employees.filter((employee) => {
      const compensation = latestCompensationByEmployeeId.get(employee.id);
      return compensation && compensation.taxEnabled !== false;
    });

    if (!taxEnabledEmployees.length) {
      pushCheck({
        code: "TAX_PROFILE_READY",
        title: "ไม่มีพนักงานที่เปิดคิดภาษีในงวดนี้",
        description:
          "Employee Compensation ของพนักงานในขอบเขตนี้ปิดการคิดภาษีไว้ทั้งหมด จึงไม่ต้องตรวจ Tax Profile ก่อนคำนวณ",
        status: "PASS",
        count: 0,
      });
    } else {
      const taxYear = await this.findActiveTaxYearForPaymentDate(
        run.companyId,
        paymentDate,
      );

      if (!taxYear) {
        pushCheck({
          code: "TAX_YEAR_FOR_PAYMENT_DATE_READY",
          title: "ยังไม่มีปีภาษีที่ครอบคลุมวันที่จ่ายเงินเดือน",
          description: `Payroll Tax ยังไม่มีปีภาษี ACTIVE ที่ครอบคลุมวันที่จ่าย ${formatDateOnly(paymentDate)} ระบบจะยังคำนวณเงินเดือนได้ แต่จะไม่สร้างยอดภาษีหัก ณ ที่จ่ายจนกว่าจะตั้งค่าปีภาษี`,
          status: "WARN",
          severity: "WARNING",
          blocking: false,
          count: taxEnabledEmployees.length,
          items: taxEnabledEmployees.slice(0, 30).map((employee) => ({
            employeeId: employee.id,
            employeeCode: employee.employeeCode,
            employeeName: getEmployeeName(employee),
            departmentName: getDepartmentName(employee),
            detail: `เปิดคิดภาษี แต่ยังไม่มีปีภาษีสำหรับวันที่จ่าย ${formatDateOnly(paymentDate)}`,
            amount: null,
          })),
          recommendation:
            "Payroll Run สามารถคำนวณต่อได้โดยบันทึกภาษีเป็น 0 ก่อน แต่ควรไปที่ Payroll > Tax ตั้งค่าปีภาษีให้ครอบคลุมวันที่จ่ายก่อนอนุมัติหรือจ่ายเงินจริง",
        });
      } else {
        pushCheck({
          code: "TAX_YEAR_FOR_PAYMENT_DATE_READY",
          title: "ปีภาษีตรงกับวันที่จ่ายเงินเดือนแล้ว",
          description: `ใช้ปีภาษี ${taxYear.taxYear} (${formatDateOnly(taxYear.startDate)} - ${formatDateOnly(taxYear.endDate)}) สำหรับวันที่จ่าย ${formatDateOnly(paymentDate)}`,
          status: "PASS",
          count: 1,
        });

        const taxBracketCount = await (this.prisma as any).payrollTaxBracket.count({
          where: {
            taxYearId: taxYear.id,
            deletedAt: null,
          },
        });

        if (taxBracketCount <= 0) {
          pushCheck({
            code: "TAX_BRACKETS_READY",
            title: "ปีภาษียังไม่มีขั้นภาษี",
            description:
              "Tax Engine ยังไม่มี tax bracket ระบบจะยังคำนวณเงินเดือนได้ แต่จะไม่สร้างยอดภาษีหัก ณ ที่จ่ายจนกว่าจะตั้งค่าขั้นภาษี",
            status: "WARN",
            severity: "WARNING",
            blocking: false,
            count: 1,
            recommendation:
              "Payroll Run สามารถคำนวณต่อได้โดยบันทึกภาษีเป็น 0 ก่อน แต่ควรไปที่ Payroll > Tax > ขั้นภาษี แล้วเพิ่มขั้นภาษีของปีภาษีนี้ก่อนอนุมัติหรือจ่ายเงินจริง",
          });
        } else {
          pushCheck({
            code: "TAX_BRACKETS_READY",
            title: "ขั้นภาษีพร้อมใช้งาน",
            description: `พบขั้นภาษี ${taxBracketCount.toLocaleString("th-TH")} ขั้นสำหรับปีภาษี ${taxYear.taxYear}`,
            status: "PASS",
            count: taxBracketCount,
          });
        }

        /*
         * ไม่มีค่าลดหย่อนที่แจ้งไว้ไม่ได้แปลว่าคำนวณภาษีไม่ได้ — tax engine ใช้
         * ลดหย่อนส่วนตัว + ประกันสังคมให้อยู่แล้ว เช็คนี้จึงเตือนแค่ว่าคนกลุ่มนี้
         * อาจถูกหักภาษีสูงกว่าที่ควรจนกว่าจะกรอกค่าลดหย่อนเพิ่ม
         */
        const profilesWithAllowance = await (this.prisma as any).employeeTaxProfile.findMany({
          where: {
            taxYearId: taxYear.id,
            employeeId: { in: taxEnabledEmployees.map((employee) => employee.id) },
            deletedAt: null,
            allowances: { some: { deletedAt: null } },
          },
          select: { employeeId: true },
        });
        const employeeIdsWithAllowance = new Set(
          profilesWithAllowance.map((profile: any) => profile.employeeId),
        );
        const employeesUsingDefaultAllowance = taxEnabledEmployees.filter(
          (employee) => !employeeIdsWithAllowance.has(employee.id),
        );

        if (employeesUsingDefaultAllowance.length > 0) {
          pushCheck({
            code: "TAX_PROFILE_READY",
            title: "มีพนักงานที่ยังไม่ได้แจ้งค่าลดหย่อน",
            description:
              "พนักงานกลุ่มนี้จะถูกคิดภาษีด้วยค่าลดหย่อนพื้นฐาน (ส่วนตัว + ประกันสังคม) เท่านั้น ภาษีที่หักอาจสูงกว่าความเป็นจริง",
            status: "WARN",
            severity: "WARNING",
            blocking: false,
            count: employeesUsingDefaultAllowance.length,
            items: employeesUsingDefaultAllowance.slice(0, 30).map((employee) => ({
              employeeId: employee.id,
              employeeCode: employee.employeeCode,
              employeeName: getEmployeeName(employee),
              departmentName: getDepartmentName(employee),
              detail: `ยังไม่มีค่าลดหย่อนที่แจ้งไว้สำหรับปีภาษี ${taxYear.taxYear} · ระบบคิดภาษีให้ด้วยค่าลดหย่อนพื้นฐาน`,
              amount: null,
            })),
            recommendation:
              "ถ้าพนักงานยื่น ล.ย.01 ไว้แล้ว ให้ไปที่ Payroll > Tax > ข้อมูลภาษีพนักงาน แล้วกรอกค่าลดหย่อนก่อนจ่ายเงินจริง เพื่อไม่ให้หักภาษีเกิน",
          });
        } else {
          pushCheck({
            code: "TAX_PROFILE_READY",
            title: "ค่าลดหย่อนพนักงานครบแล้ว",
            description: `พนักงานที่เปิดคิดภาษี ${taxEnabledEmployees.length.toLocaleString("th-TH")} คนมีค่าลดหย่อนบันทึกไว้ครบในปีภาษี ${taxYear.taxYear}`,
            status: "PASS",
            count: taxEnabledEmployees.length,
          });
        }
      }
    }

    const dailySummaries = scopedEmployeeIds.length
      ? await (this.prisma as any).attendanceDailySummary.findMany({
          where: {
            employeeId: { in: scopedEmployeeIds },
            // workDate เป็นคอลัมน์ date ต้องใช้ขอบเขตแบบวันล้วน
            workDate: periodDateBounds,
          },
          select: {
            id: true,
            employeeId: true,
            workDate: true,
            reviewStatus: true,
            totalDeductionAmount: true,
            totalLateMinutes: true,
            hasMissingLog: true,
            unpaidLeaveMinutes: true,
            offsiteMinutes: true,
            payrollRunId: true,
            sentToPayrollAt: true,
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
          },
          orderBy: [{ employee: { employeeCode: "asc" } }, { workDate: "asc" }],
        })
      : [];

    const summaryDateKeysByEmployeeId = new Map<string, Set<string>>();
    const duplicateDateKeysByEmployeeId = new Map<string, Map<string, number>>();

    for (const summary of dailySummaries) {
      const workDateKey = formatDateOnly(summary.workDate);
      const dateKeys =
        summaryDateKeysByEmployeeId.get(summary.employeeId) ?? new Set<string>();

      if (dateKeys.has(workDateKey)) {
        const duplicateKeys =
          duplicateDateKeysByEmployeeId.get(summary.employeeId) ??
          new Map<string, number>();
        duplicateKeys.set(workDateKey, (duplicateKeys.get(workDateKey) ?? 1) + 1);
        duplicateDateKeysByEmployeeId.set(summary.employeeId, duplicateKeys);
      }

      dateKeys.add(workDateKey);
      summaryDateKeysByEmployeeId.set(summary.employeeId, dateKeys);
    }

    /*
     * วันที่ต้องมีสรุปรายวัน คิดรายคน ไม่ใช่ทั้งงวดเท่ากันหมด
     * ----------------------------------------------------
     * คนเข้าใหม่กลางงวดไม่มีทางมีสรุปของวันก่อนเริ่มงาน และคนที่ออกกลางงวด
     * ก็ไม่มีของวันหลังพ้นสภาพ ถ้าเทียบกับทุกวันของงวดเหมือนกันหมด
     * การตรวจจะฟ้องว่าไม่ครบตลอด แล้วบล็อกไม่ให้คำนวณ payroll ทั้งงวด
     */
    const expectedDateKeysFor = (employee: EmployeeLike) => {
      const hireKey = (employee as any).startDate
        ? toPayrollDateKey((employee as any).startDate)
        : "";
      const leaveKey = (employee as any).employmentEndDate
        ? toPayrollDateKey((employee as any).employmentEndDate)
        : "";

      return expectedDateKeys.filter(
        (dateKey) =>
          (!hireKey || dateKey >= hireKey) && (!leaveKey || dateKey <= leaveKey),
      );
    };

    const employeesWithoutAnySummary = employees.filter(
      (employee) =>
        !summaryDateKeysByEmployeeId.has(employee.id) &&
        expectedDateKeysFor(employee).length > 0,
    );
    const employeesWithIncompleteSummaries = employees
      .map((employee) => {
        const dateKeys = summaryDateKeysByEmployeeId.get(employee.id) ?? new Set<string>();
        const missingDateKeys = expectedDateKeysFor(employee).filter(
          (dateKey) => !dateKeys.has(dateKey),
        );

        const duplicateDateKeys = Array.from(
          duplicateDateKeysByEmployeeId.get(employee.id)?.keys() ?? [],
        );

        return {
          employee,
          summaryDateCount: dateKeys.size,
          missingDateKeys,
          duplicateDateKeys,
        };
      })
      .filter((item) => item.missingDateKeys.length > 0);
    const nonReadySummaries = dailySummaries.filter(
      (summary: any) =>
        !["SENT_TO_PAYROLL", "LOCKED"].includes(
          summary.reviewStatus,
        ),
    );
    const alreadySentToAnotherRun = dailySummaries.filter(
      (summary: any) => summary.payrollRunId && summary.payrollRunId !== run.id,
    );

    if (employeesWithoutAnySummary.length > 0) {
      pushCheck({
        code: "ATTENDANCE_SUMMARY_EXISTS",
        title: "มีพนักงานที่ยังไม่มี Attendance Daily Summary ในงวด",
        description:
          "Payroll ต้องใช้ข้อมูลที่ผ่าน HR Review ไม่ควรคำนวณจาก raw log หรือข้อมูลที่ยังไม่ได้สรุป",
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: employeesWithoutAnySummary.length,
        items: employeesWithoutAnySummary.slice(0, 30).map((employee) => ({
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: getEmployeeName(employee),
          departmentName: getDepartmentName(employee),
          detail: "ไม่พบ daily summary ในช่วงงวดนี้",
          amount: null,
        })),
        recommendation: "ไปที่ HR Review เลือกงวด 26–25 แล้วกดคำนวณงวดนี้ใหม่",
      });
    } else {
      pushCheck({
        code: "ATTENDANCE_SUMMARY_EXISTS",
        title: "พบ Attendance Daily Summary ของพนักงานในงวด",
        description: `พบ daily summary รวม ${dailySummaries.length.toLocaleString("th-TH")} รายการ`,
        status: "PASS",
        count: dailySummaries.length,
      });
    }

    if (employeesWithIncompleteSummaries.length > 0) {
      pushCheck({
        code: "ATTENDANCE_SUMMARY_COMPLETE",
        title: "Attendance Daily Summary ยังไม่ครบทุกวันในงวด",
        description: `Payroll ต้องมี daily summary ครบ ${periodDayCount.toLocaleString("th-TH")} วันต่อพนักงานหนึ่งคนในงวดนี้ ก่อนคำนวณเงินเดือน`,
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: employeesWithIncompleteSummaries.length,
        items: employeesWithIncompleteSummaries.slice(0, 30).map((item) => ({
          employeeId: item.employee.id,
          employeeCode: item.employee.employeeCode,
          employeeName: getEmployeeName(item.employee),
          departmentName: getDepartmentName(item.employee),
          detail: [
            `พบ daily summary ${item.summaryDateCount.toLocaleString("th-TH")}/${periodDayCount.toLocaleString("th-TH")} วัน`,
            `ขาด ${item.missingDateKeys.slice(0, 5).join(", ")}${item.missingDateKeys.length > 5 ? " ..." : ""}`,
            item.duplicateDateKeys.length
              ? `พบวันที่ซ้ำ ${item.duplicateDateKeys.slice(0, 5).join(", ")}${item.duplicateDateKeys.length > 5 ? " ..." : ""}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          amount: null,
        })),
        recommendation:
          "กลับไปหน้า HR Review รายเดือน เลือกงวดเดียวกับ Payroll แล้วคำนวณ/Ready ให้ครบทุกวันก่อนคำนวณเงินเดือน",
      });
    } else if (employees.length > 0) {
      pushCheck({
        code: "ATTENDANCE_SUMMARY_COMPLETE",
        title: "Attendance Daily Summary ครบทุกวันในงวด",
        description: `พนักงานทุกคนมี daily summary ครบ ${periodDayCount.toLocaleString("th-TH")} วันในงวดนี้`,
        status: "PASS",
        count: dailySummaries.length,
      });
    }

    const employeesWithDuplicateSummaries = employees
      .map((employee) => ({
        employee,
        duplicateDateKeys: Array.from(
          duplicateDateKeysByEmployeeId.get(employee.id)?.keys() ?? [],
        ),
      }))
      .filter((item) => item.duplicateDateKeys.length > 0);

    if (employeesWithDuplicateSummaries.length > 0) {
      pushCheck({
        code: "ATTENDANCE_SUMMARY_DUPLICATE_DATES",
        title: "พบ Attendance Daily Summary ซ้ำบางวัน",
        description:
          "มี daily summary มากกว่า 1 แถวในวันเดียวกันของพนักงานบางคน ควรตรวจสอบข้อมูลต้นทางก่อนปิดงวด",
        status: "WARN",
        severity: "WARNING",
        blocking: false,
        count: employeesWithDuplicateSummaries.length,
        items: employeesWithDuplicateSummaries.slice(0, 30).map((item) => ({
          employeeId: item.employee.id,
          employeeCode: item.employee.employeeCode,
          employeeName: getEmployeeName(item.employee),
          departmentName: getDepartmentName(item.employee),
          detail: `วันที่ซ้ำ ${item.duplicateDateKeys.slice(0, 5).join(", ")}${item.duplicateDateKeys.length > 5 ? " ..." : ""}`,
          amount: null,
        })),
        recommendation:
          "ตรวจข้อมูล attendance_daily_summaries ของพนักงานที่พบวันซ้ำ เพื่อให้ HR Review และ Payroll อ้างอิงข้อมูลชุดเดียวกัน",
      });
    }

    if (nonReadySummaries.length > 0) {
      pushCheck({
        code: "ATTENDANCE_REVIEW_READY",
        title: "มีข้อมูลเวลาเข้างานที่ยังไม่ได้ล็อก",
        description:
          "Payroll ดึงได้เฉพาะ daily summary ที่ LOCKED หรือ SENT_TO_PAYROLL เท่านั้น",
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: nonReadySummaries.length,
        items: nonReadySummaries.slice(0, 30).map((summary: any) => ({
          employeeId: summary.employeeId,
          employeeCode: summary.employee?.employeeCode ?? "-",
          employeeName: getEmployeeName(summary.employee),
          departmentName: getDepartmentName(summary.employee),
          detail: `${formatDateOnly(summary.workDate)} ยังอยู่สถานะ ${summary.reviewStatus}`,
          amount:
            summary.totalDeductionAmount == null
              ? null
              : toMoneyString(summary.totalDeductionAmount),
        })),
        recommendation:
          "กลับไปหน้า HR Review รายเดือน ตรวจรายการให้ครบ กดพร้อม Payroll แล้วล็อกทั้งงวดก่อนคำนวณเงินเดือน",
      });
    } else if (dailySummaries.length > 0) {
      pushCheck({
        code: "ATTENDANCE_REVIEW_READY",
        title: "ข้อมูลเวลาเข้างานถูกล็อกและพร้อมเข้า Payroll แล้ว",
        description:
          "Daily summary ในงวดอยู่สถานะ LOCKED หรือ SENT_TO_PAYROLL",
        status: "PASS",
        count: dailySummaries.length,
      });
    }

    if (alreadySentToAnotherRun.length > 0) {
      pushCheck({
        code: "ATTENDANCE_NOT_SENT_TO_OTHER_RUN",
        title: "มี Attendance Summary ที่ผูก Payroll Run อื่นแล้ว",
        description:
          "เพื่อป้องกันนำข้อมูลซ้ำเข้าเงินเดือน ต้องแก้ไขหรือยกเลิก Run เดิมก่อน",
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: alreadySentToAnotherRun.length,
        items: alreadySentToAnotherRun.slice(0, 30).map((summary: any) => ({
          employeeId: summary.employeeId,
          employeeCode: summary.employee?.employeeCode ?? "-",
          employeeName: getEmployeeName(summary.employee),
          departmentName: getDepartmentName(summary.employee),
          detail: `${formatDateOnly(summary.workDate)} ผูก Payroll Run อื่นแล้ว`,
          amount: null,
        })),
        recommendation: "ตรวจ Payroll Run เดิมก่อนคำนวณ Run นี้",
      });
    }

    const pendingLeaves = scopedEmployeeIds.length
      ? await (this.prisma as any).leaveRequest.findMany({
          where: {
            employeeId: { in: scopedEmployeeIds },
            deletedAt: null,
            status: { in: ["DRAFT", "SUBMITTED"] },
            startDate: { lte: periodEndForQuery },
            endDate: { gte: periodStartForQuery },
          },
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
            leaveType: { select: { nameTh: true, code: true } },
          },
          orderBy: [{ startDate: "asc" }],
        })
      : [];

    this.pushPendingRequestCheck(pushCheck, {
      code: "LEAVE_PENDING_APPROVAL",
      title: "มีใบลาที่ยังไม่จบในงวด",
      description: "ใบลาค้างอนุมัติอาจทำให้ยอดลาและยอดหักเงินเดือนผิด",
      requests: pendingLeaves,
      dateField: "startDate",
      typeLabel: (request: any) =>
        request.leaveType?.nameTh || request.leaveType?.code || "Leave",
      recommendation: "อนุมัติ/ปฏิเสธ/ยกเลิกใบลาให้เรียบร้อยก่อนคำนวณ Payroll",
    });

    const pendingOffsiteRaw = scopedEmployeeIds.length
      ? await (this.prisma as any).offsiteWorkRequest.findMany({
          where: {
            employeeId: { in: scopedEmployeeIds },
            deletedAt: null,
            status: { in: ["DRAFT", "SUBMITTED", "MANAGER_APPROVED"] },
            workDate: periodDateBounds,
          },
          orderBy: [{ workDate: "asc" }],
        })
      : [];

    const pendingOffsite = pendingOffsiteRaw.map((request: any) => ({
      ...request,
      employee: employeeById.get(request.employeeId) ?? null,
    }));

    this.pushPendingRequestCheck(pushCheck, {
      code: "OFFSITE_PENDING_REVIEW",
      title: "มีคำขอ Offsite ที่ยังไม่จบในงวด",
      description: `Offsite ที่ยังรอหัวหน้า/HR อนุมัติอาจทำให้สถานะ attendance ไม่ถูกต้อง · ${summarizeRequestStatuses(pendingOffsite)}`,
      requests: pendingOffsite,
      dateField: "workDate",
      typeLabel: (request: any) => `Offsite ${request.status}`,
      itemDetail: (request: any) =>
        joinDetailParts([
          formatDateOnly(request.workDate),
          request.requestNo ? `เลขที่ ${request.requestNo}` : null,
          `สถานะ ${request.status}`,
          request.locationName ? `สถานที่ ${request.locationName}` : null,
          request.reason ? `เหตุผล ${request.reason}` : null,
        ]),
      recommendation:
        "ให้หัวหน้า/HR อนุมัติหรือปฏิเสธ Offsite ให้ครบก่อนคำนวณ Payroll หรือใช้ dev script resolve เฉพาะข้อมูลทดสอบ",
    });

    const pendingTimeAdjust = scopedEmployeeIds.length
      ? await (this.prisma as any).timeAdjustRequest.findMany({
          where: {
            employeeId: { in: scopedEmployeeIds },
            deletedAt: null,
            status: { in: ["DRAFT", "SUBMITTED"] },
            requestedLogTime: { gte: periodStartForQuery, lte: periodEndForQuery },
          },
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
          },
          orderBy: [{ requestedLogTime: "asc" }],
        })
      : [];

    this.pushPendingRequestCheck(pushCheck, {
      code: "TIME_ADJUST_PENDING_APPROVAL",
      title: "มีคำขอแก้เวลาที่ยังไม่จบในงวด",
      description: "Time Adjust ที่ค้างอนุมัติอาจเปลี่ยนยอดสาย/ลืมกด/ออกก่อน",
      requests: pendingTimeAdjust,
      dateField: "requestedLogTime",
      typeLabel: (request: any) => `Time Adjust ${request.status}`,
      recommendation: "อนุมัติ/ปฏิเสธ/ยกเลิกคำขอแก้เวลาให้ครบก่อนคำนวณ Payroll",
    });

    const pendingOvertime = scopedEmployeeIds.length
      ? await (this.prisma as any).overtimeRequest.findMany({
          where: {
            employeeId: { in: scopedEmployeeIds },
            deletedAt: null,
            status: { in: ["DRAFT", "SUBMITTED"] },
            workDate: { gte: periodStartForQuery, lte: periodEndForQuery },
          },
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
          },
          orderBy: [{ workDate: "asc" }],
        })
      : [];

    this.pushPendingRequestCheck(pushCheck, {
      code: "OVERTIME_PENDING_APPROVAL",
      title: "มีคำขอ OT ที่ยังไม่จบในงวด",
      description: `OT ที่ค้างอนุมัติอาจทำให้รายได้ OT ไม่ครบถ้วน · ${summarizeRequestStatuses(pendingOvertime)}`,
      requests: pendingOvertime,
      dateField: "workDate",
      typeLabel: (request: any) => `OT ${request.status}`,
      itemDetail: (request: any) =>
        joinDetailParts([
          formatDateOnly(request.workDate),
          request.requestNo ? `เลขที่ ${request.requestNo}` : null,
          `สถานะ ${request.status}`,
          `ชั่วโมง ${hoursToString(request.totalHours)}`,
          request.workType ? `ประเภท ${request.workType}` : null,
          request.reason ? `เหตุผล ${request.reason}` : null,
        ]),
      recommendation:
        "อนุมัติ/ปฏิเสธ/ยกเลิกคำขอ OT ให้ครบก่อนคำนวณ Payroll หรือใช้ dev script resolve เฉพาะข้อมูลทดสอบ",
    });

    /*
     * บอกให้ชัดว่ารอบนี้คำนวณด้วยค่าตั้งของบริษัทหรือค่ากลางของระบบ
     *
     * ระบบ fallback ไปค่ากลางให้อัตโนมัติเมื่อบริษัทยังไม่ได้ตั้งค่าเอง ซึ่งถูกแล้ว
     * แต่ไม่มีอะไรบอก พอมีหลายบริษัทที่ใช้ฐานประกันสังคมหรือจำนวนวันหารเงินเดือน
     * ต่างกัน จะกลายเป็นคำนวณด้วยค่าที่ไม่ใช่ของบริษัทนั้นโดยไม่มีใครรู้
     */
    const companySettingRow = await (this.prisma as any).$queryRaw<
      Array<{ id: string }>
    >`
      SELECT "id" FROM "company_payroll_settings"
      WHERE "companyId" = ${run.companyId} AND "status" = 'ACTIVE'
      LIMIT 1
    `;

    if (!companySettingRow?.length) {
      pushCheck({
        code: "COMPANY_PAYROLL_SETTINGS_SOURCE",
        title: "บริษัทนี้ยังไม่ได้ตั้งค่าเงินเดือนของตัวเอง",
        description:
          "ระบบจะใช้ค่ากลางของระบบแทน (จำนวนวันหารเงินเดือน ชั่วโมงทำงานต่อวัน อัตราและฐานประกันสังคม) ยังคำนวณต่อได้ แต่ควรยืนยันว่าค่ากลางตรงกับระเบียบของบริษัทนี้",
        status: "WARN",
        severity: "WARNING",
        blocking: false,
        recommendation:
          "ไปที่ ตั้งค่า > เงินเดือน > ค่าตั้งของบริษัท แล้วบันทึกค่าของบริษัทนี้ให้ชัดเจนก่อนจ่ายจริง",
      });
    } else {
      pushCheck({
        code: "COMPANY_PAYROLL_SETTINGS_SOURCE",
        title: "ใช้ค่าตั้งเงินเดือนของบริษัทนี้",
        description:
          "รอบการจ่ายนี้คำนวณด้วยค่าตั้งเงินเดือนที่บันทึกไว้เฉพาะบริษัทนี้",
        status: "PASS",
      });
    }

    /*
     * ใบลา/OT ที่อนุมัติแล้วต้องถูกส่งผ่านหน้า HR Review ก่อน
     *
     * payroll-handoff-import อ่านเฉพาะ hr_review_items ที่สถานะ PAYROLL_READY
     * หรือ SENT_TO_PAYROLL ถ้าข้ามขั้นนี้ไป ระบบยังคำนวณเงินเดือนได้ตามปกติ
     * และไม่มีด่านไหนเตือน แต่จำนวนวันลาบนสลิปจะเป็น 0 ทั้งที่พนักงานลาจริง
     */
    const handoffSources = scopedEmployeeIds.length
      ? await this.findApprovedSourcesMissingHandoff({
          companyId: run.companyId,
          employeeIds: scopedEmployeeIds,
          periodId: run.periodId,
          payrollRunId: run.id,
          periodStart: periodStartForQuery,
          periodEnd: periodEndForQuery,
        })
      : [];

    if (handoffSources.length > 0) {
      pushCheck({
        code: "HR_REVIEW_HANDOFF_READY",
        title: "มีใบลา/OT ที่อนุมัติแล้วแต่ยังไม่ได้ส่งผ่าน HR Review",
        description:
          "รายการเหล่านี้อนุมัติแล้วแต่ยังไม่มีสถานะ PAYROLL_READY ในหน้า HR Review ระบบจะคำนวณเงินเดือนต่อได้ แต่จำนวนวันลาบนสลิปจะไม่ถูกนับ",
        status: "WARN",
        severity: "WARNING",
        blocking: false,
        count: handoffSources.length,
        items: handoffSources.slice(0, 30).map((source) => {
          const employee = employeeById.get(source.employeeId);
          return {
            employeeId: source.employeeId,
            employeeCode: employee?.employeeCode ?? null,
            employeeName: employee ? getEmployeeName(employee) : null,
            departmentName: employee ? getDepartmentName(employee) : null,
            detail: `${source.label} · ${formatDateOnly(source.referenceDate)} · ยังไม่ได้ส่งเข้า Payroll`,
            amount: null,
          };
        }),
        recommendation:
          "ไปที่หน้า HR Review แล้วกดตรวจสอบและส่งเข้า Payroll ให้ครบก่อนอนุมัติรอบการจ่าย",
      });
    } else {
      pushCheck({
        code: "HR_REVIEW_HANDOFF_READY",
        title: "ใบลา/OT ที่อนุมัติแล้วถูกส่งเข้า Payroll ครบ",
        description:
          "ไม่พบใบลาหรือคำขอ OT ที่อนุมัติแล้วแต่ค้างอยู่ที่หน้า HR Review",
        status: "PASS",
      });
    }

    const draftAdjustmentsRaw = scopedEmployeeIds.length
      ? await (this.prisma as any).payrollAdjustment.findMany({
          where: {
            companyId: run.companyId,
            employeeId: { in: scopedEmployeeIds },
            deletedAt: null,
            status: "DRAFT",
            OR: [
              { periodId: run.periodId },
              {
                periodId: null,
                effectiveDate: { gte: periodStartForQuery, lte: periodEndForQuery },
              },
            ],
          },
          orderBy: [{ effectiveDate: "asc" }],
        })
      : [];

    const draftAdjustments = draftAdjustmentsRaw.map((adjustment: any) => ({
      ...adjustment,
      employee: employeeById.get(adjustment.employeeId) ?? null,
    }));

    if (draftAdjustments.length > 0) {
      pushCheck({
        code: "PAYROLL_ADJUSTMENTS_APPROVED_OR_CANCELLED",
        title: "มี Payroll Adjustment ที่ยังเป็น Draft",
        description:
          "Adjustment ในงวดต้องเป็น APPROVED หรือ CANCELLED ก่อนคำนวณ Payroll",
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: draftAdjustments.length,
        items: draftAdjustments.slice(0, 30).map((adjustment: any) => ({
          employeeId: adjustment.employeeId,
          employeeCode: adjustment.employee?.employeeCode ?? "-",
          employeeName: getEmployeeName(adjustment.employee),
          departmentName: getDepartmentName(adjustment.employee),
          detail: `${adjustment.code} · ${adjustment.name} ยังเป็น DRAFT`,
          amount:
            adjustment.amount == null ? null : toMoneyString(adjustment.amount),
        })),
        recommendation: "อนุมัติหรือยกเลิก Payroll Adjustment ให้ครบก่อนคำนวณ",
      });
    } else {
      pushCheck({
        code: "PAYROLL_ADJUSTMENTS_APPROVED_OR_CANCELLED",
        title: "Payroll Adjustment ไม่มี Draft ค้างในงวด",
        description: "รายการปรับเงินเดือนที่เกี่ยวข้องพร้อมสำหรับคำนวณแล้ว",
        status: "PASS",
      });
    }

    const importantComponentCodes = DEFAULT_PAYROLL_COMPONENT_CODES;
    const activeComponents = await (
      this.prisma as any
    ).payrollComponent.findMany({
      where: {
        companyId: run.companyId,
        code: { in: importantComponentCodes },
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { code: true },
    });
    const activeComponentCodes = new Set(
      activeComponents.map((component: any) => component.code),
    );
    const missingComponentCodes = importantComponentCodes.filter(
      (code) => !activeComponentCodes.has(code),
    );

    if (missingComponentCodes.length > 0) {
      pushCheck({
        code: "PAYROLL_COMPONENT_MAPPING_READY",
        title: "Payroll Component มาตรฐานยังไม่ครบ",
        description: `ยังไม่มี component active สำหรับ ${missingComponentCodes.join(", ")} ระบบยังคำนวณต่อได้ แต่ payroll line, รายงาน, สลิป หรือ line audit อาจ map componentId ไม่ครบ`,
        status: "WARN",
        severity: "WARNING",
        blocking: false,
        count: missingComponentCodes.length,
        recommendation:
          "ให้ระบบสร้าง/restore Payroll Component มาตรฐานก่อนคำนวณ หรือเพิ่ม Payroll Component ให้ครบก่อนปิดงวดและ publish สลิป",
      });
    } else {
      pushCheck({
        code: "PAYROLL_COMPONENT_MAPPING_READY",
        title: "Payroll Component มาตรฐานพร้อมใช้งาน",
        description:
          "พบ component มาตรฐานที่ใช้ map รายได้เงินเดือน รายการหัก ค่า OT ข้อมูลประกอบ ภาษี และประกันสังคมแล้ว",
        status: "PASS",
      });
    }

    const otherActiveRuns = await (this.prisma as any).payrollRun.findMany({
      where: {
        id: { not: run.id },
        companyId: run.companyId,
        periodId: run.periodId,
        deletedAt: null,
        status: {
          in: ["CALCULATING", "CALCULATED", "REVIEWED", "APPROVED", "PAID"],
        },
      },
      select: {
        id: true,
        runNo: true,
        name: true,
        status: true,
      },
      take: 10,
    });

    if (otherActiveRuns.length > 0) {
      pushCheck({
        code: "NO_OTHER_ACTIVE_RUN_IN_PERIOD",
        title: "มี Payroll Run อื่นที่ active ในงวดเดียวกัน",
        description:
          "ควรตรวจสอบเพื่อป้องกันการคำนวณซ้ำหรือจ่ายซ้ำในงวดเดียวกัน",
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: otherActiveRuns.length,
        items: otherActiveRuns.map((otherRun: any) => ({
          detail: `${otherRun.runNo}${otherRun.name ? ` · ${otherRun.name}` : ""} · ${otherRun.status}`,
          amount: null,
        })),
        recommendation:
          "ใช้ Run เดิมต่อ หรือยกเลิก Run ที่ไม่ใช้งานก่อนสร้าง/คำนวณ Run ใหม่",
      });
    } else {
      pushCheck({
        code: "NO_OTHER_ACTIVE_RUN_IN_PERIOD",
        title: "ไม่พบ Payroll Run active ซ้ำในงวดเดียวกัน",
        description: "พร้อมคำนวณ Run นี้ต่อได้",
        status: "PASS",
      });
    }

    const criticalCount = checks.filter(
      (check) => check.status === "FAIL" && check.severity === "CRITICAL",
    ).length;
    const warningCount = checks.filter(
      (check) => check.status === "WARN",
    ).length;
    const infoCount = checks.filter((check) => check.status === "INFO").length;
    const blockingCount = checks.filter((check) => check.blocking).length;
    const readyDailySummaryCount = dailySummaries.filter((summary: any) =>
      ["SENT_TO_PAYROLL", "LOCKED"].includes(
        summary.reviewStatus,
      ),
    ).length;
    const lockedDailySummaryCount = dailySummaries.filter(
      (summary: any) => summary.reviewStatus === "LOCKED",
    ).length;
    const attendanceDeductionAmount = dailySummaries.reduce(
      (sum: number, summary: any) =>
        sum + moneyToNumber(summary.totalDeductionAmount),
      0,
    );

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
        isReady: blockingCount === 0,
        employeeCount: employees.length,
        periodDayCount,
        dailySummaryCount: dailySummaries.length,
        readyDailySummaryCount,
        lockedDailySummaryCount,
        attendanceDeductionAmount: toMoneyString(attendanceDeductionAmount),
        criticalCount,
        warningCount,
        infoCount,
        blockingCount,
        checkedAt: new Date().toISOString(),
      },
      checks,
    };
  }

  async precheck(runId: string, employeeIds?: string[]) {
    return this.getReadiness(runId, employeeIds);
  }

  async assertReadyForCalculation(runId: string, employeeIds?: string[]) {
    const readiness = await this.getReadiness(runId, employeeIds);

    if (!readiness.summary.isReady) {
      const messages = readiness.checks
        .filter((check) => check.blocking)
        .slice(0, 5)
        .map(
          (check) => `${check.title}${check.count ? ` (${check.count})` : ""}`,
        )
        .join(", ");

      throw new BadRequestException(
        `ยังคำนวณ Payroll ไม่ได้ กรุณาแก้ไข Readiness ก่อน: ${messages}`,
      );
    }

    return readiness;
  }

  async dryRun(runId: string, employeeIds?: string[]) {
    const readiness = await this.getReadiness(runId, employeeIds);
    const scope = await this.getRunScope(runId, employeeIds);
    const { run, employees, employeeIds: scopedEmployeeIds } = scope;

    const periodRange = buildPayrollDateRange(
      run.period.startDate,
      run.period.endDate,
    );
    const latestCompensationByEmployeeId = await this.getLatestCompensationMap({
      companyId: run.companyId,
      periodStartDate: periodRange.startUtc,
      periodEndDate: periodRange.endUtc,
      employeeIds: scopedEmployeeIds,
    });
    const futureCompensationByEmployeeId =
      await this.getNearestFutureCompensationMap({
        companyId: run.companyId,
        periodEndDate: periodRange.endUtc,
        employeeIds: scopedEmployeeIds,
      });

    let baseSalaryAmount = 0;
    let allowanceAmount = 0;
    let recurringEarnings = 0;
    let recurringDeductions = 0;
    let adjustmentEarnings = 0;
    let adjustmentDeductions = 0;
    let employeeWithCompensationCount = 0;
    const sampleEmployees: Array<{
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      baseSalary: string;
      allowanceAmount: string;
      recurringEarnings: string;
      recurringDeductions: string;
      adjustmentEarnings: string;
      adjustmentDeductions: string;
      estimatedDeduction: string;
      estimatedNetPay: string;
    }> = [];

    const attendanceRows = scopedEmployeeIds.length
      ? await (this.prisma as any).attendanceDailySummary.groupBy({
          by: ["employeeId"],
          where: {
            employeeId: { in: scopedEmployeeIds },
            workDate: { gte: periodRange.startUtc, lte: periodRange.endUtc },
            reviewStatus: {
              in: ["SENT_TO_PAYROLL", "LOCKED"],
            },
          },
          _sum: {
            totalDeductionAmount: true,
          },
        })
      : [];
    const attendanceDeductionByEmployeeId = new Map<string, number>();
    for (const row of attendanceRows) {
      attendanceDeductionByEmployeeId.set(
        row.employeeId,
        moneyToNumber(row._sum.totalDeductionAmount),
      );
    }

    for (const employee of employees) {
      const compensation = latestCompensationByEmployeeId.get(employee.id);
      const futureCompensation = futureCompensationByEmployeeId.get(
        employee.id,
      );

      /* รายวัน/รายชั่วโมงต้องเทียบเป็นรายเดือน ไม่งั้นหน้าตรวจก่อนคำนวณโชว์ยอดต่ำผิดปกติ */
      const baseSalary = compensation
        ? resolveMonthlyEquivalentWage(
            compensation.baseSalary,
            null,
            (compensation as any).salaryBasis,
          )
        : 0;
      /*
       * เบี้ยประจำย้ายไปอยู่ที่ "รายการประจำ" ทั้งหมดแล้ว
       * ยอดของมันถูกนับผ่าน recurringSummary ด้านล่างอยู่แล้ว
       */
      const allowances = 0;

      const recurringSummary = await this.payrollSourcePreviewService.collectEmployeeRecurringLines(
        this.prisma,
        {
          companyId: run.companyId,
          employeeId: employee.id,
          periodStartDate: periodRange.startUtc,
          periodEndDate: periodRange.endUtc,
        },
      );
      const adjustmentSummary = await this.payrollSourcePreviewService.collectEmployeeAdjustmentLines(
        this.prisma,
        {
          companyId: run.companyId,
          employeeId: employee.id,
          periodId: run.periodId,
          payrollRunId: run.id,
          periodStartDate: periodRange.startUtc,
          periodEndDate: periodRange.endUtc,
        },
      );

      const employeeRecurringEarnings = recurringSummary.earningLines.reduce(
        (sum, line) => sum + moneyToNumber(line.amount),
        0,
      );
      const employeeRecurringDeductions = recurringSummary.deductionLines.reduce(
        (sum, line) => sum + moneyToNumber(line.amount),
        0,
      );
      const employeeAdjustmentEarnings = adjustmentSummary.earningLines.reduce(
        (sum, line) => sum + moneyToNumber(line.amount),
        0,
      );
      const employeeAdjustmentDeductions = adjustmentSummary.deductionLines.reduce(
        (sum, line) => sum + moneyToNumber(line.amount),
        0,
      );
      const estimatedAttendanceDeduction =
        attendanceDeductionByEmployeeId.get(employee.id) ?? 0;
      const estimatedDeduction =
        estimatedAttendanceDeduction +
        employeeRecurringDeductions +
        employeeAdjustmentDeductions;
      const estimatedNetPay =
        baseSalary +
        allowances +
        employeeRecurringEarnings +
        employeeAdjustmentEarnings -
        estimatedDeduction;

      if (baseSalary > 0) employeeWithCompensationCount += 1;
      baseSalaryAmount += baseSalary;
      allowanceAmount += allowances;
      recurringEarnings += employeeRecurringEarnings;
      recurringDeductions += employeeRecurringDeductions;
      adjustmentEarnings += employeeAdjustmentEarnings;
      adjustmentDeductions += employeeAdjustmentDeductions;

      if (sampleEmployees.length < 20) {
        sampleEmployees.push({
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: getEmployeeName(employee),
          baseSalary: toMoneyString(baseSalary),
          allowanceAmount: toMoneyString(allowances),
          recurringEarnings: toMoneyString(employeeRecurringEarnings),
          recurringDeductions: toMoneyString(employeeRecurringDeductions),
          adjustmentEarnings: toMoneyString(employeeAdjustmentEarnings),
          adjustmentDeductions: toMoneyString(employeeAdjustmentDeductions),
          estimatedDeduction: toMoneyString(estimatedDeduction),
          estimatedNetPay: toMoneyString(estimatedNetPay),
          ...(compensation
            ? {}
            : futureCompensation
              ? {
                  compensationNote: `มีฐานเงินเดือน ${toMoneyString(futureCompensation.baseSalary)} แต่เริ่มใช้ ${formatDateOnly(futureCompensation.effectiveDate)}`,
                }
              : { compensationNote: "ไม่พบฐานเงินเดือนที่ใช้ได้ในงวดนี้" }),
        } as any);
      }
    }

    const attendanceDeductionAmount = Array.from(
      attendanceDeductionByEmployeeId.values(),
    ).reduce((sum, amount) => sum + amount, 0);
    const totalEarnings =
      baseSalaryAmount + allowanceAmount + recurringEarnings + adjustmentEarnings;
    const totalDeductions =
      attendanceDeductionAmount + recurringDeductions + adjustmentDeductions;
    const totalNetPay = totalEarnings - totalDeductions;

    return {
      readiness,
      estimate: {
        isDryRun: true,
        willWriteDatabase: false,
        employeeCount: employees.length,
        employeeWithCompensationCount,
        baseSalaryAmount: toMoneyString(baseSalaryAmount),
        allowanceAmount: toMoneyString(allowanceAmount),
        recurringEarnings: toMoneyString(recurringEarnings),
        recurringDeductions: toMoneyString(recurringDeductions),
        adjustmentEarnings: toMoneyString(adjustmentEarnings),
        attendanceDeductionAmount: toMoneyString(attendanceDeductionAmount),
        adjustmentDeductions: toMoneyString(adjustmentDeductions),
        totalEarnings: toMoneyString(totalEarnings),
        totalDeductions: toMoneyString(totalDeductions),
        totalNetPay: toMoneyString(totalNetPay),
        sampleEmployees,
      },
    };
  }

  private async findActiveTaxYearForPaymentDate(
    companyId: string,
    paymentDate: Date,
  ) {
    return (this.prisma as any).payrollTaxYear.findFirst({
      where: {
        companyId,
        deletedAt: null,
        status: "ACTIVE",
        startDate: { lte: paymentDate },
        endDate: { gte: paymentDate },
      },
      orderBy: [
        { isActive: "desc" },
        { startDate: "desc" },
        { taxYear: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  private async getRunScope(
    runId: string,
    employeeIds?: string[],
  ): Promise<RunScope> {
    const run = await (this.prisma as any).payrollRun.findFirst({
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
      },
    });

    if (!run) {
      throw new NotFoundException("ไม่พบ Payroll Run");
    }

    const runBranchIds: string[] = run.branchIds ?? [];

    const periodRange = buildPayrollDateRange(
      run.period.startDate,
      run.period.endDate,
    );

    const employees = await (this.prisma as any).employee.findMany({
      where: {
        companyId: run.companyId,
        deletedAt: null,
        /*
         * ต้องใช้เงื่อนไขเดียวกับตัวคำนวณ (ช่วงที่เป็นพนักงานทับกับงวด)
         * ถ้าใช้สถานะปัจจุบันอย่างเดียว คนที่ออกกลางงวดจะหายจากรายชื่อของ
         * readiness ทั้งที่ตัวคำนวณดึงเข้ามาแล้ว การตรวจก็จะเตือนผิดว่า
         * "หลุดจากการคำนวณ" และตัวเลขคนในงวดก็ไม่ตรงกับผลจริง
         */
        startDate: { lte: periodRange.endUtc },
        OR: [
          {
            employmentEndDate: null,
            status: { in: ["ACTIVE", "PROBATION"] },
          },
          { employmentEndDate: { gte: periodRange.startUtc } },
        ],
        /*
         * ขอบเขตสาขาของรอบ — ต้องตรงกับตัวคำนวณเป๊ะ
         * ถ้าไม่กรอง ตัวตรวจจะเตือนถึงคนที่ไม่ได้อยู่ในรอบนี้ด้วย
         * แล้วบล็อกการอนุมัติทั้งที่รอบนี้ไม่เกี่ยวกับเขาเลย
         * ว่าง = ไม่ใส่เงื่อนไข = ทั้งบริษัทเหมือนเดิม
         */
        ...(runBranchIds.length ? { branchId: { in: runBranchIds } } : {}),
        ...(employeeIds?.length ? { id: { in: employeeIds } } : {}),
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
        startDate: true,
        employmentEndDate: true,
        department: { select: { nameTh: true } },
        branch: { select: { nameTh: true } },
        // ใช้เทียบกับฐานค่าจ้างในบันทึกค่าตอบแทน ว่าตั้งค่าสอดคล้องกันไหม
        employeeType: { select: { code: true, nameTh: true } },
      },
      orderBy: [{ employeeCode: "asc" }],
    });

    return {
      branchIds: runBranchIds,
      run,
      employees,
      employeeIds: employees.map((employee: EmployeeLike) => employee.id),
    };
  }

  private async getLatestCompensationMap(params: {
    companyId: string;
    periodStartDate: Date;
    periodEndDate: Date;
    employeeIds: string[];
  }) {
    const compensations = params.employeeIds.length
      ? await (this.prisma as any).employeeCompensation.findMany({
          where: {
            companyId: params.companyId,
            employeeId: { in: params.employeeIds },
            status: "ACTIVE",
            deletedAt: null,
            effectiveDate: { lte: params.periodEndDate },
            OR: [{ endDate: null }, { endDate: { gte: params.periodStartDate } }],
          },
          orderBy: [{ employeeId: "asc" }, { effectiveDate: "desc" }],
        })
      : [];

    const latestByEmployeeId = new Map<string, any>();
    for (const compensation of compensations) {
      if (!latestByEmployeeId.has(compensation.employeeId)) {
        latestByEmployeeId.set(compensation.employeeId, compensation);
      }
    }

    return latestByEmployeeId;
  }

  private async getNearestFutureCompensationMap(params: {
    companyId: string;
    periodEndDate: Date;
    employeeIds: string[];
  }) {
    const compensations = params.employeeIds.length
      ? await (this.prisma as any).employeeCompensation.findMany({
          where: {
            companyId: params.companyId,
            employeeId: { in: params.employeeIds },
            status: "ACTIVE",
            deletedAt: null,
            effectiveDate: { gt: params.periodEndDate },
            baseSalary: { gt: 0 },
          },
          orderBy: [{ employeeId: "asc" }, { effectiveDate: "asc" }],
        })
      : [];

    const futureByEmployeeId = new Map<string, any>();
    for (const compensation of compensations) {
      if (!futureByEmployeeId.has(compensation.employeeId)) {
        futureByEmployeeId.set(compensation.employeeId, compensation);
      }
    }

    return futureByEmployeeId;
  }

  /**
   * ใบลา/OT ที่อนุมัติแล้วในงวด แต่ยังไม่มี HrReviewItem ที่พร้อมเข้า Payroll
   *
   * เงื่อนไขต้องตรงกับ payroll-handoff-import.findEligibleReviewItems
   * ไม่งั้นด่านตรวจจะบอกว่าพร้อม ทั้งที่ตอนคำนวณจริงยังหยิบไปใช้ไม่ได้
   */
  private async findApprovedSourcesMissingHandoff(params: {
    companyId: string;
    employeeIds: string[];
    periodId: string;
    payrollRunId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<
    Array<{
      employeeId: string;
      sourceType: "LEAVE" | "OVERTIME";
      sourceId: string;
      label: string;
      referenceDate: Date;
    }>
  > {
    const prisma = this.prisma as any;

    const [leaves, overtimes, readyItems] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: params.employeeIds },
          deletedAt: null,
          status: "APPROVED",
          startDate: { lte: params.periodEnd },
          endDate: { gte: params.periodStart },
        },
        select: {
          id: true,
          employeeId: true,
          startDate: true,
          requestNo: true,
          leaveType: { select: { nameTh: true, code: true } },
        },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          employeeId: { in: params.employeeIds },
          deletedAt: null,
          status: "APPROVED",
          workDate: { gte: params.periodStart, lte: params.periodEnd },
        },
        select: { id: true, employeeId: true, workDate: true, requestNo: true },
      }),
      prisma.hrReviewItem.findMany({
        where: {
          companyId: params.companyId,
          employeeId: { in: params.employeeIds },
          OR: [
            {
              status: "PAYROLL_READY",
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
            { status: "SENT_TO_PAYROLL", payrollRunId: params.payrollRunId },
          ],
        },
        select: { sourceType: true, sourceId: true },
      }),
    ]);

    const ready = new Set(
      readyItems.map((item: any) => `${item.sourceType}:${item.sourceId}`),
    );

    const missing: Array<{
      employeeId: string;
      sourceType: "LEAVE" | "OVERTIME";
      sourceId: string;
      label: string;
      referenceDate: Date;
    }> = [];

    for (const leave of leaves) {
      if (ready.has(`LEAVE:${leave.id}`)) continue;
      missing.push({
        employeeId: leave.employeeId,
        sourceType: "LEAVE",
        sourceId: leave.id,
        label: `ใบลา ${leave.leaveType?.nameTh ?? leave.leaveType?.code ?? ""} ${leave.requestNo ?? ""}`.trim(),
        referenceDate: leave.startDate,
      });
    }

    for (const overtime of overtimes) {
      if (ready.has(`OVERTIME:${overtime.id}`)) continue;
      missing.push({
        employeeId: overtime.employeeId,
        sourceType: "OVERTIME",
        sourceId: overtime.id,
        label: `คำขอ OT ${overtime.requestNo ?? ""}`.trim(),
        referenceDate: overtime.workDate,
      });
    }

    return missing;
  }

  private pushPendingRequestCheck(
    pushCheck: (params: {
      code: string;
      title: string;
      description: string;
      status?: ReadinessStatus;
      severity?: ReadinessSeverity;
      blocking?: boolean;
      count?: number;
      recommendation?: string | null;
      items?: ReadinessIssueItem[];
    }) => void,
    params: {
      code: string;
      title: string;
      description: string;
      requests: any[];
      dateField: string;
      typeLabel: (request: any) => string;
      itemDetail?: (request: any) => string;
      recommendation: string;
    },
  ) {
    if (params.requests.length > 0) {
      pushCheck({
        code: params.code,
        title: params.title,
        description: params.description,
        status: "FAIL",
        severity: "CRITICAL",
        blocking: true,
        count: params.requests.length,
        items: params.requests.slice(0, 30).map((request: any) => ({
          employeeId: request.employeeId,
          employeeCode: request.employee?.employeeCode ?? "-",
          employeeName: getEmployeeName(request.employee),
          departmentName: getDepartmentName(request.employee),
          detail:
            params.itemDetail?.(request) ??
            `${formatDateOnly(request[params.dateField])} · ${params.typeLabel(request)}`,
          amount: null,
        })),
        recommendation: params.recommendation,
      });
      return;
    }

    pushCheck({
      code: params.code,
      title: params.title.replace("มี", "ไม่พบ"),
      description: "ไม่พบรายการค้างในช่วงงวดนี้",
      status: "PASS",
    });
  }
}
