"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Loader2,
  LockKeyhole,
  Users,
  Wallet,
  X,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import {
  getAttendanceWorkflowChangedAt,
  subscribeAttendanceWorkflowChanged,
} from "@/lib/attendance-workflow-events";
import {
  applyAttendanceTenantScope,
  filterBranchesForAttendanceScope,
  filterCompaniesForAttendanceScope,
  filterOrgUnitsForAttendanceScope,
} from "@/lib/attendance-tenant-scope";
import {
  apiFetchWithMeta,
  cancelAttendanceDailySummaryReviewed,
  getPublicFileUrl,
  getAttendanceMonthlyReview,
  getAttendanceMonthlyReviewDetail,
  cancelAttendanceRecalculation,
  getAttendanceRecalculationProgress,
  getCompanyPayrollSetting,
  getPayrollPeriods,
  lockAttendanceMonthlyReview,
  lockAttendanceMonthlyReviewByPeriod,
  markAttendanceDailySummaryReviewed,
  markAttendanceMonthlyReviewReadyForPayroll,
  markAttendanceMonthlyReviewReadyForPayrollByPeriod,
  recalculateAttendanceDailySummaries,
} from "@/lib/api";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/feedback-state";
import {
  Avatar,
  Button,
  IconButton,
  Modal,
  Notice,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  useStickyGroupTop,
} from "@/components/kit";
import { AttendanceRecalculationProgressModal } from "@/components/common/attendance-recalculation-progress";
import {
  MissingLogPenaltyWaiverControl,
  hasMissingLogPenaltyDecision,
} from "@/components/common/missing-log-penalty-waiver";
import {
  PunchChannelIcon,
  PunchChannelLegend,
  type PunchChannelInfo,
} from "@/components/common/punch-channel-icon";
import {
  AttendanceGroupHeading,
  attendanceGroupHeadingCellClass,
} from "@/components/common/attendance-group-heading";
import {
  attendanceBranchGroupKey,
  attendanceBranchSortText,
  attendanceDepartmentGroupKey,
  attendanceDepartmentSortText,
  buildAttendanceDepartmentGroupRank,
  getAttendanceSessionGroupRank,
} from "@/lib/attendance-session-group";
import { compareEmployeeSeniority } from "@/lib/employee-seniority";
import {
  buildCurrentPayrollPeriodRange,
  buildPayrollPeriodRangeForMonth,
  buildPayrollPolicyLabel,
  DEFAULT_PAYROLL_CUTOFF_POLICY,
  shiftPayrollPeriodRange,
  toDateInputKey,
  type PayrollCutoffPolicy,
} from "@/lib/payroll-period-range";
import type {
  AttendanceDailySummary,
  AttendanceRecalculationProgressResponse,
  AttendanceMonthlyReviewDetailResponse,
  AttendanceMonthlyReviewIssue,
  AttendanceMonthlyReviewItem,
  AttendanceMonthlyReviewListSummary,
} from "@/types/attendance";
import type { PayrollPeriod } from "@/types/payroll";
import type { CompanyPayrollSetting } from "@/types/system-settings";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

const PAGE_SIZE = 100;

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0";

const WORKFLOW_REFRESH_DELAY_MS = 250;
const EMPTY_MONTHLY_REVIEW_SUMMARY: AttendanceMonthlyReviewListSummary = {
  total: 0,
  readyForPayroll: 0,
  needReview: 0,
  locked: 0,
  sentToPayroll: 0,
  reviewed: 0,
  missingSummaryCount: 0,
  needReviewDayCount: 0,
  missingLogCount: 0,
  absentDayCount: 0,
  lateDayCount: 0,
  unpaidLeaveDayCount: 0,
  totalLateMinutes: 0,
  approvedOtMinutes: 0,
  payableOtMinutes: 0,
  approvedOvertimeAmountPreview: 0,
  latePenaltyAmount: 0,
  missingLogPenaltyAmount: 0,
  absentDeductionAmount: 0,
  unpaidLeaveDeductionAmount: 0,
  earlyCheckoutDayCount: 0,
  earlyCheckoutMinutes: 0,
  earlyCheckoutPenaltyAmount: 0,
  totalDeductionAmount: 0,
};

type FilterState = {
  search: string;
  companyId: string;
  branchId: string;
  departmentId: string;
  dateFrom: string;
  dateTo: string;
  issue: AttendanceMonthlyReviewIssue | "";
};

type OrgOption = {
  id: string;
  code?: string | null;
  nameTh: string;
  nameEn?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
};

type PageMetaState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const EMPTY_PAGE_META: PageMetaState = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type MonthlyIssueOption = {
  value: AttendanceMonthlyReviewIssue | "";
  label: string;
  hint: string;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function createAttendanceProgressId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

const monthlyIssueOptions: MonthlyIssueOption[] = [
  { value: "", label: "ทั้งหมด", hint: "ทุกสถานะ" },
  { value: "ALERTS", label: "ต้องจัดการ", hint: "มีประเด็นรวม" },
  { value: "NEED_REVIEW", label: "ต้องตรวจสอบ", hint: "HR Review" },
  { value: "NORMAL_READY", label: "พร้อมส่ง", hint: "Ready" },
  { value: "MISSING_LOG", label: "ลงเวลาไม่ครบ", hint: "Missing" },
  { value: "ABSENT", label: "ขาดงาน", hint: "Absent" },
  { value: "LATE", label: "มาสายเกิน 1 ชม.", hint: "> 60 นาที" },
  { value: "EARLY_CHECKOUT", label: "ออกก่อนเวลา", hint: "Early" },
  { value: "LEAVE", label: "มีใบลา", hint: "Leave" },
  { value: "UNPAID_LEAVE", label: "ลาไม่รับค่าจ้าง", hint: "Unpaid" },
  { value: "OFFSITE", label: "นอกสถานที่", hint: "Offsite" },
  { value: "PENALTY", label: "มียอดหัก", hint: "Penalty" },
  { value: "READY_FOR_PAYROLL", label: "พร้อมล็อก", hint: "Ready" },
  { value: "LOCKED", label: "ล็อกแล้ว", hint: "Locked" },
];

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : 0;
}

function numberText(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("th-TH");
}

function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatThaiDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function todayDateInput() {
  return formatDateInputValue(new Date());
}

function minDateInput(left: string, right: string) {
  if (!left) return right;
  if (!right) return left;
  return left <= right ? left : right;
}

function countDateInputDaysInclusive(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return 0;
  const start = parseDateInputValue(dateFrom);
  const end = parseDateInputValue(dateTo);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000) + 1;
}

function normalizeFilterRange(filters: FilterState): FilterState {
  if (
    !filters.dateFrom ||
    !filters.dateTo ||
    filters.dateFrom <= filters.dateTo
  )
    return filters;
  return { ...filters, dateFrom: filters.dateTo, dateTo: filters.dateFrom };
}

function filterStateKey(filters: FilterState) {
  return [
    filters.search.trim(),
    filters.companyId,
    filters.branchId,
    filters.departmentId,
    filters.dateFrom,
    filters.dateTo,
    filters.issue,
  ].join("|");
}

function periodToFilterRange(period: PayrollPeriod) {
  return {
    dateFrom: toDateInputKey(period.startDate),
    dateTo: toDateInputKey(period.endDate),
  };
}

function sortPeriodsByStartDate(items: PayrollPeriod[]) {
  return [...items].sort((a, b) =>
    toDateInputKey(a.startDate).localeCompare(toDateInputKey(b.startDate)),
  );
}

function resolveCurrentReviewRange(
  periods: PayrollPeriod[],
  policy: PayrollCutoffPolicy,
) {
  const today = todayDateInput();
  const activePeriods = sortPeriodsByStartDate(
    periods.filter((period) => period.status !== "CANCELLED"),
  );
  const period = activePeriods.find((item) => {
    const start = toDateInputKey(item.startDate);
    const end = toDateInputKey(item.endDate);
    return start <= today && today <= end;
  });

  return period
    ? periodToFilterRange(period)
    : buildCurrentPayrollPeriodRange(policy);
}

function resolveShiftedReviewRange(
  periods: PayrollPeriod[],
  dateFrom: string,
  offset: number,
  policy: PayrollCutoffPolicy,
) {
  const activePeriods = sortPeriodsByStartDate(
    periods.filter((period) => period.status !== "CANCELLED"),
  );
  const currentIndex = activePeriods.findIndex(
    (period) => toDateInputKey(period.startDate) === dateFrom,
  );
  const targetPeriod =
    currentIndex >= 0 ? activePeriods[currentIndex + offset] : undefined;

  return targetPeriod
    ? periodToFilterRange(targetPeriod)
    : shiftPayrollPeriodRange(dateFrom, offset, policy);
}

function payrollPolicyFromCompanySetting(
  setting?: CompanyPayrollSetting | null,
): PayrollCutoffPolicy {
  return {
    payrollPeriodStartDay:
      setting?.payrollPeriodStartDay ??
      DEFAULT_PAYROLL_CUTOFF_POLICY.payrollPeriodStartDay,
    payrollCutoffDay:
      setting?.payrollCutoffDay ??
      DEFAULT_PAYROLL_CUTOFF_POLICY.payrollCutoffDay,
  };
}

function payrollSettingSourceLabel(setting?: CompanyPayrollSetting | null) {
  if (!setting) return "เลือกบริษัทเพื่อใช้รอบเงินเดือนตามบริษัท";
  return setting.source === "COMPANY"
    ? "ใช้ค่ารอบเงินเดือนของบริษัทนี้"
    : "ใช้ค่าเริ่มต้นกลางของระบบ";
}

/**
 * ช่วงวันที่ของหน้านี้มาได้ 2 ทาง: งวดเงินเดือนที่มีอยู่จริง (ชนะเสมอ เพราะต้องตรวจ
 * ให้ตรงกับงวดที่จะจ่าย) หรือคำนวณจากนโยบายวันตัดรอบ ถ้าทั้งสองไม่ตรงกันต้องบอกผู้ใช้
 * ไม่งั้นจะเห็นวันที่ชุดหนึ่งแต่ป้ายบอกนโยบายอีกชุดหนึ่ง
 */
function resolveRangeSource(
  periods: PayrollPeriod[],
  dateFrom: string,
  dateTo: string,
  policy: PayrollCutoffPolicy,
) {
  const period =
    periods.find(
      (item) =>
        item.status !== "CANCELLED" &&
        toDateInputKey(item.startDate) === dateFrom &&
        toDateInputKey(item.endDate) === dateTo,
    ) ?? null;

  if (!period) return { period: null, policyRange: null, matchesPolicy: true };

  const policyRange = buildPayrollPeriodRangeForMonth(
    period.year,
    period.month,
    policy,
  );

  return {
    period,
    policyRange,
    matchesPolicy:
      policyRange.dateFrom === dateFrom && policyRange.dateTo === dateTo,
  };
}

const THAI_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** คีย์ของช่วงวันที่ ใช้เทียบว่างวดไหนตรงกับที่เลือกอยู่ */
function rangeKey(dateFrom: string, dateTo: string) {
  return `${dateFrom}|${dateTo}`;
}

type PeriodOption = {
  key: string;
  label: string;
  dateFrom: string;
  dateTo: string;
};

/**
 * รายการงวดให้เลือกจากดรอปดาวน์
 * ============================
 * เอาเฉพาะงวดเงินเดือนที่เปิดไว้จริง — การตรวจก่อนเข้าเงินเดือนต้องอิงงวดที่จะจ่ายจริง
 * ไม่ใช่ช่วงวันที่ลอย ๆ ที่คำนวณจากนโยบายวันตัดรอบ
 *
 * ยกเว้นงวดปัจจุบัน ถ้ายังไม่ได้เปิดจะเติมให้หนึ่งรายการพร้อมป้ายบอกว่ายังไม่เปิด
 * เพราะช่วงที่หน้านี้เปิดมาให้ตอนแรกคือช่วงนั้น ถ้าไม่มีในลิสต์ดรอปดาวน์จะว่าง
 * ทั้งที่ตารางมีข้อมูลอยู่
 */
function buildPeriodOptions(
  periods: PayrollPeriod[],
  policy: PayrollCutoffPolicy,
): PeriodOption[] {
  const options = sortPeriodsByStartDate(
    periods.filter((period) => period.status !== "CANCELLED"),
  )
    .reverse()
    .map((period) => {
      const dateFrom = toDateInputKey(period.startDate);
      const dateTo = toDateInputKey(period.endDate);

      return {
        key: rangeKey(dateFrom, dateTo),
        /*
         * ไม่เอารหัสงวดมาต่อท้าย — PAY-2569-07 บอกว่าเป็นงวด ก.ค. 2569
         * ซึ่งซ้ำกับชื่อเดือนที่อยู่หน้าสุดแล้ว ยาวขึ้นครึ่งบรรทัดโดยไม่ได้ข้อมูลเพิ่ม
         */
        label: periodOptionLabel(period.year, period.month, dateFrom, dateTo),
        dateFrom,
        dateTo,
      };
    });

  const current = buildCurrentPayrollPeriodRange(policy);
  const currentKey = rangeKey(current.dateFrom, current.dateTo);

  if (!options.some((option) => option.key === currentKey)) {
    options.unshift({
      key: currentKey,
      label: `${periodOptionLabel(
        current.payrollYear,
        current.payrollMonth,
        current.dateFrom,
        current.dateTo,
      )} · ยังไม่เปิดงวด`,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
    });
  }

  return options;
}

function periodOptionLabel(
  year: number,
  month: number,
  dateFrom: string,
  dateTo: string,
) {
  const monthName = THAI_MONTH_SHORT[month - 1] ?? String(month);
  const short = (value: string) => value.slice(8, 10) + "/" + value.slice(5, 7);

  return `${monthName} ${year + 543} · ${short(dateFrom)} – ${short(dateTo)}`;
}

function filterPeriodsByCompany(periods: PayrollPeriod[], companyId?: string) {
  if (!companyId) return periods;
  return periods.filter((period) => period.companyId === companyId);
}

function employeeName(
  item: AttendanceMonthlyReviewItem | AttendanceMonthlyReviewDetailResponse,
) {
  const employee = item.employee;
  return (
    employee.displayName ||
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ") ||
    employee.employeeCode
  );
}

function employeeDepartmentPosition(
  employee: AttendanceMonthlyReviewItem["employee"],
) {
  return [employee.department?.nameTh, employee.position]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" • ");
}

function employeeCompanyBranch(
  employee: AttendanceMonthlyReviewItem["employee"],
) {
  return [employee.company?.nameTh, employee.branch?.nameTh]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" • ");
}

function statusInlineTextClass(status: string) {
  if (status === "READY_FOR_PAYROLL") return "text-blue-700";
  if (status === "LOCKED" || status === "SENT_TO_PAYROLL")
    return "text-slate-700";
  if (status === "REVIEWED") return "text-emerald-700";
  if (status === "NEED_REVIEW" || status === "DATA_INCOMPLETE")
    return "text-amber-700";
  return "text-slate-600";
}

function statusInlineDotClass(status: string) {
  if (status === "READY_FOR_PAYROLL") return "bg-blue-500";
  if (status === "LOCKED" || status === "SENT_TO_PAYROLL")
    return "bg-slate-500";
  if (status === "REVIEWED") return "bg-emerald-500";
  if (status === "NEED_REVIEW" || status === "DATA_INCOMPLETE")
    return "bg-amber-500";
  return "bg-slate-400";
}

const statusLabels: Record<string, string> = {
  DATA_INCOMPLETE: "ข้อมูลยังไม่ครบ",
  CALCULATED: "ปกติ",
  NEED_REVIEW: "ต้องตรวจสอบ",
  REVIEWED: "ตรวจสอบแล้ว",
  READY_FOR_PAYROLL: "พร้อมล็อก",
  SENT_TO_PAYROLL: "ส่งเข้า Payroll แล้ว",
  LOCKED: "ล็อกแล้ว",
};

function minutesToHoursText(minutes: number | null | undefined) {
  const value = Number(minutes || 0);
  if (!value) return "-";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours && mins) return `${hours} ชม. ${mins} นาที`;
  if (hours) return `${hours} ชม.`;
  return `${mins} นาที`;
}

function earlyCheckoutDaysOnlyText(
  dayCount?: string | number | null,
  minutes?: string | number | null,
) {
  const days = toNumber(dayCount);
  if (days > 0) return `${numberText(days)} วัน`;
  return toNumber(minutes) > 0 ? "1 วัน" : "-";
}

function earlyCheckoutDurationText(
  dayCount?: string | number | null,
  minutes?: string | number | null,
) {
  const minuteValue = toNumber(minutes);
  if (minuteValue > 0) return minutesToHoursText(minuteValue);
  const days = toNumber(dayCount);
  if (days > 0) return `${numberText(days)} วัน`;
  return "-";
}

type OvertimePreviewSource = {
  payableOtMinutes?: number | null;
  approvedOtMinutes?: number | null;
  approvedOvertimeHours?: number | string | null;
  approvedOvertimeAmountPreview?: string | number | null;
  approvedOvertimeWorkdayAmountPreview?: string | number | null;
  approvedOvertimeHolidayAmountPreview?: string | number | null;
  approvedOvertimeSpecialHolidayAmountPreview?: string | number | null;
};

function getApprovedOvertimeMinutes(item: OvertimePreviewSource) {
  const previewMinutes = Math.round(toNumber(item.approvedOvertimeHours) * 60);
  return Math.max(
    toNumber(item.payableOtMinutes),
    toNumber(item.approvedOtMinutes),
    previewMinutes,
  );
}

function getApprovedOvertimeAmount(item: OvertimePreviewSource) {
  return Math.max(
    toNumber(item.approvedOvertimeAmountPreview),
    toNumber(item.approvedOvertimeWorkdayAmountPreview) +
      toNumber(item.approvedOvertimeHolidayAmountPreview) +
      toNumber(item.approvedOvertimeSpecialHolidayAmountPreview),
  );
}

type PayrollBreakdownRow = {
  label: string;
  value?: string;
  amount: number;
};

function buildMonthlyPayrollBreakdown(item: AttendanceMonthlyReviewItem) {
  const incomeRows: PayrollBreakdownRow[] = [
    {
      label: "OT วันทำงาน",
      value: minutesToHoursText(
        Math.round(toNumber(item.approvedOvertimeWorkdayHours) * 60),
      ),
      amount: toNumber(item.approvedOvertimeWorkdayAmountPreview),
    },
    {
      label: "OT วันหยุด",
      value: minutesToHoursText(
        Math.round(toNumber(item.approvedOvertimeHolidayHours) * 60),
      ),
      amount: toNumber(item.approvedOvertimeHolidayAmountPreview),
    },
    {
      label: "OT วันหยุดพิเศษ",
      value: minutesToHoursText(
        Math.round(toNumber(item.approvedOvertimeSpecialHolidayHours) * 60),
      ),
      amount: toNumber(item.approvedOvertimeSpecialHolidayAmountPreview),
    },
  ].filter((row) => row.amount > 0 || (row.value && row.value !== "-"));

  if (!incomeRows.length && getApprovedOvertimeAmount(item) > 0) {
    incomeRows.push({
      label: "OT ที่อนุมัติแล้ว",
      value: minutesToHoursText(getApprovedOvertimeMinutes(item)),
      amount: getApprovedOvertimeAmount(item),
    });
  }

  const deductionRows: PayrollBreakdownRow[] = [
    {
      label: "หักมาสาย",
      value: minutesToHoursText(item.totalLateMinutes),
      amount: toNumber(item.latePenaltyAmount),
    },
    {
      label: "หักลงเวลาไม่ครบ",
      value: `${item.missingLogCount || 0} วัน`,
      amount: toNumber(item.missingLogPenaltyAmount),
    },
    {
      label: "หักขาดงาน",
      value: `${toNumber(item.absentDayCount)} วัน`,
      amount: toNumber(item.absentDeductionAmount),
    },
    {
      label: "หักลาไม่รับค่าจ้าง",
      value: minutesToHoursText(item.unpaidLeaveMinutes),
      amount: toNumber(item.unpaidLeaveDeductionAmount),
    },
    {
      label: "หักออกก่อนเวลา",
      value: minutesToHoursText(item.earlyCheckoutMinutes),
      amount: toNumber(item.earlyCheckoutPenaltyAmount),
    },
  ].filter(
    (row) =>
      row.amount > 0 ||
      (row.value && row.value !== "-" && row.value !== "0 วัน"),
  );

  const totalDeduction = toNumber(item.totalDeductionAmount);
  const summarizedDeduction = deductionRows.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const otherDeduction = Math.max(0, totalDeduction - summarizedDeduction);

  if (otherDeduction >= 0.01) {
    deductionRows.push({
      label: "รายการหักอื่น",
      amount: otherDeduction,
    });
  }

  return {
    incomeRows,
    deductionRows,
    totalIncome: getApprovedOvertimeAmount(item),
    totalDeduction,
    netImpact: getApprovedOvertimeAmount(item) - totalDeduction,
  };
}

type IssueDayDetail = {
  label: string;
  value: string;
  amount?: number;
  tone: "red" | "amber" | "blue" | "green" | "slate";
};

function getMissingLogLabels(summary: AttendanceDailySummary) {
  const missing: string[] = [];

  if (summary.isMorningMissing) missing.push("เข้าเช้า");
  if (summary.isAfternoonMissing) missing.push("เข้าบ่าย");
  if (summary.isCheckoutMissing) missing.push("ออกงาน");

  if (!missing.length && summary.hasMissingLog) missing.push("เวลาเข้า/ออก");

  return missing;
}

function getMissingLogPenaltyAmount(summary: AttendanceDailySummary) {
  // IMPORTANT: Use the actual deduction amount returned by the API only.
  // missingMorning/Afternoon/Checkout are session-level reference fields and
  // must not be added on top of missingLogPenaltyAmount, otherwise the UI will
  // show an inflated amount that does not match Payroll.
  return toNumber(summary.missingLogPenaltyAmount);
}

function isLateOverReviewThreshold(summary: AttendanceDailySummary) {
  return getAttendanceReviewReasons(summary).some(
    (reason) => reason.code === "LATE_OVER_THRESHOLD",
  );
}

function formatSevereLateValue(summary: AttendanceDailySummary) {
  const parts: string[] = [];
  if (toNumber(summary.morningLateMinutes) > 0) {
    parts.push(`เช้า ${numberText(summary.morningLateMinutes)} นาที`);
  }
  if (toNumber(summary.afternoonLateMinutes) > 0) {
    parts.push(`บ่าย ${numberText(summary.afternoonLateMinutes)} นาที`);
  }

  const totalText = `${numberText(summary.totalLateMinutes)} นาที`;
  return parts.length ? `${totalText} (${parts.join(" / ")})` : totalText;
}

function isPendingWorkflowStatus(status: string | null | undefined) {
  return [
    "SUBMITTED",
    "PENDING",
    "MANAGER_APPROVED",
    "WAITING_APPROVAL",
  ].includes(String(status || "").toUpperCase());
}

function getAttendanceReviewReasons(summary: AttendanceDailySummary) {
  const direct = Array.isArray(summary.reviewReasons)
    ? summary.reviewReasons
    : [];
  if (direct.length > 0) return direct;

  const snapshot =
    summary.policySnapshot &&
    typeof summary.policySnapshot === "object" &&
    !Array.isArray(summary.policySnapshot)
      ? (summary.policySnapshot as Record<string, unknown>)
      : {};
  const attendanceReview =
    snapshot.attendanceReview &&
    typeof snapshot.attendanceReview === "object" &&
    !Array.isArray(snapshot.attendanceReview)
      ? (snapshot.attendanceReview as Record<string, unknown>)
      : null;

  return Array.isArray(attendanceReview?.reviewReasons)
    ? attendanceReview.reviewReasons
    : [];
}

function hasBackendAttendanceReviewIssue(summary: AttendanceDailySummary) {
  if (typeof summary.hasReviewIssue === "boolean") {
    return summary.hasReviewIssue;
  }

  const snapshot =
    summary.policySnapshot &&
    typeof summary.policySnapshot === "object" &&
    !Array.isArray(summary.policySnapshot)
      ? (summary.policySnapshot as Record<string, unknown>)
      : {};
  const attendanceReview =
    snapshot.attendanceReview &&
    typeof snapshot.attendanceReview === "object" &&
    !Array.isArray(snapshot.attendanceReview)
      ? (snapshot.attendanceReview as Record<string, unknown>)
      : null;

  if (typeof attendanceReview?.hasReviewIssue === "boolean") {
    return attendanceReview.hasReviewIssue;
  }

  return (
    getAttendanceReviewReasons(summary).length > 0 ||
    (summary.reviewStatus || summary.calculationStatus) === "NEED_REVIEW"
  );
}

function requiresBackendAttendanceReview(summary: AttendanceDailySummary) {
  if (typeof summary.requiresReview === "boolean") {
    return summary.requiresReview;
  }

  return (summary.reviewStatus || summary.calculationStatus) === "NEED_REVIEW";
}

/**
 * จัดเรื่องที่ตรวจเจอเข้ากลุ่ม เพื่อกันแจ้งซ้ำ
 * ฝั่งหน้าเว็บสรุปเองรอบหนึ่ง (เช่น "ลงเวลาไม่ครบ · เข้าบ่าย / ออกงาน") ส่วน backend
 * ก็ส่งเหตุผลมาอีกชุดที่ละเอียดกว่า ("ไม่พบเวลาเข้าบ่าย", "ไม่พบเวลาออกงาน")
 * ถ้าเทียบแค่ชื่อตรง ๆ จะกันไม่อยู่ เพราะคนละคำแต่เรื่องเดียวกัน
 */
function reviewReasonTopic(text: string) {
  const value = text.trim();

  if (value.includes("ขาดงาน")) return "absent";
  if (
    value.includes("ไม่พบเวลา") ||
    value.includes("ลงเวลาไม่ครบ") ||
    value.includes("ลืมลงเวลา")
  ) {
    return "missing";
  }
  if (value.includes("มาสาย")) return "late";
  if (value.includes("ออกก่อน")) return "early";
  if (value.includes("แก้เวลา")) return "time-adjust";
  if (value.includes("นอกสถานที่")) return "offsite";
  if (value.includes("ลา")) return "leave";

  return value;
}

function buildIssueDayDetails(summary: AttendanceDailySummary) {
  const details: IssueDayDetail[] = [];
  const missingLabels = getMissingLogLabels(summary);
  const missingPenalty = getMissingLogPenaltyAmount(summary);
  const latePenalty = toNumber(summary.latePenaltyAmount);
  const earlyPenalty = toNumber(summary.earlyCheckoutPenaltyAmount);
  const unpaidPenalty = toNumber(summary.unpaidLeaveDeductionAmount);
  const absentPenalty = toNumber(summary.absentDeductionAmount);

  if (summary.isAbsent || toNumber(summary.absentDays) > 0) {
    details.push({
      label: "ขาดงาน",
      value: `${toNumber(summary.absentDays) || 1} วัน`,
      amount: absentPenalty || undefined,
      tone: "red",
    });
  } else if (missingLabels.length) {
    const penaltyWaived = Boolean(summary.missingLogPenaltyWaived);
    details.push({
      label: "ลงเวลาไม่ครบ",
      value: penaltyWaived
        ? `${missingLabels.join(" / ")} · HR ยกเว้นค่าปรับแล้ว`
        : missingLabels.join(" / "),
      amount: missingPenalty || undefined,
      tone: penaltyWaived ? "amber" : "red",
    });
  }

  /*
   * มาสายเคยแสดงเฉพาะวันที่เกินเกณฑ์ต้องตรวจสอบ (1 ชม.) ทำให้ยอดหักมาสายก้อนเล็ก
   * หายไปจากรายการทั้งที่ถูกรวมอยู่ใน "ยอดหักรวม" อ่านแล้วตัวเลขสองฝั่งไม่ตรงกัน
   * จึงแสดงทุกครั้งที่มีนาทีหรือมียอดหัก แล้วแยกด้วยชื่อว่าเกินเกณฑ์หรือไม่
   */
  const lateMinutes = toNumber(summary.totalLateMinutes);
  if (lateMinutes > 0 || latePenalty > 0) {
    details.push({
      label: isLateOverReviewThreshold(summary) ? "มาสายเกิน 1 ชม." : "มาสาย",
      value: formatSevereLateValue(summary),
      amount: latePenalty || undefined,
      tone: latePenalty > 0 ? "red" : "amber",
    });
  }

  if (toNumber(summary.earlyCheckoutMinutes) > 0 || earlyPenalty > 0) {
    details.push({
      label: "ออกก่อนเวลา",
      value: earlyCheckoutDurationText(undefined, summary.earlyCheckoutMinutes),
      amount: earlyPenalty || undefined,
      tone: earlyPenalty > 0 ? "red" : "amber",
    });
  }

  // ลาไม่รับค่าจ้างที่อนุมัติและคำนวณได้ปกติเป็นข้อมูลทางการเงิน
  // ไม่ใช่เหตุให้ต้องตรวจสอบโดยอัตโนมัติ แต่ยังแสดงรายละเอียดไว้ในหน้าต่างสรุป
  if (summary.leaveRequestId) {
    const leaveName = summary.leaveType?.nameTh || "ลาไม่รับค่าจ้าง";
    const isUnpaid =
      summary.leaveIsPaid === false ||
      toNumber(summary.unpaidLeaveMinutes) > 0 ||
      unpaidPenalty > 0;

    if (isUnpaid) {
      const durationText =
        toNumber(summary.unpaidLeaveMinutes) > 0
          ? minutesToHoursText(summary.unpaidLeaveMinutes)
          : `${summary.leaveDurationDays || "-"} วัน`;

      details.push({
        label: "ลาไม่รับค่าจ้าง",
        value: `${leaveName} • ${durationText}`,
        amount: unpaidPenalty > 0 ? unpaidPenalty : undefined,
        tone: "red",
      });
    }
  }

  /*
   * ตาข่ายกันยอดหาย — ถ้าผลรวมรายการที่แจกแจงไว้ยังไม่ครบ "ยอดหักรวม" จริง
   * ให้โชว์ส่วนต่างไว้ ดีกว่าปล่อยให้ตัวเลขสองฝั่งไม่ตรงกันโดยไม่มีใครรู้
   */
  const listedDeduction = details.reduce(
    (sum, detail) => sum + (detail.tone === "green" ? 0 : (detail.amount ?? 0)),
    0,
  );
  const undetailedDeduction =
    Math.round(
      (toNumber(summary.totalDeductionAmount) - listedDeduction) * 100,
    ) / 100;
  if (undetailedDeduction > 0.004) {
    details.push({
      label: "รายการหักอื่น",
      value: "ยังไม่ได้แยกประเภท",
      amount: undetailedDeduction,
      tone: "red",
    });
  }

  const pendingTimeAdjustCount = Math.max(
    toNumber(summary.pendingTimeAdjustRequestCount),
    (summary.timeAdjustRequests ?? []).filter(
      (request) => request.status === "SUBMITTED",
    ).length,
  );
  if (pendingTimeAdjustCount > 0) {
    details.push({
      label: "คำขอแก้เวลารออนุมัติ",
      value: `${pendingTimeAdjustCount.toLocaleString("th-TH")} รายการ`,
      tone: "amber",
    });
  }

  if (isPendingWorkflowStatus(summary.offsiteStatus)) {
    details.push({
      label: "ทำงานนอกสถานที่รออนุมัติ",
      value:
        toNumber(summary.offsiteMinutes) > 0
          ? minutesToHoursText(summary.offsiteMinutes)
          : "รออนุมัติ",
      tone: "amber",
    });
  }

  // เรื่องที่สรุปไปแล้วด้านบน ไม่ต้องให้ backend แจ้งซ้ำอีกรอบด้วยคำที่ต่างกัน
  const coveredTopics = new Set(
    details.map((detail) => reviewReasonTopic(detail.label)),
  );

  const backendReasons = getAttendanceReviewReasons(summary);
  backendReasons.forEach((reason) => {
    const topic = reviewReasonTopic(reason.label);
    if (coveredTopics.has(topic)) return;

    coveredTopics.add(topic);
    details.push({
      label: reason.label,
      value: reason.detail || "ต้องตรวจสอบ",
      tone: "amber",
    });
  });

  // รองรับข้อมูลเก่าที่ยังไม่มี reviewReasons จาก Backend เท่านั้น
  if (backendReasons.length === 0) {
    getActionableCalculationNoteParts(summary.calculationNote).forEach(
      (notePart) => {
        details.push({
          label: "หมายเหตุที่ต้องตรวจ",
          value: notePart,
          tone: "amber",
        });
      },
    );
  }

  return details;
}

function isInformationalCalculationNote(part: string) {
  const normalized = part.trim();
  if (!normalized) return true;
  if (normalized.includes("วันหยุด")) return true;

  const normalizedUpper = normalized.toUpperCase();
  const informationalNotePrefixes = [
    "ไม่มีรายการหักเงิน",
    "ไม่มีรายหัก",
    "ไม่มีการหักเงิน",
    "ไม่มีรายการหัก",
    "ไม่พบรายการหักเงิน",
    "ไม่มียอดหัก",
    "มีใบลาอนุมัติ",
    "ทำงานนอกสถานที่ที่อนุมัติแล้ว",
    "ทำงานนอกสถานที่อนุมัติแล้ว",
    "OT ที่อนุมัติแล้ว",
    "มี OT อนุมัติ",
    "มีรายการ OT อนุมัติ",
    "มาสายรวม",
    "ออกก่อนเวลา",
    "กลับช้า",
  ];

  if (
    informationalNotePrefixes.some((prefix) => normalized.startsWith(prefix))
  ) {
    return true;
  }

  const hasDeductionSignal =
    normalized.includes("ไม่ได้รับค่าจ้าง") ||
    normalized.includes("ไม่รับค่าจ้าง") ||
    normalized.includes("ยอดหัก") ||
    normalized.includes("หัก") ||
    normalized.includes("ต้องตรวจสอบ") ||
    normalized.includes("ผิดปกติ");

  const isPaidLeaveNote =
    normalized.includes("ได้รับค่าจ้าง") && !hasDeductionSignal;

  if (isPaidLeaveNote) return true;

  const isLeaveDayTypeOnlyNote =
    (normalized.startsWith("ลา:") || normalized.startsWith("ลา ")) &&
    ["HALF_DAY_MORNING", "HALF_DAY_AFTERNOON", "FULL_DAY"].some((token) =>
      normalizedUpper.includes(token),
    ) &&
    !hasDeductionSignal;

  if (isLeaveDayTypeOnlyNote) return true;

  const isLeaveInfoOnlyNote =
    normalized.includes("ลา") &&
    [
      "ครึ่งเช้า",
      "ครึ่งบ่าย",
      "เต็มวัน",
      "HALF_DAY_MORNING",
      "HALF_DAY_AFTERNOON",
      "FULL_DAY",
    ].some((token) => normalizedUpper.includes(token.toUpperCase())) &&
    !hasDeductionSignal;

  return isLeaveInfoOnlyNote;
}

function getActionableCalculationNoteParts(note: string | null | undefined) {
  if (!note) return [];

  return note
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isInformationalCalculationNote(part));
}

function hasPayrollIssueDay(summary: AttendanceDailySummary) {
  return hasBackendAttendanceReviewIssue(summary);
}

function canMarkDailySummaryReviewed(summary: AttendanceDailySummary) {
  return requiresBackendAttendanceReview(summary);
}

function canCancelDailySummaryReviewed(summary: AttendanceDailySummary) {
  const status = summary.reviewStatus || summary.calculationStatus;
  return (
    status === "REVIEWED" &&
    !summary.payrollRunId &&
    !summary.sentToPayrollAt &&
    !summary.lockedAt
  );
}

function normalizeReviewMessage(message: string) {
  return message
    .replace(/NEED_REVIEW/g, "ที่ต้องตรวจ")
    .replace(/DATA_INCOMPLETE/g, "ข้อมูลยังไม่ครบ")
    .replace(/READY_FOR_PAYROLL/g, "พร้อมล็อก")
    .replace(/SENT_TO_PAYROLL/g, "ส่งเข้า Payroll แล้ว")
    .replace(/LOCKED/g, "ล็อกแล้ว")
    .replace(/CALCULATED/g, "ปกติ")
    .replace(/REVIEWED/g, "ตรวจสอบแล้ว");
}

type MonthlyReviewPendingCountSource = AttendanceMonthlyReviewItem & {
  pendingApprovalRequestCount?: string | number | null;
  pendingLeaveRequestCount?: string | number | null;
  pendingOvertimeRequestCount?: string | number | null;
  pendingTimeAdjustRequestCount?: string | number | null;
  pendingOffsiteRequestCount?: string | number | null;
};

type PendingApprovalItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  date?: string | Date | null;
};

function formatThaiTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function attendanceLogTypeLabel(type?: string | null) {
  const map: Record<string, string> = {
    CHECK_IN: "เวลาเข้างาน",
    CHECK_OUT: "เวลาออกงาน",
    BREAK_START: "เริ่มพัก",
    BREAK_END: "กลับจากพัก",
  };

  return type ? map[type] || type : "เวลาเข้า/ออก";
}

function compactCountLabel(count: number) {
  return count.toLocaleString("th-TH");
}

function buildGenericPendingItem(
  id: string,
  type: string,
  count: number,
  detail: string,
): PendingApprovalItem | null {
  if (count <= 0) return null;
  return {
    id,
    type,
    title: `${type} ${compactCountLabel(count)} รายการ`,
    detail,
  };
}

function buildPendingApprovalItems(
  item: AttendanceMonthlyReviewItem,
  dailySummaries: AttendanceDailySummary[],
  offsiteRequests: AttendanceMonthlyReviewDetailResponse["offsiteRequests"] = [],
) {
  const pendingSource = item as MonthlyReviewPendingCountSource;
  const items: PendingApprovalItem[] = [];

  const sortedSummaries = [...dailySummaries].sort((left, right) =>
    detailDateSortKey(left.workDate).localeCompare(
      detailDateSortKey(right.workDate),
    ),
  );

  for (const summary of sortedSummaries) {
    const pendingTimeAdjusts = (summary.timeAdjustRequests ?? []).filter(
      (request) => request.status === "SUBMITTED",
    );

    pendingTimeAdjusts.forEach((request, index) => {
      const requestWorkDate = (request as { workDate?: string | Date | null })
        .workDate;
      const detailParts = [
        request.requestNo ? `เลขที่ ${request.requestNo}` : "",
        `ช่องเวลา ${attendanceLogTypeLabel(request.targetLogType)}`,
        request.originalLogTime
          ? `เวลาเดิม ${formatThaiTime(request.originalLogTime)}`
          : "",
        request.requestedLogTime
          ? `ขอแก้เป็น ${formatThaiTime(request.requestedLogTime)}`
          : "",
        request.reason ? `เหตุผล: ${request.reason}` : "",
      ].filter(Boolean);

      items.push({
        id: `time-adjust-${request.id || `${summary.id}-${index}`}`,
        type: "คำขอแก้เวลา",
        title: request.requestNo
          ? `คำขอแก้เวลา ${request.requestNo}`
          : "คำขอแก้เวลา",
        date: requestWorkDate || summary.workDate,
        detail: detailParts.join(" · ") || "รออนุมัติคำขอแก้เวลา",
      });
    });
  }

  const pendingOffsiteRequests = offsiteRequests.filter((request) =>
    ["SUBMITTED", "MANAGER_APPROVED"].includes(request.status),
  );
  pendingOffsiteRequests.forEach((request) => {
    const detailParts = [
      request.requestNo ? `เลขที่ ${request.requestNo}` : "",
      request.locationName ? `สถานที่ ${request.locationName}` : "",
      request.startTime && request.endTime
        ? `เวลา ${request.startTime} - ${request.endTime}`
        : "",
      request.reason ? `เหตุผล: ${request.reason}` : "",
      request.status === "MANAGER_APPROVED" ? "รอ HR อนุมัติ" : "รออนุมัติ",
    ].filter(Boolean);

    items.push({
      id: `offsite-${request.id}`,
      type: "คำขอทำงานนอกสถานที่",
      title: request.requestNo
        ? `ทำงานนอกสถานที่ ${request.requestNo}`
        : "คำขอทำงานนอกสถานที่",
      date: request.workDate,
      detail: detailParts.join(" · ") || "รออนุมัติคำขอทำงานนอกสถานที่",
    });
  });

  const detailedTimeAdjustCount = items.filter(
    (pending) => pending.type === "คำขอแก้เวลา",
  ).length;
  const detailedOffsiteCount = items.filter(
    (pending) => pending.type === "คำขอทำงานนอกสถานที่",
  ).length;

  const genericItems = [
    buildGenericPendingItem(
      "pending-leave",
      "คำขอลา",
      toNumber(pendingSource.pendingLeaveRequestCount),
      "มีคำขอลาในงวดนี้ที่ยังไม่ผ่านการอนุมัติ",
    ),
    buildGenericPendingItem(
      "pending-overtime",
      "คำขอ OT",
      toNumber(pendingSource.pendingOvertimeRequestCount),
      "มีคำขอ OT ในงวดนี้ที่ยังไม่ผ่านการอนุมัติ",
    ),
    buildGenericPendingItem(
      "pending-time-adjust",
      "คำขอแก้เวลา",
      Math.max(
        toNumber(pendingSource.pendingTimeAdjustRequestCount) -
          detailedTimeAdjustCount,
        0,
      ),
      "มีคำขอแก้เวลาในงวดนี้ที่ยังไม่ผ่านการอนุมัติ",
    ),
    buildGenericPendingItem(
      "pending-offsite",
      "คำขอทำงานนอกสถานที่",
      Math.max(
        toNumber(pendingSource.pendingOffsiteRequestCount) -
          detailedOffsiteCount,
        0,
      ),
      "มีคำขอทำงานนอกสถานที่ในงวดนี้ที่ยังไม่ผ่านการอนุมัติ",
    ),
  ].filter(Boolean) as PendingApprovalItem[];

  return [...items, ...genericItems];
}

type MonthlyReviewReadiness = {
  effectiveDateTo: string;
  fullPeriodDayCount: number;
  availableDayCount: number;
  displaySummaryCount: number;
  isRequestedPeriodEnded: boolean;
  hasPastMissingSummary: boolean;
  isPeriodComplete: boolean;
  isAlreadyReady: boolean;
  isLockedOrSent: boolean;
  canReady: boolean;
  canLock: boolean;
  hasBlocker: boolean;
  displayStatus: string;
  incompletePeriodMessage: string;
};

function getMonthlyReviewReadiness(
  item: AttendanceMonthlyReviewItem,
  dateFrom: string,
  dateTo: string,
): MonthlyReviewReadiness {
  const today = todayDateInput();
  const effectiveDateTo = minDateInput(dateTo, today);
  const fullPeriodDayCount =
    item.dayCount || countDateInputDaysInclusive(dateFrom, dateTo);
  const availableDayCount =
    dateFrom <= effectiveDateTo
      ? countDateInputDaysInclusive(dateFrom, effectiveDateTo)
      : 0;
  const displaySummaryCount = Math.min(
    item.summaryCount,
    availableDayCount || item.summaryCount,
  );
  const isRequestedPeriodEnded = dateTo <= today;
  const hasPastMissingSummary = toNumber(item.missingSummaryCount) > 0;
  const isPeriodComplete =
    isRequestedPeriodEnded &&
    fullPeriodDayCount > 0 &&
    item.summaryCount >= fullPeriodDayCount &&
    !hasPastMissingSummary;
  const isAlreadyReady =
    isPeriodComplete && item.status === "READY_FOR_PAYROLL";
  const isLockedOrSent =
    item.status === "LOCKED" || item.status === "SENT_TO_PAYROLL";
  const canReady =
    Boolean(item.canReadyForPayroll) &&
    !isAlreadyReady &&
    !isLockedOrSent &&
    isPeriodComplete;
  const canLock =
    isPeriodComplete && (item.status === "READY_FOR_PAYROLL" || item.canLock);
  const hasIncompletePastData = isRequestedPeriodEnded
    ? !isPeriodComplete
    : hasPastMissingSummary;
  const hasBlocker = item.blockerMessages.length > 0 || hasIncompletePastData;
  const displayStatus =
    hasIncompletePastData && !isLockedOrSent ? "DATA_INCOMPLETE" : item.status;
  const incompletePeriodMessage = isRequestedPeriodEnded
    ? `ข้อมูลยังไม่ครบ ${fullPeriodDayCount.toLocaleString(
        "th-TH",
      )} วันในงวดนี้ ตอนนี้มีข้อมูล ${displaySummaryCount.toLocaleString(
        "th-TH",
      )} วัน`
    : `งวดนี้ยังไม่สิ้นสุด แสดงข้อมูลถึงวันนี้ ${displaySummaryCount.toLocaleString(
        "th-TH",
      )} / ${fullPeriodDayCount.toLocaleString("th-TH")} วัน`;

  return {
    effectiveDateTo,
    fullPeriodDayCount,
    availableDayCount,
    displaySummaryCount,
    isRequestedPeriodEnded,
    hasPastMissingSummary,
    isPeriodComplete,
    isAlreadyReady,
    isLockedOrSent,
    canReady,
    canLock,
    hasBlocker,
    displayStatus,
    incompletePeriodMessage,
  };
}

type MonthlyStatusSummary = {
  label: string;
  tone: "amber" | "green";
};

function getMonthlyPendingRequestCount(item: AttendanceMonthlyReviewItem) {
  const pendingSource = item as MonthlyReviewPendingCountSource;
  const totalPending = toNumber(pendingSource.pendingApprovalRequestCount);
  if (totalPending > 0) return totalPending;

  return (
    toNumber(pendingSource.pendingLeaveRequestCount) +
    toNumber(pendingSource.pendingOvertimeRequestCount) +
    toNumber(pendingSource.pendingTimeAdjustRequestCount) +
    toNumber(pendingSource.pendingOffsiteRequestCount)
  );
}

function getMonthlyStatusSummary(
  item: AttendanceMonthlyReviewItem,
  readiness: MonthlyReviewReadiness,
): MonthlyStatusSummary {
  const needReviewCount = toNumber(item.needReviewCount);
  if (needReviewCount > 0) {
    return {
      label: `ต้องตรวจสอบ ${needReviewCount.toLocaleString("th-TH")} วัน`,
      tone: "amber",
    };
  }

  const missingSummaryCount = toNumber(item.missingSummaryCount);
  if (missingSummaryCount > 0) {
    return {
      label: `ข้อมูลยังไม่ครบ ${missingSummaryCount.toLocaleString("th-TH")} วัน`,
      tone: "amber",
    };
  }

  const pendingRequestCount = getMonthlyPendingRequestCount(item);
  if (pendingRequestCount > 0) {
    return {
      label: `รอดำเนินการ ${pendingRequestCount.toLocaleString("th-TH")} รายการ`,
      tone: "amber",
    };
  }

  if (readiness.displayStatus === "SENT_TO_PAYROLL") {
    return { label: "ส่งเข้า Payroll แล้ว", tone: "green" };
  }
  if (readiness.displayStatus === "LOCKED") {
    return { label: "ล็อกงวดแล้ว", tone: "green" };
  }
  if (readiness.displayStatus === "READY_FOR_PAYROLL") {
    return { label: "พร้อมเข้า Payroll", tone: "green" };
  }
  if (readiness.displayStatus === "REVIEWED") {
    return { label: "ตรวจสอบครบแล้ว", tone: "green" };
  }

  return { label: "ไม่มีรายการต้องตรวจสอบ", tone: "green" };
}

type DetailTabKey = "review" | "workData";

type WorkDataEventTone = "red" | "amber" | "blue" | "green" | "slate";

type WorkDataEvent = {
  id: string;
  date: string | Date | null | undefined;
  title: string;
  detail: string;
  amount?: number;
  amountLabel?: string;
  tone: WorkDataEventTone;
};

type WorkDataGroup = {
  key: string;
  title: string;
  description: string;
  emptyText: string;
  events: WorkDataEvent[];
};

function detailDateSortKey(value: string | Date | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (Number.isNaN(value.getTime())) return "";
  return formatDateInputValue(value);
}

/** สีป้ายและตัวเลขของเหตุการณ์ในข้อมูลประกอบ — ชุดเดียวกับป้ายในแผงผลตรวจของหน้าเงินเดือน */
function workDataToneClasses(tone: WorkDataEventTone) {
  const map: Record<WorkDataEventTone, { badge: string; amount: string }> = {
    red: { badge: "bg-rose-100 text-rose-700", amount: "text-rose-700" },
    amber: { badge: "bg-amber-100 text-amber-800", amount: "text-amber-700" },
    blue: { badge: "bg-brand-100 text-brand-700", amount: "text-brand-700" },
    green: {
      badge: "bg-emerald-100 text-emerald-700",
      amount: "text-emerald-700",
    },
    slate: { badge: "bg-slate-100 text-slate-600", amount: "text-slate-700" },
  };

  return map[tone];
}

function buildWorkDataGroups(
  dailySummaries: AttendanceDailySummary[],
): WorkDataGroup[] {
  const sortedSummaries = [...dailySummaries].sort((left, right) =>
    detailDateSortKey(left.workDate).localeCompare(
      detailDateSortKey(right.workDate),
    ),
  );

  const groups: WorkDataGroup[] = [
    {
      key: "absent",
      title: "ขาดงาน",
      description: "วันที่ถูกบันทึกเป็นขาดงานจากข้อมูลจริง",
      emptyText: "ไม่พบวันที่ขาดงาน",
      events: [],
    },
    {
      key: "missing-log",
      title: "ลงเวลาไม่ครบ",
      description: "วันที่ไม่มีเวลาเข้า/ออกในรอบที่ต้องบันทึก",
      emptyText: "ไม่พบรายการลงเวลาไม่ครบ",
      events: [],
    },
    {
      key: "late",
      title: "มาสาย",
      description:
        "แสดงทุกวันที่มาสาย รวมถึงมาสายไม่เกิน 60 นาทีที่เป็นผลต่อ Payroll เท่านั้น",
      emptyText: "ไม่พบวันที่มาสาย",
      events: [],
    },
    {
      key: "leave",
      title: "ลา",
      description: "วันที่มีใบลาหรือเวลาลาที่ระบบผูกกับ Attendance",
      emptyText: "ไม่พบรายการลา",
      events: [],
    },
    {
      key: "offsite",
      title: "ทำงานนอกสถานที่",
      description: "วันที่มีรายการทำงานนอกสถานที่",
      emptyText: "ไม่พบรายการทำงานนอกสถานที่",
      events: [],
    },
    {
      key: "time-adjust",
      title: "แก้เวลา",
      description: "วันที่มีคำขอแก้เวลาที่เกี่ยวข้อง",
      emptyText: "ไม่พบคำขอแก้เวลา",
      events: [],
    },
    {
      key: "early-checkout",
      title: "ออกก่อนเวลา",
      description: "วันที่มีเวลาออกงานก่อนกำหนด",
      emptyText: "ไม่พบรายการออกก่อนเวลา",
      events: [],
    },
    {
      key: "overtime",
      title: "OT",
      description: "วันที่มี OT ที่อนุมัติหรือจ่ายได้",
      emptyText: "ไม่พบรายการ OT",
      events: [],
    },
  ];

  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const pushEvent = (groupKey: string, event: WorkDataEvent) => {
    groupByKey.get(groupKey)?.events.push(event);
  };

  sortedSummaries.forEach((summary) => {
    const status =
      summary.reviewStatus || summary.calculationStatus || "CALCULATED";

    if (summary.isAbsent || toNumber(summary.absentDays) > 0) {
      const absentDays = toNumber(summary.absentDays) || 1;
      pushEvent("absent", {
        id: `${summary.id}-absent`,
        date: summary.workDate,
        title: `ขาดงาน ${absentDays.toLocaleString("th-TH")} วัน`,
        detail: [
          "ระบบพบว่าไม่มีเวลาทำงานที่ยืนยันได้",
          `สถานะ ${statusLabels[status] || status}`,
        ].join(" · "),
        amount: toNumber(summary.absentDeductionAmount),
        amountLabel: "ยอดหักขาดงาน",
        tone: "red",
      });
    }

    const missingLabels = getMissingLogLabels(summary);
    if (missingLabels.length) {
      pushEvent("missing-log", {
        id: `${summary.id}-missing-log`,
        date: summary.workDate,
        title: `ลงเวลาไม่ครบ ${missingLabels.join(" / ")}`,
        detail: [
          `ไม่พบเวลา: ${missingLabels.join(" / ")}`,
          `สถานะ ${statusLabels[status] || status}`,
        ].join(" · "),
        amount: getMissingLogPenaltyAmount(summary),
        amountLabel: "ยอดหักลงเวลาไม่ครบ",
        tone: "red",
      });
    }

    if (toNumber(summary.totalLateMinutes) > 0) {
      const lateParts = [
        toNumber(summary.morningLateMinutes) > 0
          ? `เช้า ${numberText(summary.morningLateMinutes)} นาที`
          : "",
        toNumber(summary.afternoonLateMinutes) > 0
          ? `บ่าย ${numberText(summary.afternoonLateMinutes)} นาที`
          : "",
      ].filter(Boolean);
      const lateStatus = isLateOverReviewThreshold(summary)
        ? "มาสายเกินเกณฑ์ ต้องตรวจสอบ"
        : toNumber(summary.latePenaltyAmount) > 0
          ? "มีผลหักเงิน"
          : "ข้อมูลประกอบ ไม่ต้องตรวจ";

      pushEvent("late", {
        id: `${summary.id}-late`,
        date: summary.workDate,
        title: `มาสาย ${minutesToHoursText(summary.totalLateMinutes)}`,
        detail: [
          lateParts.length ? `ช่วงที่สาย: ${lateParts.join(" / ")}` : "",
          lateStatus,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: toNumber(summary.latePenaltyAmount),
        amountLabel: "ยอดหักมาสาย",
        tone: "amber",
      });
    }

    const hasLeave = Boolean(
      summary.leaveRequestId ||
      summary.leaveType ||
      toNumber(summary.paidLeaveMinutes) > 0 ||
      toNumber(summary.unpaidLeaveMinutes) > 0,
    );
    if (hasLeave) {
      const isUnpaid =
        summary.leaveIsPaid === false ||
        toNumber(summary.unpaidLeaveMinutes) > 0 ||
        toNumber(summary.unpaidLeaveDeductionAmount) > 0;
      const leaveDuration =
        toNumber(summary.paidLeaveMinutes) +
          toNumber(summary.unpaidLeaveMinutes) >
        0
          ? minutesToHoursText(
              toNumber(summary.paidLeaveMinutes) +
                toNumber(summary.unpaidLeaveMinutes),
            )
          : `${summary.leaveDurationDays || "-"} วัน`;

      pushEvent("leave", {
        id: `${summary.id}-leave`,
        date: summary.workDate,
        title:
          summary.leaveType?.nameTh || (isUnpaid ? "ลาไม่รับค่าจ้าง" : "ลา"),
        detail: [
          summary.leaveDayType || "",
          leaveDuration,
          isUnpaid ? "ไม่ได้รับค่าจ้าง" : "ได้รับค่าจ้าง",
        ]
          .filter(Boolean)
          .join(" · "),
        amount: toNumber(summary.unpaidLeaveDeductionAmount),
        amountLabel: "ยอดหักลาไม่รับค่าจ้าง",
        tone: isUnpaid ? "red" : "blue",
      });
    }

    if (toNumber(summary.offsiteMinutes) > 0 || summary.offsiteStatus) {
      pushEvent("offsite", {
        id: `${summary.id}-offsite`,
        date: summary.workDate,
        title: "ทำงานนอกสถานที่",
        detail:
          [
            toNumber(summary.offsiteMinutes) > 0
              ? `ระยะเวลา ${minutesToHoursText(summary.offsiteMinutes)}`
              : "",
            summary.offsiteStatus ? `สถานะคำขอ ${summary.offsiteStatus}` : "",
          ]
            .filter((part) => part && part !== "-")
            .join(" · ") || "มีรายการทำงานนอกสถานที่",
        tone: "blue",
      });
    }

    const timeAdjustRequests = summary.timeAdjustRequests ?? [];
    const pendingTimeAdjustCount = Math.max(
      toNumber(summary.pendingTimeAdjustRequestCount),
      timeAdjustRequests.filter((request) => request.status === "SUBMITTED")
        .length,
    );
    const approvedTimeAdjustCount = Math.max(
      toNumber(summary.approvedTimeAdjustRequestCount),
      timeAdjustRequests.filter((request) => request.status === "APPROVED")
        .length,
    );
    const rejectedTimeAdjustCount = Math.max(
      toNumber(summary.rejectedTimeAdjustRequestCount),
      timeAdjustRequests.filter((request) => request.status === "REJECTED")
        .length,
    );
    const timeAdjustCount = Math.max(
      timeAdjustRequests.length,
      pendingTimeAdjustCount +
        approvedTimeAdjustCount +
        rejectedTimeAdjustCount,
    );
    if (timeAdjustCount > 0) {
      const detailParts = [
        pendingTimeAdjustCount > 0
          ? `รออนุมัติ ${pendingTimeAdjustCount} รายการ`
          : "",
        approvedTimeAdjustCount > 0
          ? `อนุมัติแล้ว ${approvedTimeAdjustCount} รายการ`
          : "",
        rejectedTimeAdjustCount > 0
          ? `ไม่อนุมัติ ${rejectedTimeAdjustCount} รายการ`
          : "",
      ].filter(Boolean);

      pushEvent("time-adjust", {
        id: `${summary.id}-time-adjust`,
        date: summary.workDate,
        title: `คำขอแก้เวลา ${timeAdjustCount.toLocaleString("th-TH")} รายการ`,
        detail:
          detailParts.length > 0
            ? `สถานะคำขอ: ${detailParts.join(" · ")}`
            : "มีคำขอแก้เวลา",
        tone: pendingTimeAdjustCount > 0 ? "amber" : "blue",
      });
    }

    if (toNumber(summary.earlyCheckoutMinutes) > 0) {
      pushEvent("early-checkout", {
        id: `${summary.id}-early-checkout`,
        date: summary.workDate,
        title: `ออกก่อนเวลา ${earlyCheckoutDurationText(
          undefined,
          summary.earlyCheckoutMinutes,
        )}`,
        detail: [
          "เวลาออกงานเร็วกว่าปกติ",
          `สถานะ ${statusLabels[status] || status}`,
        ].join(" · "),
        amount: toNumber(summary.earlyCheckoutPenaltyAmount),
        amountLabel: "ยอดหักออกก่อนเวลา",
        tone: "red",
      });
    }

    const overtimeMinutes = getApprovedOvertimeMinutes(summary);
    const overtimeAmount = getApprovedOvertimeAmount(summary);
    if (overtimeMinutes > 0 || overtimeAmount > 0) {
      pushEvent("overtime", {
        id: `${summary.id}-overtime`,
        date: summary.workDate,
        title: `OT ${minutesToHoursText(overtimeMinutes)}`,
        detail: [
          `เวลาที่อนุมัติ ${minutesToHoursText(overtimeMinutes)}`,
          `สถานะ ${statusLabels[status] || status}`,
        ].join(" · "),
        amount: overtimeAmount,
        amountLabel: "เงิน OT",
        tone: "green",
      });
    }
  });

  return groups.filter((group) => group.events.length > 0);
}

/** ไล่วันที่ทีละวันตลอดรอบเงินเดือน (รวมวันเริ่มและวันสุดท้าย) */
function eachDayOfPeriod(dateFrom: string, dateTo: string) {
  const start = parseDateInputValue(dateFrom);
  const end = parseDateInputValue(dateTo);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const days: string[] = [];
  const cursor = new Date(start);

  // กันงวดที่ตั้งวันผิดจนวนไม่จบ — รอบเงินเดือนจริงไม่เกินสองเดือนอยู่แล้ว
  while (cursor <= end && days.length < 70) {
    days.push(formatDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function weekdayLabel(day: string) {
  const date = parseDateInputValue(day);
  if (Number.isNaN(date.getTime())) return "";
  return THAI_WEEKDAYS[date.getDay()] ?? "";
}

function isWeekend(day: string) {
  const date = parseDateInputValue(day);
  if (Number.isNaN(date.getTime())) return false;
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

/** ช่องเวลาหนึ่งช่อง — มีเวลาแสดงเวลา ที่ระบบตีว่าลืมลงเวลาแสดงเป็นขีดแดง */
function TimeCell({
  value,
  missing,
  channel,
}: {
  value?: string | Date | null;
  missing?: boolean;
  /** อุปกรณ์ที่ใช้ลงเวลารอบนี้ ไม่ส่งมาก็ไม่แสดงไอคอน */
  channel?: PunchChannelInfo;
}) {
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
        {formatThaiTime(value)}
        <PunchChannelIcon info={channel ?? null} />
      </span>
    );
  }

  if (missing) {
    return <span className="font-semibold text-rose-600">ไม่พบ</span>;
  }

  return <span className="text-slate-200">—</span>;
}

/**
 * ข้อมูลประกอบรายวัน
 * ------------------
 * เป็นตารางจริง ๆ ไม่ใช่รายการซ้อนรายการ — เวลาแต่ละช่วงมีคอลัมน์ของตัวเอง
 * ป้ายกำกับจึงขึ้นครั้งเดียวที่หัวตาราง ไม่ใช่ซ้ำทุกแถวจนอ่านไม่ทัน
 *
 * ค่าเริ่มต้นแสดงเฉพาะวันที่มีเรื่อง เพราะรอบหนึ่งมี 30 กว่าวันแต่วันที่ต้องดูจริงมีไม่กี่วัน
 * กดสลับดูทั้งงวดได้เมื่อต้องไล่เช็กให้ครบ
 */
function WorkDataGroupsView({
  groups,
  dailySummaries,
  dateFrom,
  dateTo,
}: {
  groups: WorkDataGroup[];
  dailySummaries: AttendanceDailySummary[];
  dateFrom: string;
  dateTo: string;
}) {
  const [showAllDays, setShowAllDays] = useState(false);

  const eventsByDate = useMemo(() => {
    const map = new Map<
      string,
      Array<WorkDataEvent & { groupTitle: string }>
    >();

    groups.forEach((group) => {
      group.events.forEach((event) => {
        const key = detailDateSortKey(event.date);
        if (!key) return;

        const current = map.get(key) ?? [];
        current.push({ ...event, groupTitle: group.title });
        map.set(key, current);
      });
    });

    return map;
  }, [groups]);

  const dailySummaryByDate = useMemo(() => {
    const map = new Map<string, AttendanceDailySummary>();

    dailySummaries.forEach((summary) => {
      const key = detailDateSortKey(summary.workDate);
      if (key) map.set(key, summary);
    });

    return map;
  }, [dailySummaries]);

  /** ถ้าไม่มีช่วงงวดส่งมา ให้ใช้วันที่ที่มีข้อมูลจริงแทน จะได้ไม่กลายเป็นตารางว่าง */
  const allDays = useMemo(() => {
    const fromPeriod = eachDayOfPeriod(dateFrom, dateTo);
    if (fromPeriod.length) return fromPeriod;

    return Array.from(
      new Set([...dailySummaryByDate.keys(), ...eventsByDate.keys()]),
    ).sort();
  }, [dateFrom, dateTo, dailySummaryByDate, eventsByDate]);

  const daysWithEvents = useMemo(
    () => allDays.filter((day) => (eventsByDate.get(day)?.length ?? 0) > 0),
    [allDays, eventsByDate],
  );

  const visibleDays = showAllDays ? allDays : daysWithEvents;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            ข้อมูลประกอบรายวัน
          </p>
          <p className="mt-0.5 text-[13px] leading-6 text-slate-500 3xl:text-[14px]">
            งวด {formatThaiDate(dateFrom)} – {formatThaiDate(dateTo)} ·{" "}
            {allDays.length.toLocaleString("th-TH")} วัน · มีเรื่องต้องดู{" "}
            {daysWithEvents.length.toLocaleString("th-TH")} วัน
          </p>
        </div>

        <Button size="sm" onClick={() => setShowAllDays((current) => !current)}>
          {showAllDays
            ? `ดูเฉพาะวันที่มีเรื่อง (${daysWithEvents.length.toLocaleString("th-TH")})`
            : `ดูทั้งงวด (${allDays.length.toLocaleString("th-TH")})`}
        </Button>
      </div>

      {visibleDays.length ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {[
                  { label: "วันที่", className: "w-32 text-left" },
                  { label: "เข้าเช้า", className: "w-20 text-center" },
                  { label: "เข้าบ่าย", className: "w-20 text-center" },
                  { label: "ออกงาน", className: "w-20 text-center" },
                  { label: "เหตุการณ์", className: "text-left" },
                  { label: "ผลต่อเงินเดือน", className: "w-36 text-right" },
                ].map((column) => (
                  <th
                    key={column.label}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap border-b border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
                      column.className,
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleDays.map((day) => {
                const summary = dailySummaryByDate.get(day);
                const events = eventsByDate.get(day) ?? [];
                const deduction = toNumber(summary?.totalDeductionAmount);
                const overtime = summary
                  ? getApprovedOvertimeAmount(summary)
                  : 0;

                return (
                  <tr
                    key={day}
                    className={cn(
                      "border-b border-slate-100 align-top last:border-b-0",
                      isWeekend(day) && "bg-slate-50/40",
                    )}
                  >
                    <td className="whitespace-nowrap py-2 pl-5 pr-3 sm:pl-6">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatThaiDate(day)}
                      </span>
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {weekdayLabel(day)}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-center">
                      <TimeCell
                        value={summary?.morningInAt}
                        missing={summary?.isMorningMissing}
                        channel={summary?.punchChannels?.morning}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <TimeCell
                        value={summary?.afternoonInAt}
                        missing={summary?.isAfternoonMissing}
                        channel={summary?.punchChannels?.afternoon}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <TimeCell
                        value={summary?.checkOutAt}
                        missing={summary?.isCheckoutMissing}
                        channel={summary?.punchChannels?.checkout}
                      />
                    </td>

                    <td className="px-3 py-2">
                      {events.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {events.map((event) => (
                            <span
                              key={event.id}
                              title={
                                event.detail
                                  ? `${event.title} · ${event.detail}`
                                  : event.title
                              }
                              className={cn(
                                "inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold 3xl:text-[12px]",
                                workDataToneClasses(event.tone).badge,
                              )}
                            >
                              <span className="truncate">{event.title}</span>
                            </span>
                          ))}
                        </div>
                      ) : summary ? (
                        <span className="text-[12px] text-slate-300">ปกติ</span>
                      ) : (
                        <span className="text-[12px] text-slate-300">
                          ไม่มีข้อมูลลงเวลา
                        </span>
                      )}
                    </td>

                    <td className="whitespace-nowrap py-2 pl-3 pr-5 text-right tabular-nums sm:pr-6">
                      {deduction > 0 ? (
                        <span className="font-bold text-rose-600">
                          -{money(deduction)}
                        </span>
                      ) : null}
                      {overtime > 0 ? (
                        <span
                          className={cn(
                            "font-bold text-emerald-700",
                            deduction > 0 && "ml-2",
                          )}
                        >
                          +{money(overtime)}
                        </span>
                      ) : null}
                      {deduction <= 0 && overtime <= 0 ? (
                        <span className="text-slate-200">—</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* คำอธิบายไอคอน วางครั้งเดียวใต้ตาราง ไม่ต้องซ้ำทุกแถว */}
          <div className="border-t border-slate-100 px-5 py-2.5 sm:px-6">
            <PunchChannelLegend />
          </div>
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-[13px] text-slate-400 sm:px-6">
          ไม่พบเหตุการณ์ผิดปกติในงวดนี้ · กด &quot;ดูทั้งงวด&quot;
          เพื่อไล่เช็กทุกวัน
        </p>
      )}
    </section>
  );
}

function DetailModalLoadingBlock({ text }: { text: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/70 text-sm font-semibold text-sky-800">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

function DetailModal({
  detail,
  onClose,
  onReviewDay,
  onCancelReviewDay,
  actioningDailyId,
  canManageMonthlyReview,
  onPenaltyWaiverChanged,
}: {
  detail: AttendanceMonthlyReviewDetailResponse;
  onClose: () => void;
  onReviewDay: (summary: AttendanceDailySummary) => void;
  onCancelReviewDay: (summary: AttendanceDailySummary) => void;
  actioningDailyId: string | null;
  canManageMonthlyReview: boolean;
  onPenaltyWaiverChanged?: () => void;
}) {
  const item = detail.summary;
  const [activeDetailTab, setActiveDetailTab] =
    useState<DetailTabKey>("review");
  const [heavyContentReady, setHeavyContentReady] = useState(false);

  useEffect(() => {
    setHeavyContentReady(false);
    const timeoutId = window.setTimeout(() => setHeavyContentReady(true), 90);
    return () => window.clearTimeout(timeoutId);
  }, [detail.summary.employeeId, detail.dateFrom, detail.dateTo]);

  const issues = useMemo(
    () =>
      item.blockerMessages?.length
        ? item.blockerMessages.map(normalizeReviewMessage)
        : [],
    [item.blockerMessages],
  );

  const payrollBreakdown = useMemo(
    () => buildMonthlyPayrollBreakdown(item),
    [item],
  );
  const totalIncome = payrollBreakdown.totalIncome;
  const totalDeduction = payrollBreakdown.totalDeduction;

  const shouldRenderReviewDetails =
    heavyContentReady && activeDetailTab === "review";
  const shouldRenderWorkData =
    heavyContentReady && activeDetailTab === "workData";

  const actionableReviewDays = useMemo(
    () => detail.dailySummaries.filter(hasPayrollIssueDay),
    [detail.dailySummaries],
  );
  const issueDays = shouldRenderReviewDetails ? actionableReviewDays : [];
  const reviewIssueCount = actionableReviewDays.length;

  const workDataGroups = useMemo(
    () =>
      shouldRenderWorkData ? buildWorkDataGroups(detail.dailySummaries) : [],
    [detail.dailySummaries, shouldRenderWorkData],
  );
  const workDataEventCount = shouldRenderWorkData
    ? workDataGroups.reduce((sum, group) => sum + group.events.length, 0)
    : Math.max(
        toNumber(item.absentDayCount) +
          toNumber(item.missingLogCount) +
          toNumber(item.lateDayCount) +
          toNumber(item.paidLeaveDayCount) +
          toNumber(item.unpaidLeaveDayCount) +
          toNumber(item.offsiteDayCount) +
          toNumber(item.earlyCheckoutDayCount) +
          toNumber(item.approvedOvertimeRequestCount) +
          toNumber(item.pendingTimeAdjustRequestCount) +
          toNumber(item.approvedTimeAdjustRequestCount),
        0,
      );
  const pendingApprovalItems = useMemo(
    () =>
      shouldRenderReviewDetails
        ? buildPendingApprovalItems(
            item,
            detail.dailySummaries,
            detail.offsiteRequests,
          )
        : [],
    [
      item,
      detail.dailySummaries,
      detail.offsiteRequests,
      shouldRenderReviewDetails,
    ],
  );

  return (
    <Modal
      open
      size="lg"
      title="สรุปรายพนักงานของงวด"
      description={`งวด ${formatThaiDate(detail.dateFrom)} – ${formatThaiDate(detail.dateTo)}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>ปิด</Button>}
    >
      <div className="-mx-5 -my-5">
        {/* แถวตัวตน — รูปกับชื่ออยู่ในเนื้อกล่อง หัวกล่องบอกแค่ว่าเป็นเรื่องอะไรของงวดไหน */}
        {/* แถวตัวตนอยู่บนพื้นฟ้าอ่อน ทำหน้าที่เป็นหัวเรื่องจริงของกล่อง */}
        <div className="flex items-center gap-3 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
          <Avatar
            name={employeeName(detail)}
            src={getPublicFileUrl(detail.employee.user?.avatarUrl ?? null)}
            size="md"
          />
          <div className="min-w-0">
            <p className="break-words text-[14px] font-bold text-slate-900 3xl:text-[15px]">
              {employeeName(detail)}
            </p>
            <p className="break-words text-[11.5px] text-slate-500 3xl:text-[12px]">
              {[
                detail.employee.employeeCode,
                employeeDepartmentPosition(detail.employee),
                employeeCompanyBranch(detail.employee),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div>
          <section className="border-b border-brand-100 px-5 py-3.5 sm:px-6">
            {/* สี่ช่องสรุปอยู่ในกล่องเดียวมีเส้นแบ่ง ชุดเดียวกับแผงตัวเลขบนหัวหน้า */}
            <div className="grid grid-cols-2 divide-x divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100 sm:grid-cols-4 sm:divide-y-0">
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                  วันที่มีข้อมูล
                </p>
                <p className="truncate text-[14.5px] font-bold tabular-nums leading-5 text-slate-900">
                  {item.summaryCount} / {item.dayCount} วัน
                </p>
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                  ยอดหักรวม
                </p>
                <p className="truncate text-[14.5px] font-bold tabular-nums leading-5 text-rose-600">
                  {money(totalDeduction)} บาท
                </p>
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                  OT ที่อนุมัติ
                </p>
                <p className="truncate text-[14.5px] font-bold tabular-nums leading-5 text-emerald-700">
                  {money(totalIncome)} บาท
                </p>
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                  สถานะ
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      statusInlineDotClass(item.status),
                    )}
                  />
                  <span
                    className={cn(
                      "truncate text-[12.5px] font-semibold",
                      statusInlineTextClass(item.status),
                    )}
                  >
                    {statusLabels[item.status] || item.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3.5 grid gap-6 border-t border-brand-100 pt-3.5 lg:grid-cols-2">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                    รายละเอียดรายการหัก
                  </h4>
                  <span className="text-xs font-semibold text-slate-400">
                    {payrollBreakdown.deductionRows.length.toLocaleString(
                      "th-TH",
                    )}{" "}
                    รายการ
                  </span>
                </div>
                {payrollBreakdown.deductionRows.length ? (
                  <div className="mt-2 divide-y divide-slate-100">
                    {payrollBreakdown.deductionRows.map((row) => (
                      <div
                        key={`${row.label}-${row.value || ""}`}
                        className="flex items-center justify-between gap-4 py-1.5 text-[13px]"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-700">
                            {row.label}
                          </span>
                          {row.value && row.value !== "-" ? (
                            <span className="ml-2 text-xs text-slate-400">
                              {row.value}
                            </span>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-bold text-rose-600">
                          -{money(row.amount)} บาท
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    ไม่มีรายการหักในงวดนี้
                  </p>
                )}
              </div>

              <div className="min-w-0 lg:border-l lg:border-brand-100 lg:pl-6">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                    รายละเอียด OT ที่อนุมัติ
                  </h4>
                  <span className="text-xs font-semibold text-slate-400">
                    {payrollBreakdown.incomeRows.length.toLocaleString("th-TH")}{" "}
                    รายการ
                  </span>
                </div>
                {payrollBreakdown.incomeRows.length ? (
                  <div className="mt-2 divide-y divide-slate-100">
                    {payrollBreakdown.incomeRows.map((row) => (
                      <div
                        key={`${row.label}-${row.value || ""}`}
                        className="flex items-center justify-between gap-4 py-1.5 text-[13px]"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-700">
                            {row.label}
                          </span>
                          {row.value && row.value !== "-" ? (
                            <span className="ml-2 text-xs text-slate-400">
                              {row.value}
                            </span>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-bold text-emerald-700">
                          +{money(row.amount)} บาท
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-400">
                    ไม่มี OT ที่อนุมัติในงวดนี้
                  </p>
                )}
              </div>
            </div>
          </section>

          {/*
           * ผลตรวจของพนักงานคนนี้ — โครงเดียวกับแผง "ผลตรวจก่อนอนุมัติ" ของหน้า /payroll/[periodId]
           * สรุปด้านบนหนึ่งบรรทัด แล้วไล่เป็นรายการคั่นเส้น ไอคอน + ป้ายระดับ + คำอธิบาย
           */}
          <section className="border-b border-brand-100">
            <div className="border-b border-brand-100 px-5 py-3 sm:px-6">
              {issues.length === 0 && pendingApprovalItems.length === 0 ? (
                <Notice
                  tone="positive"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                >
                  ตรวจผ่านทั้งหมด ไม่พบรายการที่ต้องจัดการของพนักงานคนนี้
                </Notice>
              ) : issues.length > 0 ? (
                <Notice tone="critical" icon={<XCircle className="h-4 w-4" />}>
                  มี {issues.length.toLocaleString("th-TH")}{" "}
                  เรื่องที่ต้องแก้ก่อนถึงจะส่งเข้า Payroll ได้
                </Notice>
              ) : (
                <Notice
                  tone="warning"
                  icon={<AlertTriangle className="h-4 w-4" />}
                >
                  ส่งต่อได้ แต่มี{" "}
                  {pendingApprovalItems.length.toLocaleString("th-TH")}{" "}
                  รายการที่ยังรออนุมัติอยู่
                </Notice>
              )}
            </div>

            {issues.length || pendingApprovalItems.length ? (
              <ul className="divide-y divide-slate-100">
                {issues.map((message) => (
                  <li
                    key={message}
                    className="flex items-start gap-3 px-5 py-3.5 sm:px-6"
                  >
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-bold text-slate-900 3xl:text-[14px]">
                          {message}
                        </p>
                        <span className="inline-flex rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 3xl:text-[12px]">
                          ต้องแก้ก่อน
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-6 text-slate-500 3xl:text-[14px]">
                        แก้ที่หน้าตรวจเวลาทำงานรายวันก่อน
                        แล้วกลับมาคำนวณงวดนี้ใหม่
                      </p>
                    </div>
                  </li>
                ))}

                {pendingApprovalItems.map((pending) => (
                  <li
                    key={pending.id}
                    className="flex items-start gap-3 px-5 py-3.5 sm:px-6"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-bold text-slate-900 3xl:text-[14px]">
                          {pending.title}
                        </p>
                        <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 3xl:text-[12px]">
                          {pending.type}
                        </span>
                        {pending.date ? (
                          <span className="text-[11px] font-semibold text-slate-400 3xl:text-[12px]">
                            {formatThaiDate(pending.date)}
                          </span>
                        ) : null}
                      </div>
                      {pending.detail ? (
                        <p className="mt-0.5 text-[13px] leading-6 text-slate-500 3xl:text-[14px]">
                          {pending.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="bg-white">
            <div className="flex flex-col gap-3 border-b border-brand-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                รายละเอียดรายวัน
              </h3>
              <div className="flex items-center gap-5 text-[13px]">
                {[
                  {
                    key: "review" as const,
                    label: "ต้องตรวจสอบ",
                    count: reviewIssueCount,
                  },
                  {
                    key: "workData" as const,
                    label: "ข้อมูลประกอบ",
                    count: workDataEventCount,
                  },
                ].map((tab) => {
                  const active = activeDetailTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveDetailTab(tab.key)}
                      className={cn(
                        "border-b-2 pb-1 font-semibold transition",
                        active
                          ? "border-brand-600 text-brand-700"
                          : "border-transparent text-slate-500 hover:text-slate-800",
                      )}
                    >
                      {tab.label} ({tab.count.toLocaleString("th-TH")})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-4 sm:px-6">
              {activeDetailTab === "workData" ? (
                shouldRenderWorkData ? (
                  <WorkDataGroupsView
                    groups={workDataGroups}
                    dailySummaries={detail.dailySummaries}
                    dateFrom={detail.dateFrom}
                    dateTo={detail.dateTo}
                  />
                ) : (
                  <DetailModalLoadingBlock text="กำลังจัดกลุ่มข้อมูลประกอบรายวัน" />
                )
              ) : !shouldRenderReviewDetails ? (
                <DetailModalLoadingBlock text="กำลังเตรียมรายการที่ต้องตรวจสอบก่อน Payroll" />
              ) : issueDays.length ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">
                        รายการที่ HR ต้องตัดสินใจ
                      </h4>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                        ตรวจเหตุผล ยอดหัก และ OT ของแต่ละวันก่อนส่งเข้า Payroll
                      </p>
                    </div>
                    <span className="text-[12px] font-semibold text-slate-400">
                      {reviewIssueCount.toLocaleString("th-TH")} วัน
                    </span>
                  </div>

                  <div className="border-y border-slate-200">
                    <div className="hidden grid-cols-[104px_minmax(0,1fr)_180px_150px] gap-3 border-b border-slate-300 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 lg:grid">
                      <span>วันที่</span>
                      <span>ประเด็นและรายละเอียด</span>
                      <span>ผลต่อ Payroll</span>
                      <span>จัดการ</span>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {issueDays.map((summary) => {
                        const details = buildIssueDayDetails(summary);
                        const status =
                          summary.reviewStatus || summary.calculationStatus;
                        const canReviewDay =
                          canMarkDailySummaryReviewed(summary);
                        const canCancelReviewDay =
                          canCancelDailySummaryReviewed(summary);
                        const isReviewedDay = status === "REVIEWED";
                        const isReviewingDay = actioningDailyId === summary.id;
                        const income = getApprovedOvertimeAmount(summary);
                        const deduction = toNumber(
                          summary.totalDeductionAmount,
                        );

                        return (
                          <article
                            key={summary.id}
                            className="grid gap-3 px-4 py-2.5 transition hover:bg-brand-50/50 lg:grid-cols-[104px_minmax(0,1fr)_180px_172px] lg:items-start"
                          >
                            <div>
                              <p className="text-xs font-semibold text-slate-400 lg:hidden">
                                วันที่
                              </p>
                              <p className="text-[13px] font-bold tabular-nums text-slate-900">
                                {formatThaiDate(summary.workDate)}
                              </p>
                              {summary.leaveDayType ? (
                                <p className="mt-1 text-xs text-slate-400">
                                  ลา: {summary.leaveDayType}
                                </p>
                              ) : null}
                            </div>

                            <div className="min-w-0">
                              <p className="mb-2 text-xs font-semibold text-slate-400 lg:hidden">
                                ประเด็นและรายละเอียด
                              </p>
                              {details.length ? (
                                <div className="space-y-2">
                                  {details.map((detailItem) => (
                                    <div
                                      key={`${summary.id}-${detailItem.label}-${detailItem.value}`}
                                      className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-2 text-[13px]"
                                    >
                                      <span
                                        className={cn(
                                          "mt-1.5 h-2 w-2 rounded-full",
                                          detailItem.tone === "red"
                                            ? "bg-rose-500"
                                            : detailItem.tone === "amber"
                                              ? "bg-amber-500"
                                              : detailItem.tone === "green"
                                                ? "bg-emerald-500"
                                                : detailItem.tone === "blue"
                                                  ? "bg-sky-500"
                                                  : "bg-slate-400",
                                        )}
                                      />
                                      <p className="min-w-0 leading-5 text-slate-500">
                                        <span className="font-semibold text-slate-800">
                                          {detailItem.label}
                                        </span>
                                        {detailItem.value ? (
                                          <span> · {detailItem.value}</span>
                                        ) : null}
                                      </p>
                                      {detailItem.amount ? (
                                        <span
                                          className={cn(
                                            "shrink-0 whitespace-nowrap text-[12px] tabular-nums",
                                            detailItem.tone === "green"
                                              ? "text-emerald-600"
                                              : "text-rose-500",
                                          )}
                                        >
                                          {detailItem.tone === "green"
                                            ? "+"
                                            : "-"}
                                          {money(detailItem.amount)}
                                        </span>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-500">
                                  สถานะยังต้องตรวจสอบ แต่ไม่พบประเด็นแยกย่อย
                                </p>
                              )}
                            </div>

                            <div className="space-y-1 text-[13px]">
                              <p className="text-xs font-semibold text-slate-400 lg:hidden">
                                ผลต่อ Payroll
                              </p>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="whitespace-nowrap text-[11px] text-slate-400">
                                  ยอดหักรวม
                                </span>
                                <span className="whitespace-nowrap font-bold tabular-nums text-rose-600">
                                  -{money(deduction)}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="whitespace-nowrap text-[11px] text-slate-400">
                                  OT ที่อนุมัติ
                                </span>
                                <span className="whitespace-nowrap font-bold tabular-nums text-emerald-700">
                                  +{money(income)}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-2 lg:items-stretch">
                              <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold">
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    isReviewedDay
                                      ? "bg-emerald-500"
                                      : "bg-amber-500",
                                  )}
                                />
                                <span
                                  className={
                                    isReviewedDay
                                      ? "text-emerald-700"
                                      : "text-amber-700"
                                  }
                                >
                                  {isReviewedDay
                                    ? "ตรวจแล้ว"
                                    : statusLabels[status] || status}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  isReviewedDay
                                    ? onCancelReviewDay(summary)
                                    : onReviewDay(summary)
                                }
                                disabled={
                                  !canManageMonthlyReview ||
                                  (isReviewedDay
                                    ? !canCancelReviewDay || isReviewingDay
                                    : !canReviewDay || isReviewingDay)
                                }
                                className={cn(
                                  "inline-flex h-8 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px] font-semibold transition",
                                  isReviewedDay
                                    ? "border border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                                    : "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none",
                                )}
                              >
                                {isReviewingDay ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                {isReviewedDay ? "ยกเลิกตรวจ" : "ยืนยันตรวจสอบ"}
                              </button>

                              {/* ลืมสแกนบางวันเกิดจากออกทำงานข้างนอก HR เลือกได้ว่าจะหักไหม */}
                              {!summary.isAbsent &&
                              canManageMonthlyReview &&
                              hasMissingLogPenaltyDecision(summary) ? (
                                <MissingLogPenaltyWaiverControl
                                  summary={summary}
                                  layout="stacked"
                                  onChanged={onPenaltyWaiverChanged}
                                />
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                  ไม่พบวันที่ต้องให้ HR ตรวจสอบ
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

function buildMonthlySummaryFallback(
  items: AttendanceMonthlyReviewItem[],
): AttendanceMonthlyReviewListSummary {
  return items.reduce<AttendanceMonthlyReviewListSummary>(
    (acc, item) => {
      const isReady = item.status === "READY_FOR_PAYROLL";
      const isNeedReview =
        item.status === "NEED_REVIEW" ||
        item.status === "DATA_INCOMPLETE" ||
        item.needReviewCount > 0;

      acc.total += 1;
      acc.readyForPayroll += isReady ? 1 : 0;
      acc.needReview += isNeedReview ? 1 : 0;
      acc.locked += item.status === "LOCKED" ? 1 : 0;
      acc.sentToPayroll += item.status === "SENT_TO_PAYROLL" ? 1 : 0;
      acc.reviewed += item.status === "REVIEWED" ? 1 : 0;
      acc.missingSummaryCount += toNumber(item.missingSummaryCount);
      acc.needReviewDayCount += toNumber(item.needReviewCount);
      acc.missingLogCount += toNumber(item.missingLogCount);
      acc.lateDayCount += toNumber(item.lateDayCount);
      acc.unpaidLeaveDayCount += toNumber(item.unpaidLeaveDayCount);
      acc.totalLateMinutes += toNumber(item.totalLateMinutes);
      acc.approvedOtMinutes += toNumber(item.approvedOtMinutes);
      acc.payableOtMinutes += toNumber(item.payableOtMinutes);
      acc.approvedOvertimeAmountPreview =
        toNumber(acc.approvedOvertimeAmountPreview) +
        getApprovedOvertimeAmount(item);
      acc.latePenaltyAmount =
        toNumber(acc.latePenaltyAmount) + toNumber(item.latePenaltyAmount);
      acc.missingLogPenaltyAmount =
        toNumber(acc.missingLogPenaltyAmount) +
        toNumber(item.missingLogPenaltyAmount);
      acc.unpaidLeaveDeductionAmount =
        toNumber(acc.unpaidLeaveDeductionAmount) +
        toNumber(item.unpaidLeaveDeductionAmount);
      acc.earlyCheckoutDayCount =
        toNumber(acc.earlyCheckoutDayCount) +
        toNumber(item.earlyCheckoutDayCount);
      acc.earlyCheckoutMinutes =
        toNumber(acc.earlyCheckoutMinutes) +
        toNumber(item.earlyCheckoutMinutes);
      acc.earlyCheckoutPenaltyAmount =
        toNumber(acc.earlyCheckoutPenaltyAmount) +
        toNumber(item.earlyCheckoutPenaltyAmount);
      acc.totalDeductionAmount =
        toNumber(acc.totalDeductionAmount) +
        toNumber(item.totalDeductionAmount);
      return acc;
    },
    { ...EMPTY_MONTHLY_REVIEW_SUMMARY },
  );
}

/**
 * ปุ่มจัดการท้ายแถวของหน้านี้
 * ------------------------------
 * แต่ละปุ่มมีสีประจำตัวเหมือนเดิม (ดู = ฟ้า · พร้อมส่ง = เขียว · ล็อก = เทาเข้ม)
 * แต่ตอนกดได้เป็น "สีทึบตัวหนังสือขาว" ไม่ใช่พื้นสีอ่อน จะได้เห็นแต่ไกลว่าทำอะไรได้
 * และตอนกดไม่ได้เป็นขาวขอบเทาตัวหนังสือเทา ไม่ใช่เทาอ่อนบนเทาอ่อนจนอ่านไม่ออก
 */
/*
 * ปุ่มประจำแถวเป็นไอคอนวงกลม ไม่ใช่ปุ่มเต็มความกว้างสามใบเรียงลงมา
 * ปุ่มสีทึบทุกแถวทำให้คอลัมน์จัดการกลายเป็นแถบสีเรียงกันทั้งคอลัมน์ และกินความสูง
 * แถวละเกือบร้อยพิกเซล ทั้งที่ส่วนใหญ่กดแค่ปุ่มเดียว
 */
/*
 * ปุ่มประจำแถวมีข้อความกำกับ ไม่ใช่ไอคอนเปล่า — ผู้ใช้ต้องอ่านออกว่าปุ่มไหนทำอะไร
 * โดยไม่ต้องเอาเมาส์ไปจ่อ ความกว้างของปุ่มพอดีข้อความ ไม่ยืดเต็มช่อง
 *   บรรทัดบน = ดูรายละเอียด (กดบ่อยสุด แยกออกมาให้เห็นก่อน)
 *   บรรทัดล่าง = พร้อม Payroll · ล็อกงวด
 */
function rowActionClass(tone: "view" | "ready" | "lock", disabled: boolean) {
  const base =
    "inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed 3xl:h-8 3xl:text-[11.5px]";

  if (disabled) {
    return cn(base, "border-slate-200 bg-white text-slate-300");
  }

  const toneClass = {
    view: "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 hover:bg-brand-100",
    ready:
      "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700",
    lock: "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100",
  }[tone];

  return cn(base, toneClass);
}

function EmployeeAvatar({ item }: { item: AttendanceMonthlyReviewItem }) {
  return (
    <Avatar
      name={employeeName(item)}
      src={getPublicFileUrl(item.employee.user?.avatarUrl ?? null)}
      size="lg"
    />
  );
}

type AbnormalWorkRow = {
  label: string;
  value: string;
  isNormal?: boolean;
};

function buildAbnormalWorkRows(item: AttendanceMonthlyReviewItem) {
  const rows: AbnormalWorkRow[] = [];

  if (toNumber(item.missingLogCount) > 0) {
    rows.push({ label: "ลงเวลาไม่ครบ", value: `${item.missingLogCount} วัน` });
  }

  if (toNumber(item.absentDayCount) > 0) {
    rows.push({ label: "ขาดงาน", value: `${item.absentDayCount} วัน` });
  }

  if (toNumber(item.lateDayCount) > 0) {
    rows.push({ label: "มาสาย", value: `${item.lateDayCount} วัน` });
  }

  if (
    toNumber(item.earlyCheckoutMinutes) > 0 ||
    toNumber(item.earlyCheckoutDayCount) > 0
  ) {
    rows.push({
      label: "ออกก่อนเวลา",
      value: earlyCheckoutDaysOnlyText(
        item.earlyCheckoutDayCount,
        item.earlyCheckoutMinutes,
      ),
    });
  }

  if (toNumber(item.paidLeaveDayCount) > 0) {
    rows.push({
      label: "ลาได้รับค่าจ้าง",
      value: `${item.paidLeaveDayCount} วัน`,
    });
  }

  if (
    toNumber(item.unpaidLeaveDayCount) > 0 ||
    toNumber(item.unpaidLeaveMinutes) > 0
  ) {
    const parts = [
      toNumber(item.unpaidLeaveDayCount) > 0
        ? `${item.unpaidLeaveDayCount} วัน`
        : "",
      toNumber(item.unpaidLeaveMinutes) > 0
        ? minutesToHoursText(item.unpaidLeaveMinutes)
        : "",
    ].filter(Boolean);

    rows.push({ label: "ลาไม่รับค่าจ้าง", value: parts.join(" • ") || "-" });
  }

  if (!rows.length) {
    rows.push({ label: "ไม่พบรายการผิดปกติ", value: "", isNormal: true });
  }

  return rows;
}

function WorkSummaryRows({ item }: { item: AttendanceMonthlyReviewItem }) {
  const rows = buildAbnormalWorkRows(item);

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div
          key={`${row.label}-${row.value}`}
          className="flex min-w-0 items-baseline gap-2 text-xs leading-5"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              row.isNormal ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          <span
            className={cn(
              "whitespace-nowrap font-medium",
              row.isNormal ? "text-emerald-700" : "text-slate-600",
            )}
          >
            {row.label}
          </span>
          <span
            className={cn(
              "whitespace-nowrap font-bold",
              row.isNormal ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function PayrollImpactBox({ item }: { item: AttendanceMonthlyReviewItem }) {
  const overtimeAmount = getApprovedOvertimeAmount(item);
  const deductionAmount = toNumber(item.totalDeductionAmount);

  return (
    <div className="min-w-0 space-y-2 text-xs leading-5">
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-slate-500">ยอดหักรวม</span>
        <span className="whitespace-nowrap font-bold text-rose-600">
          {money(deductionAmount)} บ.
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-slate-500">OT ที่อนุมัติ</span>
        <span className="whitespace-nowrap font-bold text-emerald-600">
          {money(overtimeAmount)} บ.
        </span>
      </div>
    </div>
  );
}

/**
 * ตัวกรองสังกัดในแถบเครื่องมือ
 * ไม่มีป้ายกำกับด้านบน — ตัวเลือกแรก ("ทุกสาขา" ฯลฯ) บอกอยู่แล้วว่าช่องนี้กรองอะไร
 * และห้ามใส่ความกว้างตายตัว กริดของแถบตัวกรองเป็นคนคุม
 */
/** หนึ่งบรรทัดในป๊อปอัพตัวกรอง — ป้ายกำกับซ้าย ช่องเลือกขวา */
function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:w-[7rem]">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function SelectField({
  allLabel,
  value,
  onChange,
  options,
  disabled,
}: {
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: OrgOption[];
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={allLabel}
      className="w-full bg-slate-50/80"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.nameTh || option.nameEn || option.code || option.id}
        </option>
      ))}
    </Select>
  );
}

function IssueSelect({
  value,
  onChange,
}: {
  value: AttendanceMonthlyReviewIssue | "";
  onChange: (value: AttendanceMonthlyReviewIssue | "") => void;
}) {
  return (
    <Select
      value={value}
      onChange={(event) =>
        onChange(event.target.value as AttendanceMonthlyReviewIssue | "")
      }
      aria-label="ประเด็นที่ต้องตรวจ"
      className="w-full bg-slate-50/80"
    >
      {monthlyIssueOptions.map((option) => (
        <option key={option.value || "ALL"} value={option.value}>
          {option.label} · {option.hint}
        </option>
      ))}
    </Select>
  );
}

function PaginationFooter({
  meta,
  loading,
  onPageChange,
}: {
  meta: PageMetaState;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, meta.totalPages || 1);
  const current = Math.min(Math.max(1, meta.page || 1), totalPages);

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
      <span className="text-[13px] text-slate-400">
        หน้า {current.toLocaleString("th-TH")} จาก{" "}
        {totalPages.toLocaleString("th-TH")} · ทั้งหมด{" "}
        {meta.total.toLocaleString("th-TH")} รายการ
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          disabled={loading || current <= 1}
          onClick={() => {
            onPageChange(current - 1);
            scrollPagerToTop();
          }}
        >
          ก่อนหน้า
        </Button>
        <Button
          size="sm"
          disabled={loading || current >= totalPages}
          onClick={() => {
            onPageChange(current + 1);
            scrollPagerToTop();
          }}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}

export default function HrReviewPage() {
  const { user } = useAuth();
  // 5rem = ความสูงแถบบนสุด — หัวตารางกับแถบชื่อสาขาจะไปค้างต่อจากแถบนั้น
  const { headRef, groupTop } = useStickyGroupTop("5rem");
  const scopeLevel = user?.scope?.level;
  const scopeCompanyId = user?.scope?.companyId ?? null;
  const scopeBranchId = user?.scope?.branchId ?? null;
  const scopeCompanyName = user?.scope?.companyName ?? null;
  const scopeBranchName = user?.scope?.branchName ?? null;
  const tenantScope = useMemo(() => {
    if (!scopeLevel) return undefined;

    return {
      level: scopeLevel,
      companyId: scopeCompanyId,
      branchId: scopeBranchId,
      companyName: scopeCompanyName,
      branchName: scopeBranchName,
    };
  }, [
    scopeBranchId,
    scopeBranchName,
    scopeCompanyId,
    scopeCompanyName,
    scopeLevel,
  ]);
  const userPermissions = user?.permissions ?? [];
  const canManageMonthlyReview = userPermissions.includes(
    "ATTENDANCE_RECALCULATE",
  );

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => ({
    search: "",
    companyId: "",
    branchId: "",
    departmentId: "",
    issue: "",
    ...buildCurrentPayrollPeriodRange(DEFAULT_PAYROLL_CUTOFF_POLICY),
  }));
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => ({
    search: "",
    companyId: "",
    branchId: "",
    departmentId: "",
    issue: "",
    ...buildCurrentPayrollPeriodRange(DEFAULT_PAYROLL_CUTOFF_POLICY),
  }));
  const [items, setItems] = useState<AttendanceMonthlyReviewItem[]>([]);
  const [pageMeta, setPageMeta] = useState<PageMetaState>(EMPTY_PAGE_META);
  const [currentPage, setCurrentPage] = useState(1);
  const [summary, setSummary] = useState<AttendanceMonthlyReviewListSummary>(
    EMPTY_MONTHLY_REVIEW_SUMMARY,
  );
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [periodActioning, setPeriodActioning] = useState<
    "ready" | "lock" | "recalculate" | null
  >(null);
  const [recalculationProgressId, setRecalculationProgressId] = useState<
    string | null
  >(null);
  const [recalculationProgress, setRecalculationProgress] =
    useState<AttendanceRecalculationProgressResponse | null>(null);
  const [recalculationProgressElapsedMs, setRecalculationProgressElapsedMs] =
    useState(0);
  const [
    recalculationProgressFallbackStartedAt,
    setRecalculationProgressFallbackStartedAt,
  ] = useState(0);
  const [recalculationProgressDismissed, setRecalculationProgressDismissed] =
    useState(true);
  const loadSequenceRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const lastDataLoadedAtRef = useRef(0);
  const lastHandledWorkflowChangedAtRef = useRef(0);
  const workflowRefreshTimerRef = useRef<number | null>(null);
  const pendingWorkflowChangedAtRef = useRef(0);
  const interactionBusyRef = useRef(false);
  const [detail, setDetail] =
    useState<AttendanceMonthlyReviewDetailResponse | null>(null);
  const [dailyActioningId, setDailyActioningId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );
  const [payrollPolicy, setPayrollPolicy] = useState<PayrollCutoffPolicy>(
    DEFAULT_PAYROLL_CUTOFF_POLICY,
  );
  const [payrollSettingsByCompanyId, setPayrollSettingsByCompanyId] = useState<
    Record<string, CompanyPayrollSetting>
  >({});
  const [payrollPolicyLoadingCompanyId, setPayrollPolicyLoadingCompanyId] =
    useState<string | null>(null);
  const [payrollPolicyError, setPayrollPolicyError] = useState<string | null>(
    null,
  );
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [payrollScopeLoaded, setPayrollScopeLoaded] = useState(false);
  const [companies, setCompanies] = useState<OrgOption[]>([]);
  const [branches, setBranches] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);

  const recalculationProgressVisible =
    !recalculationProgressDismissed &&
    (periodActioning === "recalculate" ||
      recalculationProgress?.status === "RUNNING" ||
      recalculationProgress?.status === "COMPLETED" ||
      recalculationProgress?.status === "FAILED" ||
      /* ไม่ใส่สองสถานะนี้ กล่องจะหายทันทีที่กดหยุด ดูเหมือนปุ่มไม่ทำงาน */
      recalculationProgress?.status === "CANCELLING" ||
      recalculationProgress?.status === "CANCELLED");
  const recalculationDisplayElapsedMs =
    recalculationProgressElapsedMs || recalculationProgress?.elapsedMs || 0;

  const loadCompanyPayrollPolicy = useCallback(
    async (companyId: string) => {
      if (!companyId) {
        setPayrollPolicy(DEFAULT_PAYROLL_CUTOFF_POLICY);
        setPayrollPolicyError(null);
        return DEFAULT_PAYROLL_CUTOFF_POLICY;
      }

      const cached = payrollSettingsByCompanyId[companyId];
      if (cached) {
        const nextPolicy = payrollPolicyFromCompanySetting(cached);
        setPayrollPolicy(nextPolicy);
        setPayrollPolicyError(null);
        return nextPolicy;
      }

      setPayrollPolicyLoadingCompanyId(companyId);
      setPayrollPolicyError(null);

      try {
        const setting = await getCompanyPayrollSetting(companyId);
        setPayrollSettingsByCompanyId((current) => ({
          ...current,
          [companyId]: setting,
        }));

        const nextPolicy = payrollPolicyFromCompanySetting(setting);
        setPayrollPolicy(nextPolicy);
        return nextPolicy;
      } catch (err) {
        setPayrollPolicyError(
          err instanceof Error
            ? err.message
            : "ไม่สามารถโหลดตั้งค่ารอบเงินเดือนของบริษัทนี้ได้",
        );
        return payrollPolicy;
      } finally {
        setPayrollPolicyLoadingCompanyId((current) =>
          current === companyId ? null : current,
        );
      }
    },
    [payrollPolicy, payrollSettingsByCompanyId],
  );

  const loadData = useCallback(
    async (
      nextFilters: FilterState,
      nextPage = 1,
      options: { silent?: boolean } = {},
    ) => {
      const normalizedFilters = applyAttendanceTenantScope(
        normalizeFilterRange(nextFilters),
        tenantScope,
      );
      const safePage = Math.max(1, nextPage);
      const silent = Boolean(options.silent);

      const requestId = loadSequenceRef.current + 1;
      loadSequenceRef.current = requestId;
      const requestStartedAt = Date.now();

      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        const response = await getAttendanceMonthlyReview({
          page: safePage,
          pageSize: PAGE_SIZE,
          search: normalizedFilters.search || undefined,
          companyId: normalizedFilters.companyId || undefined,
          branchId: normalizedFilters.branchId || undefined,
          departmentId: normalizedFilters.departmentId || undefined,
          issue: normalizedFilters.issue || undefined,
          dateFrom: normalizedFilters.dateFrom,
          dateTo: normalizedFilters.dateTo,
        });

        if (requestId !== loadSequenceRef.current) return;

        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        const nextItems = response.items ?? [];
        setItems(nextItems);
        setPageMeta({
          page: Number(response.meta?.page ?? safePage),
          pageSize: Number(response.meta?.pageSize ?? PAGE_SIZE),
          total: Number(response.meta?.total ?? nextItems.length),
          totalPages: Math.max(1, Number(response.meta?.totalPages ?? 1)),
        });
        setSummary(response.summary ?? buildMonthlySummaryFallback(nextItems));
        lastDataLoadedAtRef.current = requestStartedAt;
        if (
          pendingWorkflowChangedAtRef.current > 0 &&
          pendingWorkflowChangedAtRef.current <= requestStartedAt
        ) {
          lastHandledWorkflowChangedAtRef.current = Math.max(
            lastHandledWorkflowChangedAtRef.current,
            pendingWorkflowChangedAtRef.current,
          );
          pendingWorkflowChangedAtRef.current = 0;
        }
      } catch (err) {
        if (requestId !== loadSequenceRef.current) return;
        const message =
          err instanceof Error
            ? err.message
            : silent
              ? "อัปเดตข้อมูล HR Review ไม่สำเร็จ"
              : "ไม่สามารถโหลดข้อมูล HR Review ได้";
        if (!silent && !hasLoadedOnceRef.current) {
          setError(message);
        } else {
          toast.error(message);
        }
      } finally {
        if (requestId === loadSequenceRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [tenantScope],
  );

  useEffect(() => {
    if (!tenantScope) return;

    setDraftFilters((current) =>
      applyAttendanceTenantScope(current, tenantScope),
    );
    setAppliedFilters((current) =>
      applyAttendanceTenantScope(current, tenantScope),
    );
  }, [scopeBranchId, scopeCompanyId, scopeLevel, tenantScope]);

  // งวด + ตัวเลือกองค์กร + นโยบายรอบเงินเดือน ต้องโหลดพร้อมกันในรอบเดียว เพราะ
  // ช่วงวันที่เริ่มต้นของหน้านี้คำนวณจากนโยบายรอบเงินเดือนของบริษัท ถ้าแยกไปโหลด
  // ทีหลังจะได้ช่วงวันที่ตามค่า default (26-25) แทนค่าที่ตั้งไว้จริงที่หน้า
  // /payroll/compensation
  useEffect(() => {
    let active = true;

    async function loadPayrollScope() {
      try {
        const [
          periodResponse,
          companyResponse,
          branchResponse,
          departmentResponse,
        ] = await Promise.all([
          getPayrollPeriods({ page: 1, pageSize: 100 }),
          apiFetchWithMeta<OrgOption[], { totalPages?: number }>(
            "/organization/companies?pageSize=100",
          ),
          apiFetchWithMeta<OrgOption[], { totalPages?: number }>(
            "/organization/branches?pageSize=100",
          ),
          apiFetchWithMeta<OrgOption[], { totalPages?: number }>(
            "/organization/departments?pageSize=100",
          ),
        ]);

        if (!active) return;

        const scopedCompanies = filterCompaniesForAttendanceScope(
          companyResponse.data || [],
          tenantScope,
        );
        setCompanies(scopedCompanies);
        setBranches(
          filterBranchesForAttendanceScope(
            branchResponse.data || [],
            tenantScope,
          ),
        );
        setDepartments(
          filterOrgUnitsForAttendanceScope(
            departmentResponse.data || [],
            tenantScope,
          ),
        );

        // บริษัทที่ใช้อ้างอิงรอบเงินเดือนตอนเปิดหน้า: บริษัทตาม scope ของผู้ใช้
        // ถ้าเป็น GLOBAL แต่มองเห็นบริษัทเดียวก็ไม่กำกวม ใช้บริษัทนั้นได้เลย
        const initialCompanyId =
          (scopeLevel && scopeLevel !== "GLOBAL"
            ? (scopeCompanyId ?? "")
            : "") ||
          (scopedCompanies.length === 1 ? scopedCompanies[0].id : "");

        let nextPolicy: PayrollCutoffPolicy = DEFAULT_PAYROLL_CUTOFF_POLICY;

        if (initialCompanyId) {
          try {
            const setting = await getCompanyPayrollSetting(initialCompanyId);
            if (!active) return;

            setPayrollSettingsByCompanyId((current) => ({
              ...current,
              [initialCompanyId]: setting,
            }));
            nextPolicy = payrollPolicyFromCompanySetting(setting);
            setPayrollPolicy(nextPolicy);
            setPayrollPolicyError(null);
          } catch (err) {
            if (!active) return;
            setPayrollPolicyError(
              err instanceof Error
                ? err.message
                : "ไม่สามารถโหลดตั้งค่ารอบเงินเดือนของบริษัทนี้ได้",
            );
          }
        }

        const nextPeriods = periodResponse.data || [];
        const nextRange = resolveCurrentReviewRange(
          filterPeriodsByCompany(nextPeriods, initialCompanyId || undefined),
          nextPolicy,
        );
        setPayrollPeriods(nextPeriods);
        setDraftFilters((current) =>
          applyAttendanceTenantScope({ ...current, ...nextRange }, tenantScope),
        );
        setAppliedFilters((current) =>
          applyAttendanceTenantScope({ ...current, ...nextRange }, tenantScope),
        );
      } catch {
        if (!active) return;
      } finally {
        if (active) setPayrollScopeLoaded(true);
      }
    }

    void loadPayrollScope();

    return () => {
      active = false;
    };
  }, [scopeBranchId, scopeCompanyId, scopeLevel, tenantScope]);

  useEffect(() => {
    if (!payrollScopeLoaded) return;
    void loadData(appliedFilters, currentPage);
  }, [appliedFilters, currentPage, loadData, payrollScopeLoaded]);

  const scheduleWorkflowRefresh = useCallback(
    (changedAt: number, preferredDelay = WORKFLOW_REFRESH_DELAY_MS) => {
      const normalizedChangedAt = Number.isFinite(changedAt)
        ? changedAt
        : Date.now();

      if (
        normalizedChangedAt <= lastDataLoadedAtRef.current ||
        normalizedChangedAt <= lastHandledWorkflowChangedAtRef.current
      ) {
        return;
      }

      pendingWorkflowChangedAtRef.current = Math.max(
        pendingWorkflowChangedAtRef.current,
        normalizedChangedAt,
      );

      if (
        !payrollScopeLoaded ||
        typeof document === "undefined" ||
        document.visibilityState !== "visible" ||
        interactionBusyRef.current
      ) {
        return;
      }

      if (workflowRefreshTimerRef.current) {
        window.clearTimeout(workflowRefreshTimerRef.current);
      }

      workflowRefreshTimerRef.current = window.setTimeout(() => {
        workflowRefreshTimerRef.current = null;

        if (
          document.visibilityState !== "visible" ||
          interactionBusyRef.current
        ) {
          return;
        }

        const pendingChangedAt = pendingWorkflowChangedAtRef.current;
        if (pendingChangedAt <= 0) return;

        if (
          pendingChangedAt <= lastDataLoadedAtRef.current ||
          pendingChangedAt <= lastHandledWorkflowChangedAtRef.current
        ) {
          pendingWorkflowChangedAtRef.current = 0;
          return;
        }

        pendingWorkflowChangedAtRef.current = 0;
        lastHandledWorkflowChangedAtRef.current = pendingChangedAt;
        void loadData(appliedFilters, currentPage, { silent: true });
      }, preferredDelay);
    },
    [appliedFilters, currentPage, loadData, payrollScopeLoaded],
  );

  useEffect(() => {
    const busy = Boolean(
      submitting ||
      periodActioning ||
      dailyActioningId ||
      detail ||
      actionDialog,
    );
    interactionBusyRef.current = busy;

    if (!busy && pendingWorkflowChangedAtRef.current > 0) {
      scheduleWorkflowRefresh(pendingWorkflowChangedAtRef.current, 250);
    }
  }, [
    actionDialog,
    dailyActioningId,
    detail,
    periodActioning,
    scheduleWorkflowRefresh,
    submitting,
  ]);

  useEffect(() => {
    if (!payrollScopeLoaded) return;

    const unsubscribe = subscribeAttendanceWorkflowChanged(
      (payload) => {
        scheduleWorkflowRefresh(getAttendanceWorkflowChangedAt(payload));
      },
      { includeSameTab: false },
    );
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        pendingWorkflowChangedAtRef.current > 0
      ) {
        scheduleWorkflowRefresh(pendingWorkflowChangedAtRef.current, 250);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribe();
      if (workflowRefreshTimerRef.current) {
        window.clearTimeout(workflowRefreshTimerRef.current);
        workflowRefreshTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [payrollScopeLoaded, scheduleWorkflowRefresh]);

  useEffect(() => {
    if (!payrollScopeLoaded) return;

    const timer = window.setTimeout(() => {
      const normalizedFilters = applyAttendanceTenantScope(
        normalizeFilterRange(draftFilters),
        tenantScope,
      );
      if (
        filterStateKey(normalizedFilters) === filterStateKey(appliedFilters)
      ) {
        return;
      }
      setCurrentPage(1);
      setAppliedFilters(normalizedFilters);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [appliedFilters, draftFilters, payrollScopeLoaded, tenantScope]);

  /* งวดของบริษัทที่เลือกอยู่ ถ้ายังไม่เลือกบริษัทก็เอาทั้งหมด */
  const periodOptions = useMemo(
    () =>
      buildPeriodOptions(
        filterPeriodsByCompany(payrollPeriods, draftFilters.companyId),
        payrollPolicy,
      ),
    [payrollPeriods, draftFilters.companyId, payrollPolicy],
  );

  const selectedPeriodKey = rangeKey(
    draftFilters.dateFrom,
    draftFilters.dateTo,
  );

  /* ช่วงที่พิมพ์เองไม่ตรงงวดไหน ต้องมีตัวเลือกรองรับ ไม่งั้นดรอปดาวน์จะโชว์งวดผิด */
  const isCustomRange = !periodOptions.some(
    (option) => option.key === selectedPeriodKey,
  );

  const applyPeriodOption = (key: string) => {
    const option = periodOptions.find((item) => item.key === key);
    if (!option) return;

    const nextFilters = applyAttendanceTenantScope(
      {
        ...draftFilters,
        dateFrom: option.dateFrom,
        dateTo: option.dateTo,
      },
      tenantScope,
    );

    setDraftFilters(nextFilters);
    setCurrentPage(1);
    setAppliedFilters(nextFilters);
  };

  const movePeriod = (offset: number) => {
    const scopedPeriods = filterPeriodsByCompany(
      payrollPeriods,
      draftFilters.companyId,
    );
    const nextFilters = applyAttendanceTenantScope(
      {
        ...draftFilters,
        ...resolveShiftedReviewRange(
          scopedPeriods,
          draftFilters.dateFrom,
          offset,
          payrollPolicy,
        ),
      },
      tenantScope,
    );
    setDraftFilters(nextFilters);
    setCurrentPage(1);
    setAppliedFilters(nextFilters);
  };

  const metrics = summary;
  const readyPercent =
    metrics.total > 0
      ? Math.round((metrics.readyForPayroll / metrics.total) * 100)
      : 0;
  const isPeriodActionBusy = submitting || periodActioning !== null;

  const readinessByEmployeeId = useMemo(() => {
    const map = new Map<string, MonthlyReviewReadiness>();

    items.forEach((item) => {
      map.set(
        item.employeeId,
        getMonthlyReviewReadiness(
          item,
          appliedFilters.dateFrom,
          appliedFilters.dateTo,
        ),
      );
    });

    return map;
  }, [appliedFilters.dateFrom, appliedFilters.dateTo, items]);

  const readyCandidates = useMemo(
    () =>
      items.filter(
        (item) => readinessByEmployeeId.get(item.employeeId)?.canReady,
      ),
    [items, readinessByEmployeeId],
  );

  const departmentGroupRank = useMemo(
    () => buildAttendanceDepartmentGroupRank(items, (item) => item.employee),
    [items],
  );

  /*
   * ลำดับแถว: สาขา → แผนกตามกลุ่มการลงเวลา
   * (บริหาร → ลงครบ 3 รอบ → ยกเว้นเข้างานบ่าย → ยกเว้นรอบอื่น)
   * → ระดับตำแหน่ง (ผู้บริหารขึ้นก่อน) → รหัสพนักงาน
   * ต้องตรงกับหน้าตรวจเวลารายวัน เพราะ HR ไล่เทียบสองหน้านี้คู่กัน
   * (เรียงเฉพาะรายการในหน้าที่แสดงอยู่ ข้อมูลแบ่งหน้ามาจาก backend)
   */
  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const branchDiff = attendanceBranchSortText(
          left.employee,
        ).localeCompare(attendanceBranchSortText(right.employee), "th");
        if (branchDiff !== 0) return branchDiff;

        const departmentRankDiff =
          (departmentGroupRank.get(
            attendanceDepartmentGroupKey(left.employee),
          ) ?? 99) -
          (departmentGroupRank.get(
            attendanceDepartmentGroupKey(right.employee),
          ) ?? 99);
        if (departmentRankDiff !== 0) return departmentRankDiff;

        const departmentDiff = attendanceDepartmentSortText(
          left.employee,
        ).localeCompare(attendanceDepartmentSortText(right.employee), "th");
        if (departmentDiff !== 0) return departmentDiff;

        const groupDiff =
          getAttendanceSessionGroupRank(left.employee) -
          getAttendanceSessionGroupRank(right.employee);
        if (groupDiff !== 0) return groupDiff;

        const seniorityDiff = compareEmployeeSeniority(
          left.employee,
          right.employee,
        );
        if (seniorityDiff !== 0) return seniorityDiff;

        return (left.employee.employeeCode || "").localeCompare(
          right.employee.employeeCode || "",
        );
      }),
    [items, departmentGroupRank],
  );

  /** จำนวนคนของแต่ละหัวกลุ่ม — หนึ่งแถวคือหนึ่งคนอยู่แล้ว นับแถวได้ตรง ๆ */
  const groupEmployeeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of items) {
      for (const key of [
        attendanceBranchGroupKey(item.employee),
        attendanceDepartmentGroupKey(item.employee),
      ]) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return counts;
  }, [items]);

  const reviewQueueCount = useMemo(
    () =>
      items.filter((item) => {
        const readiness = readinessByEmployeeId.get(item.employeeId);
        if (!readiness) return false;
        if (
          readiness.canReady ||
          readiness.isAlreadyReady ||
          readiness.isLockedOrSent
        ) {
          return false;
        }
        return readiness.hasBlocker || item.status === "NEED_REVIEW";
      }).length,
    [items, readinessByEmployeeId],
  );

  const filteredBranches = useMemo(() => {
    if (!draftFilters.companyId) return branches;
    return branches.filter(
      (branch) =>
        !branch.companyId || branch.companyId === draftFilters.companyId,
    );
  }, [branches, draftFilters.companyId]);

  const filteredDepartments = useMemo(() => {
    return departments.filter((department) => {
      if (
        draftFilters.companyId &&
        department.companyId &&
        department.companyId !== draftFilters.companyId
      ) {
        return false;
      }
      if (
        draftFilters.branchId &&
        department.branchId &&
        department.branchId !== draftFilters.branchId
      ) {
        return false;
      }
      return true;
    });
  }, [departments, draftFilters.branchId, draftFilters.companyId]);

  // บริษัทที่นโยบายรอบเงินเดือนบนหน้านี้อ้างอิงอยู่จริง — ไม่ใช่แค่ค่าใน dropdown
  // เพราะผู้ใช้ที่ถูกจำกัด scope หรือระบบที่มีบริษัทเดียวก็ได้นโยบายบริษัทมาแล้ว
  const policyCompanyId =
    draftFilters.companyId ||
    (scopeLevel && scopeLevel !== "GLOBAL" ? (scopeCompanyId ?? "") : "") ||
    (companies.length === 1 ? companies[0].id : "");
  const selectedCompanyPayrollSetting = policyCompanyId
    ? payrollSettingsByCompanyId[policyCompanyId]
    : null;
  const selectedCompanyPolicyLoading =
    Boolean(policyCompanyId) &&
    payrollPolicyLoadingCompanyId === policyCompanyId;

  const rangeSource = resolveRangeSource(
    filterPeriodsByCompany(payrollPeriods, policyCompanyId || undefined),
    appliedFilters.dateFrom,
    appliedFilters.dateTo,
    payrollPolicy,
  );

  const handleCompanyFilterChange = async (companyId: string) => {
    const baseFilters = applyAttendanceTenantScope(
      {
        ...draftFilters,
        companyId,
        branchId: "",
        departmentId: "",
      },
      tenantScope,
    );

    // ล้างตัวกรองบริษัท: ถ้ายังเหลือบริษัทเดียวที่มองเห็นได้ นโยบายก็ยังไม่กำกวม
    // ให้คงรอบของบริษัทนั้นไว้ ไม่ต้องถอยไปใช้ค่า default ของระบบ
    const effectiveCompanyId =
      companyId || (companies.length === 1 ? companies[0].id : "");

    if (!effectiveCompanyId) {
      setPayrollPolicy(DEFAULT_PAYROLL_CUTOFF_POLICY);
      setDraftFilters(baseFilters);
      return;
    }

    const nextPolicy = await loadCompanyPayrollPolicy(effectiveCompanyId);
    const scopedPeriods = filterPeriodsByCompany(payrollPeriods, companyId);
    const nextRange = resolveCurrentReviewRange(scopedPeriods, nextPolicy);

    setDraftFilters(
      applyAttendanceTenantScope(
        {
          ...baseFilters,
          ...nextRange,
        },
        tenantScope,
      ),
    );
  };

  const handlePageChange = (nextPage: number) => {
    const safePage = Math.min(Math.max(1, nextPage), pageMeta.totalPages || 1);
    if (safePage === currentPage || loading) return;
    setCurrentPage(safePage);
  };

  const activeAdvancedFilterCount = [
    scopeLevel === "GLOBAL" ? draftFilters.companyId : "",
    scopeLevel !== "BRANCH" ? draftFilters.branchId : "",
    draftFilters.departmentId,
  ].filter(Boolean).length;

  /* คำอธิบายสั้น ๆ ว่ากำลังกรองด้วยอะไรอยู่ — ผู้ใช้จะได้ไม่ต้องเปิดป๊อปอัพมาดู */
  const filterSummary = (() => {
    const orgName = (options: OrgOption[], id: string) => {
      if (!id) return "";
      const found = options.find((option) => option.id === id);
      return found
        ? found.nameTh || found.nameEn || found.code || found.id
        : "";
    };

    return [
      draftFilters.issue
        ? monthlyIssueOptions.find(
            (option) => option.value === draftFilters.issue,
          )?.label
        : "",
      orgName(companies, draftFilters.companyId),
      orgName(filteredBranches, draftFilters.branchId),
      orgName(filteredDepartments, draftFilters.departmentId),
      draftFilters.search.trim(),
    ].filter(Boolean) as string[];
  })();

  const applyCurrentPeriod = () => {
    const scopedPeriods = filterPeriodsByCompany(
      payrollPeriods,
      draftFilters.companyId,
    );
    const nextRange = resolveCurrentReviewRange(scopedPeriods, payrollPolicy);
    const nextFilters = applyAttendanceTenantScope(
      { ...draftFilters, ...nextRange },
      tenantScope,
    );
    setDraftFilters(nextFilters);
    setCurrentPage(1);
    setAppliedFilters(
      applyAttendanceTenantScope(
        normalizeFilterRange(nextFilters),
        tenantScope,
      ),
    );
  };

  const clearAdvancedFilters = () => {
    setDraftFilters((current) =>
      applyAttendanceTenantScope(
        {
          ...current,
          companyId: "",
          branchId: "",
          departmentId: "",
        },
        tenantScope,
      ),
    );
  };

  const openDetail = async (employeeId: string) => {
    try {
      setSubmitting(true);
      const response = await getAttendanceMonthlyReviewDetail(employeeId, {
        dateFrom: appliedFilters.dateFrom,
        dateTo: appliedFilters.dateTo,
      });
      setDetail(response);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "โหลดรายละเอียดไม่สำเร็จ",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const refreshDetailAndList = async () => {
    if (!detail) return;

    const refreshedDetail = await getAttendanceMonthlyReviewDetail(
      detail.employeeId,
      {
        dateFrom: appliedFilters.dateFrom,
        dateTo: appliedFilters.dateTo,
      },
    );
    setDetail(refreshedDetail);
    void loadData(appliedFilters, currentPage, { silent: true });
  };

  const handleDailyReviewFromMonthlyDetail = async (
    summary: AttendanceDailySummary,
  ) => {
    if (!detail) return;

    try {
      setDailyActioningId(summary.id);
      await markAttendanceDailySummaryReviewed(summary.id, {
        note: "ตรวจแล้วจากหน้า HR Review รายวัน",
      });

      await refreshDetailAndList();
      toast.success("บันทึกตรวจแล้วสำหรับรายการรายวันแล้ว");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "บันทึกตรวจแล้วไม่สำเร็จ",
      );
    } finally {
      setDailyActioningId(null);
    }
  };

  const handleCancelDailyReviewFromMonthlyDetail = async (
    summary: AttendanceDailySummary,
  ) => {
    if (!detail) return;

    try {
      setDailyActioningId(summary.id);
      await cancelAttendanceDailySummaryReviewed(summary.id, {
        note: "ยกเลิกการตรวจจากหน้า HR Review รายวัน",
      });

      await refreshDetailAndList();
      toast.success("ยกเลิกสถานะตรวจแล้วสำหรับรายการรายวันแล้ว");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "ยกเลิกสถานะตรวจแล้วไม่สำเร็จ",
      );
    } finally {
      setDailyActioningId(null);
    }
  };

  const applyAction = async (
    item: AttendanceMonthlyReviewItem,
    type: "ready" | "lock",
  ) => {
    setActionDialog({
      title: type === "ready" ? "พร้อมส่งเข้า Payroll" : "ล็อกข้อมูลงวดนี้",
      description: `ยืนยันการอัปเดตสำหรับ ${employeeName(item)} งวด ${formatThaiDate(appliedFilters.dateFrom)} - ${formatThaiDate(appliedFilters.dateTo)}`,
      confirmLabel: "ยืนยัน",
      cancelLabel: "ยกเลิก",
      tone: type === "lock" ? "orange" : "blue",
      onConfirm: async () => {
        try {
          setSubmitting(true);
          if (type === "ready") {
            await markAttendanceMonthlyReviewReadyForPayroll({
              employeeIds: [item.employeeId],
              dateFrom: appliedFilters.dateFrom,
              dateTo: appliedFilters.dateTo,
            });
          } else {
            await lockAttendanceMonthlyReview({
              employeeIds: [item.employeeId],
              dateFrom: appliedFilters.dateFrom,
              dateTo: appliedFilters.dateTo,
            });
          }
          toast.success("บันทึกสำเร็จ");
          void loadData(appliedFilters, currentPage, { silent: true });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        } finally {
          setSubmitting(false);
          setActionDialog(null);
        }
      },
    });
  };

  const buildPeriodActionPayload = () => {
    const scopedFilters = applyAttendanceTenantScope(
      appliedFilters,
      tenantScope,
    );

    return {
      dateFrom: scopedFilters.dateFrom,
      dateTo: scopedFilters.dateTo,
      search: scopedFilters.search || undefined,
      companyId: scopedFilters.companyId || undefined,
      branchId: scopedFilters.branchId || undefined,
      departmentId: scopedFilters.departmentId || undefined,
      issue: scopedFilters.issue || undefined,
    };
  };

  const handlePeriodReadyForPayroll = () => {
    if (!canManageMonthlyReview) {
      toast.error("บัญชีนี้ไม่มีสิทธิ์ส่งข้อมูล HR Review เข้า Payroll");
      return;
    }

    if (pageMeta.total === 0) {
      toast.warning("ยังไม่มีพนักงานในงวดและตัวกรองนี้");
      return;
    }

    setActionDialog({
      title: "พร้อมเข้า Payroll ทั้งงวด",
      description: `ระบบจะทำเครื่องหมาย “พร้อมเข้า Payroll” ให้พนักงานทุกคนที่ผ่านเงื่อนไขในงวด ${formatThaiDate(
        appliedFilters.dateFrom,
      )} - ${formatThaiDate(
        appliedFilters.dateTo,
      )} ตามตัวกรองปัจจุบัน โดยจะข้ามรายการที่ข้อมูลไม่ครบ ต้องตรวจสอบ รออนุมัติ ถูกล็อก หรือส่งเข้า Payroll แล้ว`,
      confirmLabel: "ยืนยันพร้อมเข้า Payroll ทั้งงวด",
      cancelLabel: "ยกเลิก",
      tone: "blue",
      onConfirm: async () => {
        try {
          setSubmitting(true);
          setPeriodActioning("ready");
          const result =
            await markAttendanceMonthlyReviewReadyForPayrollByPeriod(
              buildPeriodActionPayload(),
            );
          const employeeCount = Number(result.employeeCount ?? 0);
          if (employeeCount === 0) {
            toast.warning(
              "ยังไม่มีพนักงานที่พร้อมเข้า Payroll ในงวดและตัวกรองนี้",
            );
          } else {
            toast.success(
              `ทำเครื่องหมายพร้อมเข้า Payroll ทั้งงวดแล้ว ${employeeCount.toLocaleString(
                "th-TH",
              )} คน`,
            );
          }
          void loadData(appliedFilters, currentPage, { silent: true });
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "ส่งเข้า Payroll ทั้งงวดไม่สำเร็จ",
          );
        } finally {
          setSubmitting(false);
          setPeriodActioning(null);
          setActionDialog(null);
        }
      },
    });
  };

  const handlePeriodLock = () => {
    if (!canManageMonthlyReview) {
      toast.error("บัญชีนี้ไม่มีสิทธิ์ล็อกข้อมูล HR Review");
      return;
    }

    if (pageMeta.total === 0) {
      toast.warning("ยังไม่มีพนักงานในงวดและตัวกรองนี้");
      return;
    }

    setActionDialog({
      title: "ล็อกทั้งงวด",
      description: `ระบบจะล็อกพนักงานทุกคนที่พร้อมเข้า Payroll แล้วในงวด ${formatThaiDate(
        appliedFilters.dateFrom,
      )} - ${formatThaiDate(
        appliedFilters.dateTo,
      )} ตามตัวกรองปัจจุบัน โดยจะข้ามรายการที่ยังไม่พร้อม ข้อมูลไม่ครบ รออนุมัติ ถูกล็อก หรือส่งเข้า Payroll แล้ว`,
      confirmLabel: "ยืนยันล็อกทั้งงวด",
      cancelLabel: "ยกเลิก",
      tone: "orange",
      onConfirm: async () => {
        try {
          setSubmitting(true);
          setPeriodActioning("lock");
          const result = await lockAttendanceMonthlyReviewByPeriod(
            buildPeriodActionPayload(),
          );
          const employeeCount = Number(result.employeeCount ?? 0);
          if (employeeCount === 0) {
            toast.warning("ยังไม่มีพนักงานที่พร้อมให้ล็อกในงวดและตัวกรองนี้");
          } else {
            toast.success(
              `ล็อกข้อมูลทั้งงวดแล้ว ${employeeCount.toLocaleString(
                "th-TH",
              )} คน`,
            );
          }
          void loadData(appliedFilters, currentPage, { silent: true });
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "ล็อกทั้งงวดไม่สำเร็จ",
          );
        } finally {
          setSubmitting(false);
          setPeriodActioning(null);
          setActionDialog(null);
        }
      },
    });
  };

  /* ขอหยุดการคำนวณ — ระบบหยุดที่ขอบของกลุ่มถัดไป รายการที่ทำไปแล้วยังถูกต้อง */
  const [recalculationCancelling, setRecalculationCancelling] = useState(false);

  async function handleCancelRecalculation() {
    if (!recalculationProgressId || recalculationCancelling) return;

    setRecalculationCancelling(true);
    try {
      const next = await cancelAttendanceRecalculation(recalculationProgressId);
      setRecalculationProgress(next);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "หยุดการคำนวณไม่สำเร็จ",
      );
      setRecalculationCancelling(false);
    }
  }

  useEffect(() => {
    if (!recalculationProgressId || periodActioning !== "recalculate") {
      return undefined;
    }

    const progressId = recalculationProgressId;
    let cancelled = false;

    async function pollProgress() {
      try {
        const result = await getAttendanceRecalculationProgress(progressId);
        if (!cancelled) {
          setRecalculationProgress(result);
        }
      } catch {
        // The POST request can reach the backend before the first progress poll.
      }
    }

    void pollProgress();
    const timer = window.setInterval(() => {
      void pollProgress();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [periodActioning, recalculationProgressId]);

  useEffect(() => {
    if (!recalculationProgressVisible) return undefined;

    const updateElapsed = () => {
      const startedAt = recalculationProgress?.startedAt
        ? Date.parse(recalculationProgress.startedAt)
        : recalculationProgressFallbackStartedAt;

      setRecalculationProgressElapsedMs(
        startedAt && Number.isFinite(startedAt)
          ? Math.max(0, Date.now() - startedAt)
          : 0,
      );
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(timer);
  }, [
    recalculationProgress?.startedAt,
    recalculationProgressFallbackStartedAt,
    recalculationProgressVisible,
  ]);

  useEffect(() => {
    if (
      periodActioning === "recalculate" ||
      recalculationProgress?.status !== "COMPLETED"
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRecalculationProgressDismissed(true);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [periodActioning, recalculationProgress?.status]);

  const handleRecalculate = () => {
    if (!canManageMonthlyReview) {
      toast.error("บัญชีนี้ไม่มีสิทธิ์คำนวณข้อมูล HR Review ใหม่");
      return;
    }

    const normalizedFilters = applyAttendanceTenantScope(
      normalizeFilterRange(appliedFilters),
      tenantScope,
    );
    const scopeDetails = [
      normalizedFilters.companyId ? "บริษัทที่กรองไว้" : null,
      normalizedFilters.branchId ? "สาขาที่กรองไว้" : null,
      normalizedFilters.departmentId ? "แผนกที่กรองไว้" : null,
    ].filter(Boolean);

    setActionDialog({
      title: "ยืนยันคำนวณข้อมูล HR Review ใหม่",
      description: `ระบบจะคำนวณ Attendance ใหม่ตามช่วงและตัวกรองที่แสดงอยู่จริงในตาราง (${formatThaiDate(
        normalizedFilters.dateFrom,
      )} - ${formatThaiDate(normalizedFilters.dateTo)})${
        scopeDetails.length ? ` เฉพาะ${scopeDetails.join(" / ")}` : " ทั้งงวด"
      } การคำนวณนี้อาจใช้เวลาสักครู่และจะไม่แก้รายการที่ถูกล็อกแล้ว`,
      confirmLabel: "ยืนยันคำนวณใหม่",
      cancelLabel: "ยกเลิก",
      tone: "orange",
      onConfirm: async () => {
        const progressId = createAttendanceProgressId();
        const startedAt = new Date().toISOString();

        setActionDialog(null);
        setSubmitting(true);
        setPeriodActioning("recalculate");
        setRecalculationProgressId(progressId);
        setRecalculationProgressElapsedMs(0);
        setRecalculationProgressDismissed(false);
        setRecalculationCancelling(false);
        setRecalculationProgressFallbackStartedAt(Date.now());
        setRecalculationProgress({
          progressId,
          status: "RUNNING",
          step: "PREPARE",
          message: "กำลังส่งคำขอคำนวณ Attendance ไปยัง backend",
          percent: 2,
          processedItems: 0,
          totalItems: 0,
          employeeCount: 0,
          dayCount: 0,
          startedAt,
          updatedAt: startedAt,
          completedAt: null,
          elapsedMs: 0,
          errorMessage: null,
          result: null,
        });

        try {
          const result = await recalculateAttendanceDailySummaries({
            progressId,
            dateFrom: normalizedFilters.dateFrom,
            dateTo: normalizedFilters.dateTo,
            companyId: normalizedFilters.companyId || undefined,
            branchId: normalizedFilters.branchId || undefined,
            departmentId: normalizedFilters.departmentId || undefined,
            force: true,
          });

          try {
            const finalProgress =
              await getAttendanceRecalculationProgress(progressId);
            setRecalculationProgress(finalProgress);
          } catch {
            const completedAt = new Date().toISOString();
            setRecalculationProgress((current) => ({
              ...(current ?? {
                progressId,
                startedAt,
                updatedAt: completedAt,
                employeeCount: result.employeeCount,
                dayCount: result.dayCount,
                totalItems: result.employeeCount * result.dayCount,
                processedItems: result.employeeCount * result.dayCount,
                elapsedMs: 0,
              }),
              progressId,
              status: "COMPLETED",
              step: "COMPLETED",
              message: "คำนวณ Attendance เสร็จสิ้น",
              percent: 100,
              processedItems: result.employeeCount * result.dayCount,
              totalItems: result.employeeCount * result.dayCount,
              employeeCount: result.employeeCount,
              dayCount: result.dayCount,
              updatedAt: completedAt,
              completedAt,
              errorMessage: null,
              result: {
                calculated: result.calculated,
                skippedLocked: result.skippedLocked,
                errorCount: result.errorCount ?? 0,
              },
            }));
          }

          setDraftFilters(normalizedFilters);
          setAppliedFilters(normalizedFilters);
          await loadData(normalizedFilters, currentPage, { silent: true });
          /* สั่งหยุดกลางทางไม่ใช่ความสำเร็จ ห้ามขึ้นข้อความว่าคำนวณเสร็จ */
          if (result.cancelled) {
            toast.info(
              `หยุดการคำนวณแล้ว — คำนวณไปได้ ${result.calculated.toLocaleString("th-TH")} รายการ`,
            );
          } else {
            toast.success("คำนวณข้อมูล Attendance ของงวดนี้ใหม่แล้ว");
          }
        } catch (err) {
          try {
            const failedProgress =
              await getAttendanceRecalculationProgress(progressId);
            setRecalculationProgress(failedProgress);
          } catch {
            const completedAt = new Date().toISOString();
            const errorMessage =
              err instanceof Error ? err.message : "คำนวณ Attendance ไม่สำเร็จ";
            setRecalculationProgress((current) => ({
              ...(current ?? {
                progressId,
                startedAt,
                updatedAt: completedAt,
                processedItems: 0,
                totalItems: 0,
                employeeCount: 0,
                dayCount: 0,
                elapsedMs: 0,
                result: null,
              }),
              progressId,
              status: "FAILED",
              step: "FAILED",
              message: "คำนวณ Attendance ไม่สำเร็จ",
              percent: current?.percent ?? 0,
              updatedAt: completedAt,
              completedAt,
              errorMessage,
              result: current?.result ?? null,
            }));
          }
          toast.error(
            err instanceof Error ? err.message : "คำนวณใหม่ไม่สำเร็จ",
          );
        } finally {
          setSubmitting(false);
          setPeriodActioning(null);
        }
      },
    });
  };

  if (loading && !hasLoadedOnce)
    return (
      <LoadingState
        title="กำลังโหลดข้อมูล HR Review"
        description="กรุณารอสักครู่"
      />
    );
  if (error && !hasLoadedOnce) {
    return (
      <ErrorState
        title="โหลดข้อมูลไม่สำเร็จ"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadData(appliedFilters, currentPage)}
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            โหลดใหม่
          </button>
        }
      />
    );
  }

  return (
    <PageSurface className="xl:overflow-visible">
      <PageHeading
        heroMotif="payroll-review"
        eyebrow="HR Review"
        title="ตรวจสรุปก่อน"
        titleAccent="คำนวณเงินเดือน"
        description="ตรวจความครบถ้วนของข้อมูลลงเวลา ลา นอกสถานที่ OT และยอดหักของงวด แล้วทำเครื่องหมายพร้อมล็อกก่อนส่งต่อเข้า Payroll"
        actions={
          <>
            <div className={TILE_BOX}>
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="พนักงานในงวด"
                value={numberText(metrics.total)}
                helper="มีข้อมูลในงวดนี้"
              />
              <StatTile
                icon={<AlertTriangle className="h-4 w-4" />}
                label="ต้องตรวจต่อ"
                value={numberText(reviewQueueCount)}
                tone={reviewQueueCount > 0 ? "warning" : "positive"}
                helper="กลับไปเคลียร์ที่หน้าลงเวลา"
              />
              <StatTile
                icon={<ShieldCheck className="h-4 w-4" />}
                label="ส่งได้ตอนนี้"
                value={numberText(readyCandidates.length)}
                tone={readyCandidates.length > 0 ? "positive" : "neutral"}
                helper={`พร้อมเข้า Payroll แล้ว ${numberText(metrics.readyForPayroll)}`}
              />
              <StatTile
                icon={<Wallet className="h-4 w-4" />}
                label="ยอดหักรวม"
                value={`${money(metrics.totalDeductionAmount)} บาท`}
                helper={`พร้อมล็อก ${readyPercent}% ของงวด`}
              />
            </div>
          </>
        }
      />

      {rangeSource.period &&
      !rangeSource.matchesPolicy &&
      rangeSource.policyRange ? (
        <div className="border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
          <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
            ช่วงวันที่ของงวด {rangeSource.period.code} ไม่ตรงกับนโยบายวันตัดรอบ{" "}
            {buildPayrollPolicyLabel(payrollPolicy)} (
            {formatThaiDate(rangeSource.policyRange.dateFrom)} –{" "}
            {formatThaiDate(rangeSource.policyRange.dateTo)}) —{" "}
            <Link
              href="/payroll/employees"
              className="font-semibold underline underline-offset-2"
            >
              ตั้งค่ารอบเงินเดือน
            </Link>
          </Notice>
        </div>
      ) : null}

      {payrollPolicyError ? (
        <div className="border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
          <Notice tone="critical">{payrollPolicyError}</Notice>
        </div>
      ) : null}

      {/*
       * แถบเครื่องมือ — โทนเดียวกับหน้า /attendance
       * บนแถบเหลือของที่ใช้ตลอดเวลา: เลือกงวด, ปุ่มตัวกรอง, สรุปว่ากรองด้วยอะไรอยู่
       * และปุ่มที่ลงมือทำทั้งงวด ส่วนตัวกรองที่เหลืออยู่ในป๊อปอัพ
       *
       * พื้นเทาอ่อนทำให้แถบคั่นตัวเองออกจากหัวเรื่องด้านบนและตารางด้านล่าง
       * โดยไม่ต้องมีหัวข้อซ้ำกับชื่อหน้า
       */}
      {/*
       * แถบเครื่องมือแบ่งเป็นสองคอลัมน์ ยึดขอบบนเดียวกัน
       *   ซ้าย = บริบท   — กำลังตรวจงวดไหน ช่วงวันที่มาจากไหน กรองด้วยอะไรอยู่
       *   ขวา  = การกระทำ — จำนวนที่พบ ปุ่มตัวกรอง และปุ่มที่ลงมือกับทั้งงวด
       * แต่ละคอลัมน์เรียงในตัวเองเป็นชั้น ๆ ไม่ปนกันในแถวเดียวจนตกบรรทัดมั่ว
       */}
      {/*
       * แถบเครื่องมือแบ่งเป็นสองชั้นตามชนิดของสิ่งที่อยู่ ไม่ใช่ซ้าย-ขวา
       *   ชั้นบน = ของที่กดได้ทั้งหมด  (เลือกงวด · ตัวกรอง | ปุ่มที่ทำกับทั้งงวด)
       *   ชั้นล่าง = ข้อความบอกสถานะ   (ช่วงวันที่มาจากไหน กรองด้วยอะไร ได้กี่รายการ)
       * ตาจึงกวาดชั้นเดียวก็เจอปุ่มครบ ไม่ต้องไล่หาว่าปุ่มไหนไปอยู่มุมไหน
       */}
      <div className="border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/*
           * เลือกงวดอย่างเดียว ไม่มีช่องวันที่ให้พิมพ์เอง — ช่วงวันที่ของงวดอยู่ในชื่อรายการแล้ว
           * และการตรวจก่อนเข้าเงินเดือนต้องตรงกับงวดที่จะจ่ายเสมอ ช่องวันที่อิสระมีแต่ทำให้
           * ตรวจคร่อมงวดโดยไม่ตั้งใจ
           */}
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              size="md"
              title="งวดก่อนหน้า"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => movePeriod(-1)}
            />

            <div className="w-[21rem]">
              <Select
                value={isCustomRange ? "" : selectedPeriodKey}
                onChange={(event) => applyPeriodOption(event.target.value)}
                aria-label="เลือกงวด"
              >
                {isCustomRange ? (
                  <option value="">
                    {`${formatThaiDate(draftFilters.dateFrom)} – ${formatThaiDate(draftFilters.dateTo)}`}
                  </option>
                ) : null}
                {periodOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <IconButton
              size="md"
              title="งวดถัดไป"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => movePeriod(1)}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button onClick={applyCurrentPeriod} title="กลับไปงวดปัจจุบัน">
              งวดนี้
            </Button>

            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition 3xl:h-10",
                activeAdvancedFilterCount > 0
                  ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              ตัวกรอง
              {activeAdvancedFilterCount > 0 ? (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold tabular-nums text-white">
                  {numberText(activeAdvancedFilterCount)}
                </span>
              ) : null}
            </button>
          </div>

          {/* ปุ่มที่ทำกับทั้งงวดอยู่ชิดขวาสุด แยกจากของที่ใช้เลือกขอบเขต */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              icon={<RefreshCcw className="h-3.5 w-3.5" />}
              loading={periodActioning === "recalculate"}
              disabled={!canManageMonthlyReview || isPeriodActionBusy}
              title={
                canManageMonthlyReview
                  ? "คำนวณใหม่ตามช่วงและตัวกรองที่แสดงอยู่"
                  : "ต้องมีสิทธิ์ ATTENDANCE_RECALCULATE"
              }
              onClick={handleRecalculate}
            >
              คำนวณใหม่ทั้งงวด
            </Button>

            <Button
              icon={<LockKeyhole className="h-3.5 w-3.5" />}
              loading={periodActioning === "lock"}
              disabled={
                !canManageMonthlyReview ||
                pageMeta.total === 0 ||
                isPeriodActionBusy
              }
              title={
                !canManageMonthlyReview
                  ? "ต้องมีสิทธิ์ ATTENDANCE_RECALCULATE"
                  : pageMeta.total === 0
                    ? "ยังไม่มีพนักงานในงวดนี้"
                    : "ล็อกทุกคนที่พร้อมเข้า Payroll แล้วในงวดและตัวกรองนี้"
              }
              onClick={handlePeriodLock}
            >
              ล็อกทั้งงวด
            </Button>

            <Button
              variant="primary"
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              loading={periodActioning === "ready"}
              disabled={
                !canManageMonthlyReview ||
                pageMeta.total === 0 ||
                isPeriodActionBusy
              }
              title={
                !canManageMonthlyReview
                  ? "ต้องมีสิทธิ์ ATTENDANCE_RECALCULATE"
                  : pageMeta.total === 0
                    ? "ยังไม่มีพนักงานในงวดนี้"
                    : "ทำเครื่องหมายพร้อมเข้า Payroll ให้ทุกคนที่ผ่านเงื่อนไขในงวดและตัวกรองนี้"
              }
              onClick={handlePeriodReadyForPayroll}
            >
              พร้อมเข้า Payroll ทั้งงวด
            </Button>
          </div>
        </div>

        {/*
         * บอกว่าช่วงวันที่ที่เห็นมาจากไหน (งวดจริง หรือคำนวณจากนโยบายวันตัดรอบ)
         * ต่อด้วยตัวกรองที่ทำงานอยู่ — เดิมข้อมูลนี้เป็นป้ายสามใบใต้หัวเรื่อง
         */}
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-slate-200/80 pt-2">
          <p className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
            {[
              rangeSource.period
                ? `ตามงวด ${rangeSource.period.code}`
                : `ตามนโยบายวันตัดรอบ ${buildPayrollPolicyLabel(payrollPolicy)}`,
              selectedCompanyPolicyLoading
                ? "กำลังโหลดนโยบายรอบเงินเดือน…"
                : payrollSettingSourceLabel(selectedCompanyPayrollSetting),
              ...filterSummary,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <p className="shrink-0 text-[12px] tabular-nums text-slate-500">
            พบ {numberText(pageMeta.total)} รายการ
          </p>
        </div>
      </div>

      {/* ตัวกรองทั้งหมด — เลือกแล้วมีผลทันที ไม่ต้องกดยืนยัน */}
      {filterOpen ? (
        <Modal
          open
          size="sm"
          title="ตัวกรอง"
          description="เลือกแล้วรายการจะอัปเดตให้เอง"
          footer={
            <>
              {activeAdvancedFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearAdvancedFilters}
                  className="mr-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  <X className="h-3.5 w-3.5" />
                  ล้างตัวกรอง {numberText(activeAdvancedFilterCount)}
                </button>
              ) : null}

              <Button variant="primary" onClick={() => setFilterOpen(false)}>
                เสร็จสิ้น
              </Button>
            </>
          }
          onClose={() => setFilterOpen(false)}
        >
          <div className="space-y-3.5">
            <FilterRow label="ค้นหา">
              <div className="[&_input]:bg-slate-50/80 [&_input:focus]:bg-white">
                <SearchInput
                  value={draftFilters.search}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      search: event.target.value,
                    }))
                  }
                  placeholder="ชื่อ รหัสพนักงาน แผนก"
                  className="w-full"
                  aria-label="ค้นหาพนักงาน"
                />
              </div>
            </FilterRow>

            <FilterRow label="ประเด็นที่ต้องตรวจ">
              <IssueSelect
                value={draftFilters.issue}
                onChange={(issue) =>
                  setDraftFilters((current) => ({ ...current, issue }))
                }
              />
            </FilterRow>

            <FilterRow label="บริษัท">
              <SelectField
                allLabel="ทุกบริษัท"
                value={draftFilters.companyId}
                onChange={(companyId) =>
                  void handleCompanyFilterChange(companyId)
                }
                options={companies}
              />
            </FilterRow>

            <FilterRow label="สาขา">
              <SelectField
                allLabel="ทุกสาขา"
                value={draftFilters.branchId}
                onChange={(branchId) =>
                  setDraftFilters((current) => ({
                    ...current,
                    branchId,
                    departmentId: "",
                  }))
                }
                options={filteredBranches}
                disabled={!filteredBranches.length}
              />
            </FilterRow>

            <FilterRow label="แผนก">
              <SelectField
                allLabel="ทุกแผนก"
                value={draftFilters.departmentId}
                onChange={(departmentId) =>
                  setDraftFilters((current) => ({ ...current, departmentId }))
                }
                options={filteredDepartments}
                disabled={!filteredDepartments.length}
              />
            </FilterRow>
          </div>
        </Modal>
      ) : null}

      <div>
        {items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="ไม่พบข้อมูลสรุปรายเดือน"
              description="ลองคำนวณงวดนี้ใหม่ หรือขยายช่วงวันที่"
            />
          </div>
        ) : (
          <div className="overflow-hidden xl:overflow-visible">
            <table className="w-full table-fixed border-collapse text-[13px] 3xl:text-[13.5px]">
              <thead ref={headRef} className="bg-white text-left">
                <tr className="border-b border-slate-200">
                  <th className="w-[24%] whitespace-nowrap border-b border-slate-300 bg-slate-50 px-5 py-3.5 text-[12.5px] font-semibold tracking-normal text-slate-700 3xl:px-6 3xl:py-4 3xl:text-[13px] 4xl:px-7 4xl:py-[1.125rem] 4xl:text-[13.5px] xl:sticky xl:top-20 xl:z-20 xl:shadow-[inset_0_-1px_0_#cbd5e1]">
                    พนักงาน / ข้อมูลพื้นฐาน
                  </th>
                  <th className="w-[24%] whitespace-nowrap border-b border-slate-300 bg-slate-50 px-5 py-3.5 text-[12.5px] font-semibold tracking-normal text-slate-700 3xl:px-6 3xl:py-4 3xl:text-[13px] 4xl:px-7 4xl:py-[1.125rem] 4xl:text-[13.5px] xl:sticky xl:top-20 xl:z-20 xl:shadow-[inset_0_-1px_0_#cbd5e1]">
                    รายการผิดปกติ
                  </th>
                  <th className="w-[17%] whitespace-nowrap border-b border-slate-300 bg-slate-50 px-5 py-3.5 text-[12.5px] font-semibold tracking-normal text-slate-700 3xl:px-6 3xl:py-4 3xl:text-[13px] 4xl:px-7 4xl:py-[1.125rem] 4xl:text-[13.5px] xl:sticky xl:top-20 xl:z-20 xl:shadow-[inset_0_-1px_0_#cbd5e1]">
                    ผลต่อ Payroll
                  </th>
                  <th className="w-[18%] whitespace-nowrap border-b border-slate-300 bg-slate-50 px-5 py-3.5 text-[12.5px] font-semibold tracking-normal text-slate-700 3xl:px-6 3xl:py-4 3xl:text-[13px] 4xl:px-7 4xl:py-[1.125rem] 4xl:text-[13.5px] xl:sticky xl:top-20 xl:z-20 xl:shadow-[inset_0_-1px_0_#cbd5e1]">
                    สถานะ
                  </th>
                  <th className="w-[17%] whitespace-nowrap border-b border-slate-300 bg-slate-50 px-5 py-3.5 text-[12.5px] font-semibold tracking-normal text-slate-700 3xl:px-6 3xl:py-4 3xl:text-[13px] 4xl:px-7 4xl:py-[1.125rem] 4xl:text-[13.5px] xl:sticky xl:top-20 xl:z-20 xl:shadow-[inset_0_-1px_0_#cbd5e1]">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item, index) => {
                  const previous = index > 0 ? sortedItems[index - 1] : null;
                  const branchKey = attendanceBranchGroupKey(item.employee);
                  const departmentKey = attendanceDepartmentGroupKey(
                    item.employee,
                  );
                  const branchChanged =
                    !previous ||
                    attendanceBranchGroupKey(previous.employee) !== branchKey;
                  // สาขาเปลี่ยนแล้วต้องขึ้นหัวแผนกใหม่ด้วย เพราะถือว่าเป็นคนละกลุ่มแล้ว
                  const departmentChanged =
                    branchChanged ||
                    !previous ||
                    attendanceDepartmentGroupKey(previous.employee) !==
                      departmentKey;

                  const readiness =
                    readinessByEmployeeId.get(item.employeeId) ??
                    getMonthlyReviewReadiness(
                      item,
                      appliedFilters.dateFrom,
                      appliedFilters.dateTo,
                    );
                  const {
                    fullPeriodDayCount,
                    displaySummaryCount,
                    isPeriodComplete,
                    isRequestedPeriodEnded,
                    isLockedOrSent,
                    canReady,
                    canLock,
                    hasBlocker,
                    displayStatus,
                    incompletePeriodMessage,
                  } = readiness;
                  const statusSummary = getMonthlyStatusSummary(
                    item,
                    readiness,
                  );

                  return (
                    <Fragment key={item.employeeId}>
                      {branchChanged ? (
                        <tr>
                          <th
                            scope="colgroup"
                            colSpan={5}
                            style={groupTop ? { top: groupTop } : undefined}
                            /*
                             * ต้องทึบแสงไม่งั้นแถวที่เลื่อนลอดใต้จะทะลุขึ้นมา
                             * (#e2eefe = สีเดียวกับ bg-brand-100/80 ที่ทับพื้นขาว สีจึงไม่เพี้ยน)
                             * และเส้นขอบของเซลล์ที่ตรึงไว้จะไม่ถูกวาด จึงใช้เงาด้านในแทน
                             */
                            className={cn(
                              attendanceGroupHeadingCellClass("branch"),
                              "xl:sticky xl:z-10 xl:bg-[#e2eefe] xl:shadow-[inset_0_1px_0_#bfdbfe,inset_0_-1px_0_#bfdbfe]",
                            )}
                          >
                            <AttendanceGroupHeading
                              level="branch"
                              title={
                                item.employee.branch?.nameTh || "ไม่ระบุสาขา"
                              }
                              code={item.employee.branch?.code}
                              employeeCount={groupEmployeeCounts.get(branchKey)}
                            />
                          </th>
                        </tr>
                      ) : null}

                      {departmentChanged ? (
                        <tr>
                          <th
                            scope="colgroup"
                            colSpan={5}
                            className={attendanceGroupHeadingCellClass(
                              "department",
                            )}
                          >
                            <AttendanceGroupHeading
                              level="department"
                              title={
                                item.employee.department?.nameTh ||
                                "ไม่ระบุแผนก"
                              }
                              code={item.employee.department?.code}
                              employeeCount={groupEmployeeCounts.get(
                                departmentKey,
                              )}
                            />
                          </th>
                        </tr>
                      ) : null}

                      <tr className="border-b border-slate-100 align-middle transition-colors last:border-b-0 hover:bg-brand-50/50">
                        <td className="px-4 py-3">
                          {/*
                           * เดิมช่องนี้ซ้อนกันห้าบรรทัด (ชื่อ · รหัส · แผนก·ตำแหน่ง · บริษัท·สาขา ·
                           * จำนวนวัน) ทั้งที่ตำแหน่งกับแผนกมักเป็นคำเดียวกัน และบริษัท·สาขาก็ยาว
                           * จนถูกตัดทุกแถว ยุบเหลือชื่อ + บรรทัดสังกัดบรรทัดเดียว
                           * ส่วนความครบของข้อมูลเปลี่ยนเป็นแถบความคืบหน้าที่ดูออกในแวบเดียว
                           */}
                          <div className="flex items-center gap-3">
                            <EmployeeAvatar item={item} />
                            <div className="min-w-0">
                              <p className="break-words text-[13.5px] font-bold leading-5 text-slate-950 3xl:text-[14.5px]">
                                {employeeName(item)}
                              </p>
                              <p
                                className="break-words text-[11.5px] leading-5 text-slate-500 3xl:text-[12px]"
                                title={[
                                  item.employee.employeeCode,
                                  employeeDepartmentPosition(item.employee),
                                  employeeCompanyBranch(item.employee),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              >
                                {[
                                  item.employee.employeeCode,
                                  employeeDepartmentPosition(item.employee),
                                  employeeCompanyBranch(item.employee),
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "-"}
                              </p>

                              <div className="mt-1.5 flex items-center gap-2">
                                <span className="h-1 w-20 overflow-hidden rounded-full bg-brand-100">
                                  <span
                                    className={cn(
                                      "block h-full rounded-full",
                                      isPeriodComplete
                                        ? "bg-emerald-500"
                                        : "bg-brand-500",
                                    )}
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.round(
                                          (displaySummaryCount /
                                            Math.max(fullPeriodDayCount, 1)) *
                                            100,
                                        ),
                                      )}%`,
                                    }}
                                  />
                                </span>
                                <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-slate-400">
                                  {displaySummaryCount} / {fullPeriodDayCount}{" "}
                                  วัน
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <WorkSummaryRows item={item} />
                        </td>
                        <td className="px-4 py-3">
                          <PayrollImpactBox item={item} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                statusSummary.tone === "green"
                                  ? "bg-emerald-500"
                                  : "bg-amber-500",
                              )}
                            />
                            <span
                              className={cn(
                                "whitespace-nowrap text-xs font-bold",
                                statusSummary.tone === "green"
                                  ? "text-emerald-700"
                                  : "text-amber-700",
                              )}
                            >
                              {statusSummary.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            {/*
                             * กล่องกว้างเท่าแถวล่างที่กว้างที่สุด (inline-flex + items-stretch)
                             * ปุ่มดูรายละเอียดจึงยืดเต็มความกว้างของสองปุ่มล่างพอดี
                             */}
                            <div className="inline-flex flex-col items-stretch gap-1">
                              <button
                                type="button"
                                title="ดูรายละเอียด"
                                aria-label={`ดูรายละเอียดของ ${employeeName(item)}`}
                                onClick={() => void openDetail(item.employeeId)}
                                className={cn(
                                  rowActionClass("view", false),
                                  "w-full",
                                )}
                              >
                                <Eye className="h-3 w-3" />
                                ดูรายละเอียด
                              </button>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label={`ทำเครื่องหมายพร้อมเข้า Payroll ให้ ${employeeName(item)}`}
                                  onClick={() =>
                                    void applyAction(item, "ready")
                                  }
                                  disabled={
                                    !canReady ||
                                    !canManageMonthlyReview ||
                                    submitting
                                  }
                                  title={
                                    !canManageMonthlyReview
                                      ? "ต้องมีสิทธิ์ ATTENDANCE_RECALCULATE"
                                      : canReady
                                        ? "ทำรายการนี้ให้พร้อมเข้า Payroll"
                                        : displayStatus === "READY_FOR_PAYROLL"
                                          ? "รายการนี้พร้อมเข้า Payroll แล้ว"
                                          : isLockedOrSent
                                            ? "รายการนี้ดำเนินการเรียบร้อยแล้ว"
                                            : "ต้องแก้ไขรายการผิดปกติและตรวจข้อมูลให้ครบก่อน"
                                  }
                                  className={rowActionClass(
                                    "ready",
                                    !canReady ||
                                      !canManageMonthlyReview ||
                                      submitting,
                                  )}
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  พร้อม Payroll
                                </button>

                                <button
                                  type="button"
                                  aria-label={`ล็อกงวดของ ${employeeName(item)}`}
                                  onClick={() => void applyAction(item, "lock")}
                                  disabled={
                                    !canLock ||
                                    !canManageMonthlyReview ||
                                    submitting
                                  }
                                  title={
                                    !canManageMonthlyReview
                                      ? "ต้องมีสิทธิ์ ATTENDANCE_RECALCULATE"
                                      : canLock
                                        ? "ล็อกข้อมูลพนักงานนี้ในงวดที่แสดง"
                                        : isLockedOrSent
                                          ? "รายการนี้ดำเนินการเรียบร้อยแล้ว"
                                          : "ต้องทำเครื่องหมายพร้อมเข้า Payroll ก่อน"
                                  }
                                  className={rowActionClass(
                                    "lock",
                                    !canLock ||
                                      !canManageMonthlyReview ||
                                      submitting,
                                  )}
                                >
                                  <LockKeyhole className="h-3 w-3" />
                                  ล็อกงวด
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationFooter
          meta={pageMeta}
          loading={loading}
          onPageChange={handlePageChange}
        />
      </div>

      {detail ? (
        <DetailModal
          detail={detail}
          actioningDailyId={dailyActioningId}
          canManageMonthlyReview={canManageMonthlyReview}
          onReviewDay={(summary) =>
            void handleDailyReviewFromMonthlyDetail(summary)
          }
          onCancelReviewDay={(summary) =>
            void handleCancelDailyReviewFromMonthlyDetail(summary)
          }
          onPenaltyWaiverChanged={() => void refreshDetailAndList()}
          onClose={() => setDetail(null)}
        />
      ) : null}

      <AttendanceRecalculationProgressModal
        onCancel={handleCancelRecalculation}
        cancelling={recalculationCancelling}
        progress={recalculationProgress}
        elapsedMs={recalculationDisplayElapsedMs}
        visible={recalculationProgressVisible}
        dateFrom={appliedFilters.dateFrom}
        dateTo={appliedFilters.dateTo}
        onClose={() => setRecalculationProgressDismissed(true)}
      />

      <ActionDialog
        state={actionDialog}
        loading={submitting}
        onClose={() => !submitting && setActionDialog(null)}
      />
    </PageSurface>
  );
}
