"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Filter,
  FileCheck2,
  Loader2,
  MapPin,
  RefreshCcw,
  UserX,
  Wallet,
  X,
} from "lucide-react";

import {
  apiFetchWithMeta,
  getAttendanceDailySummaries,
  cancelAttendanceRecalculation,
  getAttendanceRecalculationProgress,
  getAttendanceLogs,
  markAttendanceDailySummaryReviewed,
  getPublicFileUrl,
  recalculateAttendanceDailySummaries,
} from "@/lib/api";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/feedback-state";
import {
  Avatar,
  Button,
  ButtonLink,
  DataTable,
  IconButton,
  Modal,
  Notice,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  type Column,
} from "@/components/kit";
import { getAttendanceTimeSlotLabel } from "@/lib/attendance-time-slot";
import {
  attendanceBranchGroupKey,
  attendanceBranchSortText,
  attendanceDepartmentGroupKey,
  attendanceDepartmentSortText,
  buildAttendanceDepartmentGroupRank,
  getAttendanceSessionGroupRank,
} from "@/lib/attendance-session-group";
import { compareEmployeeSeniority } from "@/lib/employee-seniority";
import { AttendanceGroupHeading } from "@/components/common/attendance-group-heading";
import {
  getAttendanceWorkflowChangedAt,
  subscribeAttendanceWorkflowChanged,
} from "@/lib/attendance-workflow-events";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { AttendanceRecalculationProgressModal } from "@/components/common/attendance-recalculation-progress";
import {
  PunchChannelIcon,
  PunchChannelLegend,
} from "@/components/common/punch-channel-icon";
import {
  MissingLogPenaltyWaiverControl,
  hasMissingLogPenaltyDecision,
} from "@/components/common/missing-log-penalty-waiver";
import { toast } from "sonner";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { useAuth } from "@/contexts/auth-context";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  applyAttendanceTenantScope,
  filterBranchesForAttendanceScope,
  filterCompaniesForAttendanceScope,
  filterOrgUnitsForAttendanceScope,
} from "@/lib/attendance-tenant-scope";

import type {
  AttendanceDailyReviewIssue,
  AttendanceRecalculationProgressResponse,
  AttendanceDailySummary,
  AttendanceDailySummaryListSummary,
  AttendanceLog,
  AttendanceReviewStatus,
} from "@/types/attendance";

const PAGE_SIZE = 20;
const WORKFLOW_REFRESH_DELAY_MS = 250;
const EMPTY_DAILY_SUMMARY: AttendanceDailySummaryListSummary = {
  total: 0,
  needReview: 0,
  reviewed: 0,
  readyForPayroll: 0,
  locked: 0,
  sentToPayroll: 0,
  issueCount: 0,
  missingLogCount: 0,
  lateCount: 0,
  totalLateMinutes: 0,
  approvedOtMinutes: 0,
  payableOtMinutes: 0,
  approvedOvertimeAmountPreview: 0,
  latePenaltyAmount: 0,
  missingLogPenaltyAmount: 0,
  unpaidLeaveDeductionAmount: 0,
  absentCount: 0,
  earlyCheckoutCount: 0,
  earlyCheckoutMinutes: 0,
  earlyCheckoutPenaltyAmount: 0,
  absentDeductionAmount: 0,
  totalDeductionAmount: 0,
  timeAdjustRequestCount: 0,
  pendingTimeAdjustRequestCount: 0,
  approvedTimeAdjustRequestCount: 0,
  rejectedTimeAdjustRequestCount: 0,
};

type DailyIssueFilter = AttendanceDailyReviewIssue | "";

type OrgOption = {
  id: string;
  code?: string | null;
  nameTh: string;
  nameEn?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
};

type FilterState = {
  search: string;
  companyId: string;
  branchId: string;
  departmentId: string;
  divisionId: string;
  employeeTypeId: string;
  dateFrom: string;
  dateTo: string;
  issue: DailyIssueFilter;
};

type IssueOption = {
  value: DailyIssueFilter;
  label: string;
  hint: string;
};

const issueOptions: IssueOption[] = [
  { value: "", label: "ทั้งหมด", hint: "ทุกสถานะ" },
  { value: "NEED_REVIEW", label: "ต้องตรวจสอบ", hint: "HR Review" },
  { value: "MISSING_LOG", label: "ลงเวลาไม่ครบ", hint: "Missing" },
  { value: "ABSENT", label: "ขาดงาน", hint: "Absent" },
  { value: "LATE", label: "มาสาย", hint: "Late" },
  { value: "EARLY_CHECKOUT", label: "ออกก่อนเวลา", hint: "Early" },
  { value: "TIME_ADJUST", label: "มีคำขอแก้เวลา", hint: "Time Adjust" },
  { value: "LEAVE", label: "มีใบลา", hint: "Leave" },
  { value: "OFFSITE", label: "นอกสถานที่", hint: "Offsite" },
  { value: "PENALTY", label: "มียอดหัก", hint: "Penalty" },
  { value: "READY_FOR_PAYROLL", label: "พร้อมล็อก", hint: "Ready" },
  { value: "LOCKED", label: "ล็อกแล้ว", hint: "Locked" },
];

const reviewStatusLabels: Record<string, string> = {
  CALCULATED: "ปกติ",
  NEED_REVIEW: "ต้องตรวจสอบ",
  REVIEWED: "ตรวจสอบแล้ว",
  READY_FOR_PAYROLL: "พร้อมล็อก",
  SENT_TO_PAYROLL: "ส่งเข้า Payroll แล้ว",
  LOCKED: "ล็อกแล้ว",
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

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0";

function numberText(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("th-TH");
}

function todayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getThaiDateInputValue(
  eventOrValue: ChangeEvent<HTMLInputElement> | string,
) {
  if (typeof eventOrValue === "string") return eventOrValue;
  return eventOrValue.target?.value ?? eventOrValue.currentTarget?.value ?? "";
}

function isDateBefore(left: string, right: string) {
  if (!left || !right) return false;
  return left < right;
}

function buildInitialFilters(): FilterState {
  const today = todayDateInput();
  return {
    search: "",
    companyId: "",
    branchId: "",
    departmentId: "",
    divisionId: "",
    employeeTypeId: "",
    dateFrom: today,
    dateTo: today,
    issue: "",
  };
}

function normalizeDateRange(filters: FilterState): FilterState {
  if (!isDateBefore(filters.dateTo, filters.dateFrom)) return filters;

  return {
    ...filters,
    dateFrom: filters.dateTo,
    dateTo: filters.dateFrom,
  };
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : 0;
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

function TimeOnlyDisplay({ value }: { value?: string | Date | null }) {
  if (!value) return <>-</>;

  if (typeof value === "string") {
    const timeOnlyMatch = value.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
    if (timeOnlyMatch) return <>{timeOnlyMatch[1]} น.</>;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <>-</>;

  return (
    <>
      {new Intl.DateTimeFormat("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Bangkok",
      }).format(date)}{" "}
      น.
    </>
  );
}

type AttendanceTimeSlotKey = "morning" | "afternoon" | "checkout";
type AttendanceTimeSlotTone =
  | "normal"
  | "paidLeave"
  | "unpaidLeave"
  | "offsite"
  | "pending"
  | "danger"
  | "adjusted"
  | "holiday"
  | "slate";

type AttendanceTimeSlotState = {
  label: string;
  detail?: string;
  secondary?: string;
  tone: AttendanceTimeSlotTone;
  hasTime: boolean;
};

const attendanceSlotSessionMap: Record<
  AttendanceTimeSlotKey,
  "MORNING" | "AFTERNOON" | "CHECKOUT"
> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  checkout: "CHECKOUT",
};

function getPolicySnapshotRecord(
  item: AttendanceDailySummary,
): Record<string, any> {
  return item.policySnapshot && typeof item.policySnapshot === "object"
    ? (item.policySnapshot as Record<string, any>)
    : {};
}

function coverageIncludesSlot(
  coverage: Record<string, any> | null | undefined,
  slot: AttendanceTimeSlotKey,
) {
  if (!coverage || typeof coverage !== "object") return false;

  const flagKey =
    slot === "morning"
      ? "coversMorning"
      : slot === "afternoon"
        ? "coversAfternoon"
        : "coversCheckout";

  if (coverage[flagKey] === true) return true;

  const sessions = Array.isArray(coverage.coveredSessions)
    ? coverage.coveredSessions
    : [];

  return sessions.includes(attendanceSlotSessionMap[slot]);
}

function fallbackLeaveCoversSlot(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
) {
  const hasLeave = Boolean(
    item.leaveRequestId ||
    item.leaveTypeId ||
    item.leaveRequest ||
    item.leaveType ||
    toNumber(item.paidLeaveMinutes) > 0 ||
    toNumber(item.unpaidLeaveMinutes) > 0,
  );
  if (!hasLeave) return false;

  if (item.leaveDayType === "FULL_DAY") return true;
  if (item.leaveDayType === "HALF_DAY_MORNING") return slot === "morning";
  if (item.leaveDayType === "HALF_DAY_AFTERNOON") {
    return slot === "afternoon" || slot === "checkout";
  }

  if (item.leaveDayType === "HOURLY") {
    return (
      toNumber(item.paidLeaveMinutes) + toNumber(item.unpaidLeaveMinutes) > 0
    );
  }

  return toNumber(item.leaveDurationDays) >= 1;
}

function getHolidaySlotState(
  item: AttendanceDailySummary,
): AttendanceTimeSlotState | null {
  const policySnapshot = getPolicySnapshotRecord(item);
  const holiday = policySnapshot.holiday as Record<string, any> | undefined;
  const workingHoliday = policySnapshot.workingHoliday as
    Record<string, any> | undefined;
  const baseHoliday = workingHoliday?.baseHoliday as
    Record<string, any> | undefined;
  const calculationStatus = String(item.calculationStatus || "").toUpperCase();

  const isHoliday =
    holiday?.isHoliday === true ||
    baseHoliday?.isHoliday === true ||
    calculationStatus === "HOLIDAY";

  if (!isHoliday) return null;

  const source = String(
    holiday?.source || baseHoliday?.source || "",
  ).toUpperCase();
  const name = String(
    holiday?.name || baseHoliday?.name || item.calculationNote || "",
  ).trim();
  const isWorkingHoliday =
    holiday?.isWorkingHoliday === true || Boolean(workingHoliday?.workOverride);

  let label = name && name !== "วันหยุด" ? name : "วันหยุด";

  if (source === "WEEKLY") {
    label = "วันหยุดประจำสัปดาห์";
  } else if (source === "CUSTOM") {
    label = name && name !== "วันหยุด" ? name : "วันหยุดพิเศษ";
  } else if (source === "WORK_OVERRIDE" || isWorkingHoliday) {
    label = "วันทำงานวันหยุด";
  }

  return {
    label,
    tone: "holiday",
    hasTime: false,
  };
}

function isAttendanceHoliday(item: AttendanceDailySummary) {
  return Boolean(getHolidaySlotState(item));
}

function isAttendanceHolidayWithoutWork(item: AttendanceDailySummary) {
  return (
    isAttendanceHoliday(item) &&
    !item.morningInAt &&
    !item.afternoonInAt &&
    !item.checkOutAt
  );
}

function getLeaveSlotState(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
): AttendanceTimeSlotState | null {
  const leaveCoverage = getPolicySnapshotRecord(item).approvedLeaveCoverage as
    Record<string, any> | undefined;

  if (
    !coverageIncludesSlot(leaveCoverage, slot) &&
    !fallbackLeaveCoversSlot(item, slot)
  ) {
    return null;
  }

  const isPaid =
    item.leaveIsPaid ??
    item.leaveType?.isPaid ??
    (toNumber(item.paidLeaveMinutes) > 0 &&
      toNumber(item.unpaidLeaveMinutes) <= 0);
  const leaveName =
    item.leaveType?.nameTh ||
    (isPaid ? "ลาได้รับค่าจ้าง" : "ลาไม่ได้รับค่าจ้าง");

  return {
    label: leaveName,
    detail: isPaid ? "ได้รับค่าจ้าง" : "ไม่ได้รับค่าจ้าง",
    tone: isPaid ? "paidLeave" : "unpaidLeave",
    hasTime: false,
  };
}

function fallbackOffsiteCoversSlot(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
) {
  if (toNumber(item.offsiteMinutes) <= 0 && !item.offsiteStatus) return false;

  const offsiteCoverage = getPolicySnapshotRecord(item)
    .approvedOffsiteCoverage as Record<string, any> | undefined;

  if (coverageIncludesSlot(offsiteCoverage, slot)) return true;

  const sessions = Array.isArray(offsiteCoverage?.coveredSessions)
    ? offsiteCoverage?.coveredSessions
    : [];

  return sessions.length === 0 && toNumber(item.offsiteMinutes) > 0;
}

function getOffsiteSlotState(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
): AttendanceTimeSlotState | null {
  const offsiteCoverage = getPolicySnapshotRecord(item)
    .approvedOffsiteCoverage as Record<string, any> | undefined;

  if (
    !coverageIncludesSlot(offsiteCoverage, slot) &&
    !fallbackOffsiteCoversSlot(item, slot)
  ) {
    return null;
  }

  const needsReview = Boolean(offsiteCoverage?.needsReview);
  const status = String(
    offsiteCoverage?.status || item.offsiteStatus || "",
  ).toUpperCase();
  const approved = ["APPROVED", "HR_APPROVED", "MANAGER_APPROVED"].includes(
    status,
  );

  return {
    label:
      needsReview || (!approved && status) ? "นอกสถานที่รอตรวจ" : "นอกสถานที่",
    tone: needsReview || (!approved && status) ? "pending" : "offsite",
    hasTime: false,
  };
}

function getBangkokHour(value?: string | Date | null) {
  if (!value) return null;

  if (typeof value === "string") {
    const timeOnlyMatch = value.match(/^(\d{2}):\d{2}(?::\d{2})?$/);
    if (timeOnlyMatch) return Number(timeOnlyMatch[1]);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const hour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);

  return Number(hour);
}

function timeAdjustTargetsSlot(
  request: NonNullable<AttendanceDailySummary["timeAdjustRequests"]>[number],
  slot: AttendanceTimeSlotKey,
) {
  if (request.targetLogType === "CHECK_OUT") return slot === "checkout";
  if (request.targetLogType !== "CHECK_IN") return false;

  const requestSession = String(
    (request as any).targetSession ||
      request.originalAttendanceLog?.session ||
      "",
  ).toUpperCase();

  if (requestSession === "MORNING") return slot === "morning";
  if (requestSession === "AFTERNOON") return slot === "afternoon";

  const hour = getBangkokHour(
    getTimeAdjustRequestedTime(request) || getTimeAdjustOriginalTime(request),
  );

  if (hour === null) return false;
  return hour < 12 ? slot === "morning" : slot === "afternoon";
}

function getTimeAdjustSlotState(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
): AttendanceTimeSlotState | null {
  const requests = getTimeAdjustRequests(item).filter((request) =>
    timeAdjustTargetsSlot(request, slot),
  );

  if (!requests.length) return null;

  const hasPending = requests.some((request) => request.status === "SUBMITTED");
  const hasApproved = requests.some((request) => request.status === "APPROVED");
  const hasRejected = requests.some((request) => request.status === "REJECTED");

  if (hasPending) {
    return {
      label: "รอแก้เวลา",
      detail: `${requests.length.toLocaleString("th-TH")} รายการ`,
      tone: "pending",
      hasTime: false,
    };
  }

  if (hasApproved) {
    return {
      label: "แก้เวลาแล้ว",
      detail: `${requests.length.toLocaleString("th-TH")} รายการ`,
      tone: "adjusted",
      hasTime: false,
    };
  }

  if (hasRejected) {
    return {
      label: "ไม่อนุมัติแก้เวลา",
      detail: `${requests.length.toLocaleString("th-TH")} รายการ`,
      tone: "danger",
      hasTime: false,
    };
  }

  return {
    label: "มีคำขอแก้เวลา",
    detail: `${requests.length.toLocaleString("th-TH")} รายการ`,
    tone: "slate",
    hasTime: false,
  };
}

function isSlotMissing(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
) {
  if (slot === "morning") return item.isMorningMissing;
  if (slot === "afternoon") return item.isAfternoonMissing;
  return item.isCheckoutMissing;
}

function getAttendanceTimeSlotState(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
  value?: string | Date | null,
): AttendanceTimeSlotState {
  const holidayState = getHolidaySlotState(item);
  const leaveState = getLeaveSlotState(item, slot);
  const offsiteState = getOffsiteSlotState(item, slot);
  const timeAdjustState = getTimeAdjustSlotState(item, slot);

  if (value) {
    return {
      label: "เวลาจริง",
      detail: undefined,
      secondary:
        holidayState?.label ||
        leaveState?.label ||
        offsiteState?.label ||
        timeAdjustState?.label,
      tone: holidayState ? "holiday" : "normal",
      hasTime: true,
    };
  }

  if (holidayState) return holidayState;
  if (leaveState) return leaveState;
  if (offsiteState) return offsiteState;
  if (timeAdjustState) return timeAdjustState;

  if (isSlotMissing(item, slot)) {
    return {
      label: "ไม่พบเวลา",
      detail: "ไม่พบรายการลงเวลา",
      tone: "danger",
      hasTime: false,
    };
  }

  return {
    label: "-",
    tone: "slate",
    hasTime: false,
  };
}

const attendanceTimeSlotKeys: AttendanceTimeSlotKey[] = [
  "morning",
  "afternoon",
  "checkout",
];

/** เฉดที่แปลว่า "วันนี้ไม่ต้องมีเวลาเข้า-ออก" ไม่ใช่ "หาเวลาไม่เจอ" */
const attendanceRowLevelTones: AttendanceTimeSlotTone[] = [
  "holiday",
  "paidLeave",
  "unpaidLeave",
];

function getAttendanceSlotValue(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
) {
  if (slot === "morning") return item.morningInAt;
  if (slot === "afternoon") return item.afternoonInAt;
  return item.checkOutAt;
}

/*
 * บางวันเป็นเรื่องของทั้งวัน ไม่ใช่ของช่องเวลาช่องใดช่องหนึ่ง — วันหยุดประจำสัปดาห์
 * วันหยุดที่ย้ายมา หรือลาเต็มวัน ทั้งสามช่องจะได้ป้ายเดียวกันหมด
 * ถ้าปล่อยไว้ ตารางจะมีขีดจาง ๆ กับข้อความซ้ำกันสามครั้งในแถวเดียว
 * จึงยุบขึ้นไปเป็นป้ายสถานะของแถวครั้งเดียว แล้วปล่อยช่องเวลาว่างไปเลย
 *
 * วันที่ "ไม่พบเวลา" ไม่เข้าเงื่อนไขนี้ เพราะช่องที่หายไปคือสิ่งที่ต้องตามแก้จริง ๆ
 */
function getAttendanceRowSlotState(
  item: AttendanceDailySummary,
): AttendanceTimeSlotState | null {
  const states = attendanceTimeSlotKeys.map((slot) =>
    getAttendanceTimeSlotState(item, slot, getAttendanceSlotValue(item, slot)),
  );

  const first = states[0];
  if (!first || first.hasTime) return null;
  if (!attendanceRowLevelTones.includes(first.tone)) return null;

  const isSameEverySlot = states.every(
    (state) =>
      !state.hasTime && state.label === first.label && state.tone === first.tone,
  );

  return isSameEverySlot ? first : null;
}

function attendanceTimeSlotBadgeClass(tone: AttendanceTimeSlotTone) {
  const base =
    "inline-flex max-w-full rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ring-inset whitespace-nowrap";
  const map: Record<AttendanceTimeSlotTone, string> = {
    normal: "bg-slate-100 text-slate-700 ring-slate-200",
    paidLeave: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    unpaidLeave: "bg-rose-50 text-rose-700 ring-rose-100",
    offsite: "bg-sky-50 text-sky-700 ring-sky-100",
    pending: "bg-amber-50 text-amber-700 ring-amber-100",
    danger: "bg-rose-50 text-rose-700 ring-rose-100",
    adjusted: "bg-violet-50 text-violet-700 ring-violet-100",
    holiday: "bg-orange-50 text-orange-700 ring-orange-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return `${base} ${map[tone]}`;
}

function attendanceTimeSlotContainerClass(tone: AttendanceTimeSlotTone) {
  const map: Record<AttendanceTimeSlotTone, string> = {
    normal: "bg-sky-50/55 text-sky-950 ring-sky-100/70",
    paidLeave: "bg-emerald-50 text-emerald-950 ring-emerald-100",
    unpaidLeave: "bg-rose-50 text-rose-950 ring-rose-100",
    offsite: "bg-sky-50 text-sky-950 ring-sky-100",
    pending: "bg-amber-50 text-amber-950 ring-amber-100",
    danger: "bg-rose-50 text-rose-950 ring-rose-100",
    adjusted: "bg-violet-50 text-violet-950 ring-violet-100",
    holiday: "bg-orange-50 text-orange-950 ring-orange-200",
    slate: "bg-slate-50 text-slate-800 ring-slate-100",
  };

  return map[tone];
}

/** พื้นสีอ่อนของช่องเวลาในป๊อปอัพ — เฉดเดียวกับสีตัวอักษรของ tone นั้น */
function attendanceTimeSlotSoftBgClass(tone: AttendanceTimeSlotTone) {
  const map: Record<AttendanceTimeSlotTone, string> = {
    normal: "",
    paidLeave: "bg-emerald-50/70",
    unpaidLeave: "bg-rose-50/70",
    offsite: "bg-sky-50/70",
    pending: "bg-amber-50/70",
    danger: "bg-rose-50/70",
    adjusted: "bg-violet-50/70",
    holiday: "bg-orange-50/70",
    slate: "",
  };

  return map[tone];
}

function attendanceTimeSlotLabelClass(tone: AttendanceTimeSlotTone) {
  const map: Record<AttendanceTimeSlotTone, string> = {
    normal: "text-slate-500",
    paidLeave: "text-emerald-600",
    unpaidLeave: "text-rose-600",
    offsite: "text-sky-600",
    pending: "text-amber-600",
    danger: "text-rose-600",
    adjusted: "text-violet-600",
    holiday: "text-orange-600",
    slate: "text-slate-500",
  };

  return map[tone];
}

function AttendanceTimeSlotDisplay({
  item,
  slot,
  label,
  value,
  className,
  variant = "card",
}: {
  item: AttendanceDailySummary;
  slot: AttendanceTimeSlotKey;
  label: string;
  value?: string | Date | null;
  className?: string;
  variant?: "card" | "table" | "summary";
}) {
  const state = getAttendanceTimeSlotState(item, slot, value);
  const emptyValue = state.label === "-" ? "—" : state.label;

  if (variant === "table" || variant === "summary") {
    /*
     * ช่องที่ไม่มีเวลา เอาสาเหตุมาเป็นค่าหลักแทนขีดไปเลย ทั้งในตารางและป๊อปอัพ
     * ขีดจาง ๆ กับข้อความซ้อนกันสองบรรทัดในช่องแคบ ๆ อ่านยากกว่าและกินความสูงเปล่า ๆ
     * เหลือขีดไว้เฉพาะช่องที่ไม่มีอะไรจะบอกจริง ๆ
     */
    const emptyWithReason = !state.hasTime && emptyValue !== "—";
    const summaryEmpty = variant === "summary" && !state.hasTime;

    return (
      <div
        className={cn(
          "min-w-0",
          variant === "table"
            ? "flex min-h-11 flex-col items-center justify-center text-center"
            : "px-3 py-2.5",
          /* ช่องที่ผิดปกติมีพื้นสีอ่อนตามความหมาย ตาจึงจับได้ว่าต้องดูช่องไหน */
          summaryEmpty && state.tone !== "normal" && state.tone !== "slate"
            ? attendanceTimeSlotSoftBgClass(state.tone)
            : "",
          className,
        )}
      >
        {variant === "summary" ? (
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-400">
            {label}
          </p>
        ) : null}

        <p
          className={cn(
            "max-w-full truncate font-bold",
            state.hasTime ? "tabular-nums" : "",
            variant === "table"
              ? emptyWithReason
                ? "text-[12px] leading-5"
                : "text-[15px] leading-6"
              : cn(
                  "mt-0.5 leading-5",
                  emptyWithReason ? "text-[12.5px]" : "text-[14.5px]",
                ),
            state.hasTime
              ? "text-slate-900"
              : emptyWithReason
                ? attendanceTimeSlotLabelClass(state.tone)
                : "text-slate-300",
          )}
          title={state.hasTime ? undefined : state.label}
        >
          {state.hasTime ? (
            /* ไอคอนบอกอุปกรณ์ที่ใช้ลงเวลา ชิดขวาของเวลา ไม่ดันความสูงแถว */
            <span className="inline-flex items-center gap-1">
              <TimeOnlyDisplay value={value} />
              <PunchChannelIcon info={item.punchChannels?.[slot] ?? null} />
            </span>
          ) : (
            emptyValue
          )}
        </p>
        {state.detail && (state.hasTime || emptyValue === "—") ? (
          <p
            className={cn(
              "mt-0.5 max-w-full truncate text-[10px] font-semibold",
              attendanceTimeSlotLabelClass(state.tone),
            )}
            title={state.detail}
          >
            {state.detail}
          </p>
        ) : null}
        {state.secondary ? (
          <p className="mt-0.5 max-w-full truncate text-[10px] font-semibold text-slate-500">
            {state.secondary}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl px-2.5 py-2 ring-1 ring-inset",
        attendanceTimeSlotContainerClass(state.tone),
        className,
      )}
    >
      <p
        className={cn(
          "truncate text-[11px] font-medium",
          attendanceTimeSlotLabelClass(state.tone),
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-bold leading-5",
          state.tone === "holiday" && !state.hasTime
            ? "whitespace-nowrap text-[10px] tracking-[-0.03em]"
            : "truncate text-[12px]",
        )}
        title={state.hasTime ? undefined : state.label}
      >
        {state.hasTime ? <TimeOnlyDisplay value={value} /> : state.label}
      </p>
      {state.detail ? (
        <p
          className={cn(
            "mt-0.5 text-[10px] font-semibold",
            state.tone === "holiday"
              ? "whitespace-nowrap tracking-[-0.03em]"
              : "truncate",
            attendanceTimeSlotLabelClass(state.tone),
          )}
          title={state.detail}
        >
          {state.detail}
        </p>
      ) : null}
      {state.secondary ? (
        <p className="mt-1 truncate rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-inset ring-white/80">
          {state.secondary}
        </p>
      ) : null}
    </div>
  );
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDaysInput(value: string, amount: number) {
  const date = parseDateInput(value || todayDateInput());
  date.setDate(date.getDate() + amount);
  return formatDateInput(date);
}

/** เวลาแบบสั้น ใช้ในไดอะล็อกรายละเอียดของแต่ละวัน */
function formatCalendarTime(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string") {
    const timeOnlyMatch = value.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
    if (timeOnlyMatch) return `${timeOnlyMatch[1]} น.`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date)} น.`;
}

function formatLeaveDayType(dayType?: string | null) {
  if (dayType === "HALF_DAY_MORNING") return "ครึ่งเช้า";
  if (dayType === "HALF_DAY_AFTERNOON") return "ครึ่งบ่าย";
  if (dayType === "HOURLY") return "รายชั่วโมง";
  return "เต็มวัน";
}

function dateRangeLengthDays(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo) return 1;
  const start = parseDateInput(dateFrom);
  const end = parseDateInput(dateTo);
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 1;
  return Math.max(1, Math.floor(diff / 86_400_000) + 1);
}

function minutesToHoursText(minutes: number | null | undefined) {
  const value = Number(minutes || 0);
  if (!value) return "-";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours && mins) return `${hours} ชม. ${mins} นาที`;
  if (hours) return `${hours} ชม.`;
  return `${mins} นาที`;
}

function employeeName(summary: AttendanceDailySummary) {
  const employee = summary.employee;
  if (!employee) return "-";

  return (
    employee.displayName ||
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ") ||
    employee.employeeCode
  );
}

function getEmployeeAvatarUrl(summary: AttendanceDailySummary) {
  const employee = summary.employee as
    | (AttendanceDailySummary["employee"] & {
        user?: { avatarUrl?: string | null } | null;
        avatarUrl?: string | null;
        profileImageUrl?: string | null;
        photoUrl?: string | null;
        imageUrl?: string | null;
      })
    | undefined;

  return getPublicFileUrl(
    employee?.user?.avatarUrl ||
      employee?.avatarUrl ||
      employee?.profileImageUrl ||
      employee?.photoUrl ||
      employee?.imageUrl ||
      null,
  );
}

/**
 * สังกัดแบบเต็ม "แผนก · สาขา"
 * ตรวจเวลาทำงานต้องรู้สาขาด้วย เพราะเวลาเข้า-ออกและกติกาสายผูกกับสาขา
 * ถ้าไม่มีทั้งคู่ค่อยถอยไปใช้บริษัทหรือตำแหน่ง
 */
function orgText(summary: AttendanceDailySummary) {
  const parts = [
    summary.employee?.department?.nameTh,
    summary.employee?.branch?.nameTh,
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" · ");

  return summary.employee?.company?.nameTh || summary.employee?.position || "-";
}

/**
 * มีตำแหน่งลงเวลาให้ดูไหม — คนที่ลงเวลานอกบริษัทได้ (field mode) หรือมีงานนอกสถานที่วันนั้น
 * ใช้ทั้งตอนตัดสินใจโชว์ปุ่มและตอนเรียงลำดับแถว
 */
function canViewAttendanceLocation(item: AttendanceDailySummary) {
  const isOffsite =
    Boolean(item.offsiteStatus) || toNumber(item.offsiteMinutes) > 0;

  return item.employee?.attendanceGeofenceRequired === false || isOffsite;
}

/** คีย์วันที่แบบ YYYY-MM-DD ใช้จัดกลุ่มแถวตามวัน ก่อนเรียงกลุ่มการลงเวลาข้างใน */
function attendanceDateKey(item: AttendanceDailySummary) {
  return String(item.workDate || "").slice(0, 10);
}

/*
 * คีย์ของกลุ่มในตาราง — คร่อมวันที่ไว้ทุกชั้น
 * เพราะช่วงหลายวันต้องแยกกลุ่มและจำนวนคนของแต่ละวันออกจากกัน
 */
function attendanceBranchKey(item: AttendanceDailySummary) {
  return `${attendanceDateKey(item)}|${attendanceBranchGroupKey(item.employee)}`;
}

function attendanceDepartmentKey(item: AttendanceDailySummary) {
  return `${attendanceDateKey(item)}|${attendanceDepartmentGroupKey(item.employee)}`;
}

function getReviewStatus(item: AttendanceDailySummary) {
  return (
    item.reviewStatus ||
    (item.calculationStatus as AttendanceReviewStatus) ||
    "CALCULATED"
  );
}

function isPayrollLinked(item: AttendanceDailySummary) {
  const status = getReviewStatus(item);
  return (
    status === "READY_FOR_PAYROLL" ||
    status === "SENT_TO_PAYROLL" ||
    status === "LOCKED" ||
    Boolean(item.payrollRunId || item.sentToPayrollAt || item.lockedAt)
  );
}

function isSlotCoveredByApprovedContext(
  item: AttendanceDailySummary,
  slot: AttendanceTimeSlotKey,
) {
  return Boolean(
    getHolidaySlotState(item) ||
    getLeaveSlotState(item, slot) ||
    getOffsiteSlotState(item, slot),
  );
}

function hasIncompleteRequiredSlot(item: AttendanceDailySummary) {
  if (isAttendanceHolidayWithoutWork(item)) return false;

  return (
    (!item.morningInAt && !isSlotCoveredByApprovedContext(item, "morning")) ||
    (!item.afternoonInAt &&
      !isSlotCoveredByApprovedContext(item, "afternoon")) ||
    (!item.checkOutAt && !isSlotCoveredByApprovedContext(item, "checkout"))
  );
}

function getAttendanceReviewReasons(item: AttendanceDailySummary) {
  const direct = Array.isArray(item.reviewReasons) ? item.reviewReasons : [];
  if (direct.length > 0) return direct;

  const snapshot = getPolicySnapshotRecord(item);
  const attendanceReview =
    snapshot.attendanceReview &&
    typeof snapshot.attendanceReview === "object" &&
    !Array.isArray(snapshot.attendanceReview)
      ? (snapshot.attendanceReview as Record<string, any>)
      : null;

  return Array.isArray(attendanceReview?.reviewReasons)
    ? attendanceReview.reviewReasons
    : [];
}

function hasAttendanceReviewIssue(item: AttendanceDailySummary) {
  if (typeof item.hasReviewIssue === "boolean") {
    return item.hasReviewIssue;
  }

  const snapshot = getPolicySnapshotRecord(item);
  const attendanceReview =
    snapshot.attendanceReview &&
    typeof snapshot.attendanceReview === "object" &&
    !Array.isArray(snapshot.attendanceReview)
      ? (snapshot.attendanceReview as Record<string, any>)
      : null;

  if (typeof attendanceReview?.hasReviewIssue === "boolean") {
    return attendanceReview.hasReviewIssue;
  }

  return (
    getAttendanceReviewReasons(item).length > 0 ||
    getReviewStatus(item) === "NEED_REVIEW"
  );
}

function requiresAttendanceReview(item: AttendanceDailySummary) {
  if (typeof item.requiresReview === "boolean") {
    return item.requiresReview;
  }

  return getReviewStatus(item) === "NEED_REVIEW";
}

function canMarkAttendanceReviewed(item: AttendanceDailySummary) {
  const status = getReviewStatus(item);

  if (
    ["REVIEWED", "READY_FOR_PAYROLL", "LOCKED", "SENT_TO_PAYROLL"].includes(
      status,
    )
  ) {
    return false;
  }

  if (isPayrollLinked(item)) return false;

  return requiresAttendanceReview(item);
}

function getDisplayReviewStatus(item: AttendanceDailySummary) {
  const status = getReviewStatus(item);

  if (isAttendanceHolidayWithoutWork(item) && !hasAttendanceReviewIssue(item)) {
    return "CALCULATED";
  }

  if (requiresAttendanceReview(item)) {
    return "NEED_REVIEW";
  }

  return status;
}

function getDisplayReviewStatusLabel(item: AttendanceDailySummary) {
  const status = getDisplayReviewStatus(item);
  return reviewStatusLabels[status] || status;
}

function formatCoverageReasonText(value?: string | null) {
  const reason = String(value || "").toUpperCase();

  if (reason.includes("FULL_DAY")) return "เต็มวัน";
  if (reason.includes("HALF_DAY_MORNING")) return "ครึ่งเช้า";
  if (reason.includes("HALF_DAY_AFTERNOON")) return "ครึ่งบ่าย";
  if (reason.includes("HOURLY")) return "รายชั่วโมง";
  if (
    reason.includes("MORNING") &&
    reason.includes("AFTERNOON") &&
    reason.includes("CHECKOUT")
  ) {
    return "ครอบคลุมเวลาเข้าเช้า เข้างานบ่าย และออกงาน";
  }

  return "";
}

function formatAttendanceCalculationNote(item: AttendanceDailySummary) {
  const parts: string[] = [];
  const rawNoteParts = String(item.calculationNote || "")
    .split(" / ")
    .map((part) => part.trim())
    .filter(Boolean);

  const leaveName = item.leaveType?.nameTh;
  const leavePaidText =
    item.leaveIsPaid === true
      ? "ได้รับค่าจ้าง"
      : item.leaveIsPaid === false
        ? "ไม่ได้รับค่าจ้าง"
        : "";

  if (leaveName) {
    parts.push(
      [leaveName, formatLeaveDayType(item.leaveDayType), leavePaidText]
        .filter(Boolean)
        .join(" · "),
    );
  }

  const offsiteCoverage = getPolicySnapshotRecord(item)
    .approvedOffsiteCoverage as Record<string, any> | undefined;
  const offsiteStatus = String(
    offsiteCoverage?.status || item.offsiteStatus || "",
  ).toUpperCase();
  if (offsiteStatus) {
    const coverageText = formatCoverageReasonText(
      String(offsiteCoverage?.coverageReason || ""),
    );
    parts.push(
      [
        ["APPROVED", "HR_APPROVED", "MANAGER_APPROVED"].includes(offsiteStatus)
          ? "ทำงานนอกสถานที่อนุมัติแล้ว"
          : "ทำงานนอกสถานที่รอตรวจ",
        coverageText,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  const holidayState = getHolidaySlotState(item);
  const isHolidayWithoutWork = Boolean(
    holidayState && isAttendanceHolidayWithoutWork(item),
  );
  if (isHolidayWithoutWork && holidayState) {
    parts.push(holidayState.label);
  } else {
    if (item.isAbsent) parts.push("ขาดงาน 1 วัน");
    if (item.hasMissingLog || hasIncompleteRequiredSlot(item)) {
      const missingSlots = [
        !item.morningInAt && !isSlotCoveredByApprovedContext(item, "morning")
          ? "เข้าเช้า"
          : "",
        !item.afternoonInAt &&
        !isSlotCoveredByApprovedContext(item, "afternoon")
          ? "เข้างานบ่าย"
          : "",
        !item.checkOutAt && !isSlotCoveredByApprovedContext(item, "checkout")
          ? "ออกงาน"
          : "",
      ].filter(Boolean);
      if (missingSlots.length)
        parts.push(`ไม่พบเวลา ${missingSlots.join(" / ")}`);
    }
  }
  if (toNumber(item.totalLateMinutes) > 0) {
    parts.push(`มาสายรวม ${numberText(item.totalLateMinutes)} นาที`);
  }
  if (toNumber(item.earlyCheckoutMinutes) > 0) {
    parts.push(`ออกก่อนเวลา ${numberText(item.earlyCheckoutMinutes)} นาที`);
  }
  if (
    toNumber(item.totalDeductionAmount) <= 0 &&
    rawNoteParts.some((part) => part.includes("ไม่มีรายการหักเงิน"))
  ) {
    parts.push("ไม่มีรายการหักเงิน");
  }

  rawNoteParts.forEach((part) => {
    if (/:[A-Z0-9_:-]+/.test(part) || /[A-Z]{2,}_[A-Z0-9_]+/.test(part)) return;
    if (part.includes("ยอดหักรวม") || part.includes("ยอดหัก ")) return;
    if (part.includes("มีใบลาอนุมัติ") || part.includes("ทำงานนอกสถานที่"))
      return;
    if (isHolidayWithoutWork && part.includes("วันหยุด")) return;
    if (
      part.includes("ไม่มีรายการหักเงิน") &&
      parts.includes("ไม่มีรายการหักเงิน")
    )
      return;

    if (item.isAbsent && part.includes("ขาดงาน")) {
      const reason = part.split("เนื่องจาก")[1]?.trim();
      if (reason) {
        const reasonText = `เหตุผล: ${reason}`;
        if (!parts.includes(reasonText)) parts.push(reasonText);
      }
      return;
    }

    if (
      part.includes("ไม่มีเวลา") &&
      parts.some((existing) => existing.includes("ไม่มีเวลา"))
    )
      return;
    if (!parts.includes(part)) parts.push(part);
  });

  return parts.length ? parts.join("\n") : null;
}

function statusBadgeClass(status: string) {
  const base =
    "inline-flex max-w-full rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ring-inset whitespace-nowrap";

  if (status === "READY_FOR_PAYROLL")
    return `${base} bg-sky-50 text-sky-700 ring-sky-100`;
  if (status === "LOCKED" || status === "SENT_TO_PAYROLL")
    return `${base} bg-slate-100 text-slate-700 ring-slate-200`;
  if (status === "REVIEWED")
    return `${base} bg-emerald-50 text-emerald-700 ring-emerald-100`;
  if (status === "NEED_REVIEW")
    return `${base} bg-amber-50 text-amber-700 ring-amber-100`;
  return `${base} bg-emerald-50/80 text-emerald-700 ring-emerald-100`;
}

function pillClass(tone: "red" | "amber" | "blue" | "green" | "slate") {
  const base =
    "inline-flex max-w-full rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ring-inset whitespace-nowrap";
  const map = {
    red: "bg-rose-50 text-rose-700 ring-rose-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    blue: "bg-sky-50 text-sky-700 ring-sky-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    slate: "bg-slate-50 text-slate-600 ring-slate-100",
  };
  return `${base} ${map[tone]}`;
}

function getApprovedOtMinutes(item: AttendanceDailySummary) {
  return Math.max(
    toNumber(item.payableOtMinutes),
    toNumber(item.approvedOtMinutes),
  );
}

function getApprovedOvertimeAmount(item: Partial<AttendanceDailySummary>) {
  return Math.max(
    toNumber(item.approvedOvertimeAmountPreview),
    toNumber(item.approvedOvertimeWorkdayAmountPreview) +
      toNumber(item.approvedOvertimeHolidayAmountPreview) +
      toNumber(item.approvedOvertimeSpecialHolidayAmountPreview),
  );
}

function getMissingLogSessions(item: AttendanceDailySummary) {
  const sessions: string[] = [];

  if (item.isMorningMissing) sessions.push("เช้า");
  if (item.isAfternoonMissing) sessions.push("บ่าย");
  if (item.isCheckoutMissing) sessions.push("ออกงาน");

  if (!sessions.length && item.hasMissingLog) sessions.push("ไม่ระบุ");

  return sessions;
}

function getMissingLogSummaryLabel(item: AttendanceDailySummary) {
  const sessions = getMissingLogSessions(item);
  return sessions.length
    ? `ลงเวลาไม่ครบ ${sessions.length.toLocaleString("th-TH")} รอบ`
    : "ลงเวลาไม่ครบ -";
}

function getAbsenceSummaryLabel(item: AttendanceDailySummary) {
  const absentDays = toNumber(item.absentDays) || (item.isAbsent ? 1 : 0);
  if (absentDays <= 0) return "ขาดงาน -";
  return `ขาดงาน ${absentDays.toLocaleString("th-TH")} วัน`;
}

type AttendanceDetailBreakdownItem = {
  label: string;
  value?: string;
  amount?: string | number | null;
  amountLabel?: string;
  tone?: "red" | "green" | "slate";
};

function getAttendanceSessionRule(
  item: AttendanceDailySummary,
  sessionCode: "MORNING_IN" | "AFTERNOON_IN" | "CHECK_OUT",
) {
  const rules = getPolicySnapshotRecord(item).sessionRules;
  if (!Array.isArray(rules)) return null;
  return (rules.find(
    (rule) =>
      rule &&
      typeof rule === "object" &&
      String(rule.sessionCode || "").toUpperCase() === sessionCode,
  ) || null) as Record<string, any> | null;
}

function getMissingLogBreakdown(
  item: AttendanceDailySummary,
): AttendanceDetailBreakdownItem[] {
  const details: AttendanceDetailBreakdownItem[] = [];
  const addDetail = (
    missing: boolean,
    label: string,
    amount: string | number | null | undefined,
  ) => {
    if (!missing) return;
    details.push({
      label,
      value: "ไม่พบรายการลงเวลา",
      amount: toNumber(amount) > 0 ? amount : undefined,
    });
  };

  addDetail(
    item.isMorningMissing || Boolean(item.isAbsent && !item.morningInAt),
    "รอบเข้าเช้า",
    item.isAbsent ? undefined : item.missingMorningPenaltyAmount,
  );
  addDetail(
    item.isAfternoonMissing || Boolean(item.isAbsent && !item.afternoonInAt),
    "รอบเข้าบ่าย",
    item.isAbsent ? undefined : item.missingAfternoonPenaltyAmount,
  );
  addDetail(
    item.isCheckoutMissing || Boolean(item.isAbsent && !item.checkOutAt),
    "รอบออกงาน",
    item.isAbsent ? undefined : item.missingCheckoutPenaltyAmount,
  );

  if (!details.length && item.hasMissingLog) {
    details.push({ label: "รอบที่ระบบตรวจพบ", value: "ไม่พบรายการลงเวลา" });
  }

  return details;
}

function getLateBreakdown(
  item: AttendanceDailySummary,
): AttendanceDetailBreakdownItem[] {
  const details: AttendanceDetailBreakdownItem[] = [];
  const morningLateMinutes = toNumber(item.morningLateMinutes);
  const afternoonLateMinutes = toNumber(item.afternoonLateMinutes);

  if (morningLateMinutes > 0) {
    details.push({
      label: "สายช่วงเช้า",
      value: `${numberText(morningLateMinutes)} นาที`,
    });
  }
  if (afternoonLateMinutes > 0) {
    details.push({
      label: "สายช่วงบ่าย",
      value: `${numberText(afternoonLateMinutes)} นาที`,
    });
  }

  if (!details.length && toNumber(item.totalLateMinutes) > 0) {
    details.push({
      label: "เวลาสายที่ระบบคำนวณ",
      value: `${numberText(item.totalLateMinutes)} นาที`,
    });
  }

  return details;
}

function getEarlyCheckoutBreakdown(
  item: AttendanceDailySummary,
): AttendanceDetailBreakdownItem[] {
  const minutes = toNumber(item.earlyCheckoutMinutes);
  if (minutes <= 0) return [];

  const checkoutRule = getAttendanceSessionRule(item, "CHECK_OUT");
  const actualTime = formatCalendarTime(item.checkOutAt);
  const expectedTime = formatCalendarTime(
    String(checkoutRule?.earlyBeforeTime || checkoutRule?.expectedTime || ""),
  );
  const details: AttendanceDetailBreakdownItem[] = [
    {
      label: "รอบออกงาน",
      value: `ออกก่อน ${numberText(minutes)} นาที`,
    },
  ];

  if (actualTime) details.push({ label: "เวลาออกงานจริง", value: actualTime });
  if (expectedTime) details.push({ label: "เวลาอ้างอิง", value: expectedTime });

  return details;
}

function getLeaveBreakdown(
  item: AttendanceDailySummary,
): AttendanceDetailBreakdownItem[] {
  const paidMinutes = toNumber(item.paidLeaveMinutes);
  const unpaidMinutes = toNumber(item.unpaidLeaveMinutes);
  const totalMinutes = paidMinutes + unpaidMinutes;
  const details: AttendanceDetailBreakdownItem[] = [];

  if (item.leaveType?.nameTh) {
    details.push({ label: "ประเภทการลา", value: item.leaveType.nameTh });
  }
  if (item.leaveDayType) {
    details.push({
      label: "ช่วงการลา",
      value: formatLeaveDayType(item.leaveDayType),
    });
  }
  if (totalMinutes > 0) {
    details.push({
      label: "ระยะเวลาที่ครอบคลุม",
      value: minutesToHoursText(totalMinutes),
    });
  } else if (toNumber(item.leaveDurationDays) > 0) {
    details.push({
      label: "ระยะเวลาที่ครอบคลุม",
      value: `${numberText(item.leaveDurationDays)} วัน`,
    });
  }

  const isPaid = item.leaveIsPaid ?? item.leaveType?.isPaid;
  if (typeof isPaid === "boolean") {
    details.push({
      label: "สิทธิ์ค่าจ้าง",
      value: isPaid ? "ได้รับค่าจ้าง" : "ไม่ได้รับค่าจ้าง",
    });
  }

  return details;
}

function getOffsiteBreakdown(
  item: AttendanceDailySummary,
): AttendanceDetailBreakdownItem[] {
  const coverage = getPolicySnapshotRecord(item).approvedOffsiteCoverage as
    Record<string, any> | undefined;
  const details: AttendanceDetailBreakdownItem[] = [];
  const minutes = Math.max(
    toNumber(item.offsiteMinutes),
    toNumber(coverage?.minutes),
  );
  const coveredSessions = Array.isArray(coverage?.coveredSessions)
    ? coverage.coveredSessions
        .map((session: unknown) => {
          const normalized = String(session || "").toUpperCase();
          if (normalized === "MORNING") return "ช่วงเช้า";
          if (normalized === "AFTERNOON") return "ช่วงบ่าย";
          if (normalized === "CHECKOUT") return "รอบออกงาน";
          return "";
        })
        .filter(Boolean)
    : [];
  const status = String(
    coverage?.status || item.offsiteStatus || "",
  ).toUpperCase();

  if (minutes > 0) {
    details.push({
      label: "ระยะเวลาที่ครอบคลุม",
      value: minutesToHoursText(minutes),
    });
  }
  if (coveredSessions.length > 0) {
    details.push({
      label: "รอบเวลาที่ครอบคลุม",
      value: coveredSessions.join(" / "),
    });
  }
  if (status) {
    details.push({
      label: "สถานะ",
      value: ["APPROVED", "HR_APPROVED", "MANAGER_APPROVED"].includes(status)
        ? "อนุมัติแล้ว"
        : coverage?.needsReview
          ? "รอตรวจสอบ"
          : status,
    });
  }

  return details;
}

function getApprovedOtBreakdown(
  item: AttendanceDailySummary,
): AttendanceDetailBreakdownItem[] {
  const details: AttendanceDetailBreakdownItem[] = [];
  const addOt = (
    label: string,
    hours: string | number | null | undefined,
    amount: string | number | null | undefined,
  ) => {
    const minutes = Math.round(toNumber(hours) * 60);
    if (minutes <= 0 && toNumber(amount) <= 0) return;
    details.push({
      label,
      value: minutes > 0 ? minutesToHoursText(minutes) : undefined,
      amount: toNumber(amount) > 0 ? amount : undefined,
      amountLabel: "เงิน OT",
      tone: "green",
    });
  };

  addOt(
    "วันทำงานปกติ",
    item.approvedOvertimeWorkdayHours,
    item.approvedOvertimeWorkdayAmountPreview,
  );
  addOt(
    "วันหยุด",
    item.approvedOvertimeHolidayHours,
    item.approvedOvertimeHolidayAmountPreview,
  );
  addOt(
    "วันหยุดพิเศษ",
    item.approvedOvertimeSpecialHolidayHours,
    item.approvedOvertimeSpecialHolidayAmountPreview,
  );

  if (!details.length && getApprovedOtMinutes(item) > 0) {
    details.push({
      label: "OT ที่อนุมัติ",
      value: minutesToHoursText(getApprovedOtMinutes(item)),
    });
  }

  return details;
}

function getExtraPresenceBreakdown(
  item: AttendanceDailySummary,
): AttendanceDetailBreakdownItem[] {
  const minutes = Math.max(
    toNumber(item.extraPresenceMinutes),
    toNumber(item.lateCheckoutMinutes),
  );
  if (minutes <= 0) return [];

  return [
    {
      label: "อยู่หลังเวลางาน",
      value: `${numberText(minutes)} นาที`,
    },
    {
      label: "เงื่อนไขการจ่าย",
      value: "ไม่นับเป็น OT อัตโนมัติ ต้องมีรายการอนุมัติ",
    },
  ];
}

function getIssueCountForOption(
  option: DailyIssueFilter,
  summary: AttendanceDailySummaryListSummary,
) {
  if (!option) return summary.total;
  if (option === "NEED_REVIEW") return summary.needReview;
  if (option === "MISSING_LOG") return summary.missingLogCount;
  if (option === "ABSENT") return toNumber(summary.absentCount);
  if (option === "LATE") return summary.lateCount;
  if (option === "EARLY_CHECKOUT") return toNumber(summary.earlyCheckoutCount);
  if (option === "TIME_ADJUST") return toNumber(summary.timeAdjustRequestCount);
  if (option === "PENALTY") return toNumber(summary.issueCount);
  if (option === "READY_FOR_PAYROLL") return summary.readyForPayroll;
  if (option === "LOCKED") return summary.locked;
  return 0;
}

const timeAdjustStatusLabels: Record<string, string> = {
  DRAFT: "แบบร่าง",
  SUBMITTED: "รออนุมัติแก้เวลา",
  APPROVED: "แก้เวลาแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิก",
};

const timeAdjustTypeLabels: Record<string, string> = {
  WRONG_TIME: "เวลาผิด",
  MISSING_CHECK_IN: "ลืมลงเวลาเข้า",
  MISSING_CHECK_OUT: "ลืมลงเวลาออก",
  MISSING_BREAK: "ลืมลงเวลาพัก",
  OTHER: "อื่น ๆ",
};

function timeAdjustTargetLogLabel(
  request: NonNullable<AttendanceDailySummary["timeAdjustRequests"]>[number],
) {
  return getAttendanceTimeSlotLabel({
    logType: request.targetLogType,
    logTime: getTimeAdjustRequestedTime(request),
    session: request.originalAttendanceLog?.session,
    fallback: request.targetLogType,
  });
}

function getTimeAdjustRequests(item: AttendanceDailySummary) {
  return item.timeAdjustRequests ?? [];
}

function getTimeAdjustBadge(item: AttendanceDailySummary) {
  const requests = getTimeAdjustRequests(item);
  if (!requests.length) return null;

  const pending = toNumber(item.pendingTimeAdjustRequestCount);
  const approved = toNumber(item.approvedTimeAdjustRequestCount);
  const rejected = toNumber(item.rejectedTimeAdjustRequestCount);

  if (pending > 0) {
    return {
      label: `รอแก้เวลา ${pending.toLocaleString("th-TH")}`,
      tone: "amber" as const,
    };
  }
  if (approved > 0) {
    return {
      label: `แก้เวลาแล้ว ${approved.toLocaleString("th-TH")}`,
      tone: "green" as const,
    };
  }
  if (rejected > 0) {
    return {
      label: `ไม่อนุมัติแก้เวลา ${rejected.toLocaleString("th-TH")}`,
      tone: "red" as const,
    };
  }

  return {
    label: `มีคำขอแก้เวลา ${requests.length.toLocaleString("th-TH")}`,
    tone: "blue" as const,
  };
}

function timeAdjustPillClass(status: string) {
  if (status === "SUBMITTED") return pillClass("amber");
  if (status === "APPROVED") return pillClass("green");
  if (status === "REJECTED") return pillClass("red");
  return pillClass("slate");
}

function getTimeAdjustOriginalTime(
  request: NonNullable<AttendanceDailySummary["timeAdjustRequests"]>[number],
) {
  return (
    request?.originalLogTime || request?.originalAttendanceLog?.logTime || null
  );
}

function getTimeAdjustRequestedTime(
  request: NonNullable<AttendanceDailySummary["timeAdjustRequests"]>[number],
) {
  return request?.requestedLogTime || request?.appliedLogTime || null;
}

/**
 * ตัวกรองสังกัดในแถบเครื่องมือ
 * ไม่มีป้ายกำกับด้านบน — ตัวเลือกแรก ("ทุกสาขา" ฯลฯ) บอกอยู่แล้วว่าช่องนี้กรองอะไร
 * ทำให้แถบเครื่องมือเตี้ยลงครึ่งหนึ่งและตารางขึ้นมาอยู่ในจอแรก
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
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:w-[9rem]">
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
  className,
}: {
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: OrgOption[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={allLabel}
      // ห้ามใส่ความกว้างตายตัว — กริดของแถบตัวกรองเป็นคนคุมความกว้าง
      className={cn("w-full bg-slate-50/80", className)}
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

type AttendanceDetailDialogProps = {
  item: AttendanceDailySummary;
  onClose: () => void;
  onMarkReviewed?: (item: AttendanceDailySummary) => void;
  onSummaryUpdated?: (updated: AttendanceDailySummary) => void;
};

function toCoordinateNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : null;
}

function buildGoogleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function buildGoogleMapsEmbedUrl(latitude: number, longitude: number) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(
    `${latitude},${longitude}`,
  )}&z=17&output=embed`;
}

function punchLocationLabel(log: AttendanceLog) {
  return getAttendanceTimeSlotLabel({
    logType: log.logType,
    logTime: log.logTime,
    session: log.session,
    fallback: log.logType,
  });
}

type AttendanceLocationDialogProps = {
  employeeId: string;
  workDate: string;
  employeeName: string;
  avatarUrl: string;
  orgLabel: string;
  onClose: () => void;
};

// ป๊อปอัพแสดงตำแหน่งที่พนักงานกดลงเวลา (โดยเฉพาะคนทำงานนอกสถานที่) บน Google Map
function AttendanceLocationDialog({
  employeeId,
  workDate,
  employeeName,
  avatarUrl,
  orgLabel,
  onClose,
}: AttendanceLocationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await getAttendanceLogs({
          employeeId,
          dateFrom: workDate,
          dateTo: workDate,
          pageSize: 100,
        });
        if (cancelled) return;
        const withCoords = (result.items ?? []).filter(
          (log) =>
            toCoordinateNumber(log.latitude) !== null &&
            toCoordinateNumber(log.longitude) !== null,
        );
        setLogs(withCoords);
        setActiveLogId(withCoords[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "ไม่สามารถโหลดตำแหน่งลงเวลาได้",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, workDate]);

  const activeLog =
    logs.find((log) => log.id === activeLogId) ?? logs[0] ?? null;
  const activeLat = activeLog ? toCoordinateNumber(activeLog.latitude) : null;
  const activeLng = activeLog ? toCoordinateNumber(activeLog.longitude) : null;

  return (
    <Modal
      open
      size="lg"
      title="ตำแหน่งที่ลงเวลา"
      description={formatThaiDate(workDate)}
      onClose={onClose}
    >
      <div className="-mx-5 -mt-5 mb-4 flex items-center gap-3 border-b border-slate-200 px-5 pb-3.5">
        <Avatar name={employeeName} src={avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-slate-900 3xl:text-[15px]">
            {employeeName}
          </p>
          <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
            {orgLabel}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <Notice tone="critical">{error}</Notice>
      ) : logs.length === 0 ? (
        <EmptyState
          title="ไม่มีข้อมูลพิกัด GPS ในวันนี้"
          description="พนักงานอาจลงเวลาผ่านเครื่องสแกน หรือไม่ได้แนบพิกัดขณะกด"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* รายการจุดลงเวลา — คั่นด้วยเส้น ไม่ใช่การ์ดใบเล็กเรียงกัน */}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {logs.map((log) => {
              const isActive = log.id === activeLog?.id;
              const offsite = Boolean(log.isOffsite);
              const distance = toCoordinateNumber(
                log.distanceFromApprovedLocationMeters,
              );

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setActiveLogId(log.id)}
                  className={cn(
                    "w-full px-3.5 py-3 text-left transition",
                    isActive ? "bg-brand-50" : "bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
                      {punchLocationLabel(log)}
                    </span>
                    <span className="text-[12px] tabular-nums text-slate-500">
                      <TimeOnlyDisplay value={log.logTime} />
                    </span>
                  </div>

                  <p className="mt-1 truncate text-[11px] text-slate-400 3xl:text-[12px]">
                    {[
                      offsite ? "นอกสถานที่" : "ในสถานที่",
                      log.locationVerified === false ? "นอกรัศมี" : "",
                      distance !== null
                        ? `ห่าง ${Math.round(distance).toLocaleString("th-TH")} ม.`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-300 3xl:text-[12px]">
                    {toCoordinateNumber(log.latitude)?.toFixed(6)},{" "}
                    {toCoordinateNumber(log.longitude)?.toFixed(6)}
                  </p>
                </button>
              );
            })}
          </div>

          {activeLat !== null && activeLng !== null ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <iframe
                  key={`${activeLat},${activeLng}`}
                  title="Google Map"
                  src={buildGoogleMapsEmbedUrl(activeLat, activeLng)}
                  className="h-[320px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              <ButtonLink
                href={buildGoogleMapsUrl(activeLat, activeLng)}
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                className="w-full"
              >
                เปิดใน Google Maps
              </ButtonLink>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function AttendanceDetailDialog({
  item,
  onClose,
  onMarkReviewed,
  onSummaryUpdated,
}: AttendanceDetailDialogProps) {
  const reviewStatus = getDisplayReviewStatus(item);
  const reviewReasons = getAttendanceReviewReasons(item);
  const payrollLinked = isPayrollLinked(item);
  const missingLabel = item.isAbsent
    ? getAbsenceSummaryLabel(item)
    : getMissingLogSummaryLabel(item);
  const missingDeduction = item.isAbsent
    ? item.absentDeductionAmount
    : item.missingLogPenaltyAmount;
  const totalDeduction = toNumber(item.totalDeductionAmount);
  const unpaidLeaveDeduction = toNumber(item.unpaidLeaveDeductionAmount);
  const lateMinutes = toNumber(item.totalLateMinutes);
  const lateDeduction = toNumber(item.latePenaltyAmount);
  const earlyCheckoutMinutes = toNumber(item.earlyCheckoutMinutes);
  const earlyCheckoutDeduction = toNumber(item.earlyCheckoutPenaltyAmount);
  const approvedOtMinutes = getApprovedOtMinutes(item);
  const approvedOtAmount = getApprovedOvertimeAmount(item);
  const timeAdjustRequests = getTimeAdjustRequests(item);
  const timeAdjustBadge = getTimeAdjustBadge(item);
  const missingBreakdown = getMissingLogBreakdown(item);
  const lateBreakdown = getLateBreakdown(item);
  const earlyCheckoutBreakdown = getEarlyCheckoutBreakdown(item);
  const leaveBreakdown = getLeaveBreakdown(item);
  const offsiteBreakdown = getOffsiteBreakdown(item);
  const approvedOtBreakdown = getApprovedOtBreakdown(item);
  const extraPresenceBreakdown = getExtraPresenceBreakdown(item);
  const hasLeaveEvent = Boolean(
    item.leaveRequestId ||
    item.leaveTypeId ||
    item.leaveRequest ||
    item.leaveType ||
    toNumber(item.paidLeaveMinutes) > 0 ||
    toNumber(item.unpaidLeaveMinutes) > 0,
  );
  const leaveIsPaid =
    item.leaveIsPaid ??
    item.leaveType?.isPaid ??
    (toNumber(item.paidLeaveMinutes) > 0 &&
      toNumber(item.unpaidLeaveMinutes) <= 0);
  const leaveSummaryLabel =
    item.leaveType?.nameTh ||
    (leaveIsPaid ? "ลาได้รับค่าจ้าง" : "ลาไม่ได้รับค่าจ้าง");
  const hasOffsiteEvent = Boolean(
    toNumber(item.offsiteMinutes) > 0 ||
    item.offsiteStatus ||
    offsiteBreakdown.length > 0,
  );
  /*
   * `calculationNote` เป็นสรุปรวมทุกอย่างของวันนั้นที่ backend ประกอบมา — ขาดงาน
   * ไม่พบเวลา มาสาย ออกก่อนเวลา ใบลา นอกสถานที่ ฯลฯ ซึ่งจอนี้มีบรรทัดของตัวเอง
   * ให้ทุกเรื่องแล้ว ถ้าพิมพ์ทั้งก้อนออกมาจะกลายเป็นพูดเรื่องเดิมซ้ำรอบที่สาม
   *
   * จึงเหลือไว้เฉพาะบรรทัดที่ "ไม่มีที่อยู่" ในจอนี้ เช่นเหตุผลการขาดงานที่ HR พิมพ์เอง
   * หรือหมายเหตุจากนโยบายที่ระบบแนบมา ถ้ากรองแล้วไม่เหลืออะไร ก็ไม่ต้องแสดงหัวข้อ
   */
  const calculationNote =
    formatAttendanceCalculationNote(item)
      ?.split("\n")
      .filter((line) => {
        const covered = [
          "ขาดงาน",
          "ไม่มีเวลา",
          "ไม่พบเวลา",
          "มาสายรวม",
          "ออกก่อนเวลา",
          "ไม่มีรายการหักเงิน",
        ].some((prefix) => line.startsWith(prefix));
        if (covered) return false;

        /* บรรทัดที่พูดเรื่องเดียวกับ "เหตุผลที่ต้องตรวจสอบ" ด้านบน */
        return !reviewReasons.some((reason) =>
          [reason.label, reason.detail]
            .filter(Boolean)
            .some(
              (text) => line.includes(String(text)) || String(text).includes(line),
            ),
        );
      })
      .join("\n") || null;
  const hasMissingIssue = Boolean(
    item.isAbsent ||
    item.hasMissingLog ||
    item.isMorningMissing ||
    item.isAfternoonMissing ||
    item.isCheckoutMissing ||
    toNumber(missingDeduction) > 0,
  );
  const hasDailyIssue =
    hasMissingIssue ||
    lateMinutes > 0 ||
    lateDeduction > 0 ||
    earlyCheckoutMinutes > 0 ||
    earlyCheckoutDeduction > 0 ||
    hasLeaveEvent ||
    hasOffsiteEvent ||
    extraPresenceBreakdown.length > 0 ||
    approvedOtMinutes > 0 ||
    approvedOtAmount > 0;
  const canConfirmReview =
    canMarkAttendanceReviewed(item) && Boolean(onMarkReviewed);

  return (
    <Modal
      open
      size="lg"
      title="รายละเอียดการลงเวลา"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>ปิด</Button>
          {canConfirmReview && onMarkReviewed ? (
            <Button
              variant="primary"
              icon={<FileCheck2 className="h-3.5 w-3.5" />}
              onClick={() => onMarkReviewed(item)}
            >
              ยืนยันการตรวจสอบ
            </Button>
          ) : null}
        </>
      }
    >
      <div className="-mx-5 -my-5">
        {/*
         * แถวตัวตนอยู่บนพื้นฟ้าอ่อน ทำหน้าที่เป็น "หัวเรื่องจริง" ของกล่อง
         * หัวกล่องด้านบนบอกแค่ว่านี่คือจออะไร
         */}
        <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
          <Avatar
            name={employeeName(item)}
            src={getEmployeeAvatarUrl(item)}
            size="md"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-slate-900 3xl:text-[15px]">
              {employeeName(item)}
            </p>
            <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
              {item.employee?.employeeCode || "-"} · {orgText(item)}
            </p>
          </div>

          <span className={statusBadgeClass(reviewStatus)}>
            {getDisplayReviewStatusLabel(item)}
          </span>
          {timeAdjustBadge ? (
            <span className={pillClass(timeAdjustBadge.tone)}>
              {timeAdjustBadge.label}
            </span>
          ) : null}
          {payrollLinked ? (
            <span className={pillClass("slate")}>ผูก Payroll แล้ว</span>
          ) : null}
        </div>

        <div>
          <section className="px-5 py-4">
            {/* วันที่ไม่ต้องซ้ำ — หัวกล่องบอกไปแล้วว่าเป็นของวันไหน */}
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              เวลาเข้า-ออกงาน
            </p>

            <div className="mt-2 grid grid-cols-2 divide-x divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100 sm:grid-cols-4 sm:divide-y-0">
              <AttendanceTimeSlotDisplay
                item={item}
                slot="morning"
                label="เข้าเช้า"
                value={item.morningInAt}
                variant="summary"
              />
              <AttendanceTimeSlotDisplay
                item={item}
                slot="afternoon"
                label="เข้าบ่าย"
                value={item.afternoonInAt}
                variant="summary"
              />
              <AttendanceTimeSlotDisplay
                item={item}
                slot="checkout"
                label="ออกงาน"
                value={item.checkOutAt}
                variant="summary"
              />
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                  OT อนุมัติ
                </p>
                <p className="mt-0.5 truncate text-[14.5px] font-bold leading-5 tabular-nums text-slate-900">
                  {minutesToHoursText(approvedOtMinutes)}
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-brand-100 px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                เหตุการณ์และยอดเงินของวันนี้
              </p>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  ยอดหักรวม
                </p>
                <p
                  className={cn(
                    "text-[17px] font-extrabold leading-6 tabular-nums",
                    totalDeduction > 0 ? "text-rose-600" : "text-slate-400",
                  )}
                >
                  {money(totalDeduction)} บ.
                </p>
              </div>
            </div>

            <div className="mt-2 divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100">
              {hasMissingIssue ? (
                <AttendanceDetailSummaryRow
                  label={missingLabel}
                  detail={
                    item.isAbsent
                      ? "ไม่พบการลงเวลาครบตามรอบที่กำหนด"
                      : "แจกแจงรอบที่ยังไม่มีรายการลงเวลา"
                  }
                  details={missingBreakdown}
                  amount={missingDeduction}
                />
              ) : null}
              {/* ลงเวลาไม่ครบบางวันเป็นเรื่องออกทำงานข้างนอก ให้ HR เลือกได้ว่าจะหักไหม */}
              {!item.isAbsent && hasMissingLogPenaltyDecision(item) ? (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 px-3.5 py-2.5">
                  <p className="text-[12px] font-medium text-slate-500">
                    ค่าปรับลืมสแกนของวันนี้
                  </p>
                  <MissingLogPenaltyWaiverControl
                    summary={item}
                    onChanged={onSummaryUpdated}
                  />
                </div>
              ) : null}
              {lateMinutes > 0 || lateDeduction > 0 ? (
                <AttendanceDetailSummaryRow
                  label={`มาสาย ${numberText(lateMinutes)} นาที`}
                  detail="แจกแจงเวลาสายตามรอบการทำงาน"
                  details={lateBreakdown}
                  amount={lateDeduction}
                />
              ) : null}
              {earlyCheckoutMinutes > 0 || earlyCheckoutDeduction > 0 ? (
                <AttendanceDetailSummaryRow
                  label={`ออกก่อนเวลา ${numberText(earlyCheckoutMinutes)} นาที`}
                  detail="รายละเอียดรอบออกงานและเวลาอ้างอิง"
                  details={earlyCheckoutBreakdown}
                  amount={earlyCheckoutDeduction}
                />
              ) : null}
              {hasLeaveEvent ? (
                <AttendanceDetailSummaryRow
                  label={leaveSummaryLabel}
                  detail="รายละเอียดใบลาที่ครอบคลุมวันนี้"
                  details={leaveBreakdown}
                  amount={
                    unpaidLeaveDeduction > 0 ? unpaidLeaveDeduction : undefined
                  }
                  tone={unpaidLeaveDeduction > 0 ? "red" : "slate"}
                />
              ) : null}
              {hasOffsiteEvent ? (
                <AttendanceDetailSummaryRow
                  label={`ทำงานนอกสถานที่${toNumber(item.offsiteMinutes) > 0 ? ` ${minutesToHoursText(item.offsiteMinutes)}` : ""}`}
                  detail="รายละเอียดช่วงเวลาที่คำขอครอบคลุม"
                  details={offsiteBreakdown}
                  tone="slate"
                />
              ) : null}
              {extraPresenceBreakdown.length > 0 ? (
                <AttendanceDetailSummaryRow
                  label={`อยู่เกินเวลางาน ${minutesToHoursText(
                    Math.max(
                      toNumber(item.extraPresenceMinutes),
                      toNumber(item.lateCheckoutMinutes),
                    ),
                  )}`}
                  detail="แสดงเวลาที่อยู่หลังเลิกงาน แยกจาก OT ที่อนุมัติ"
                  details={extraPresenceBreakdown}
                  tone="slate"
                />
              ) : null}
              {approvedOtMinutes > 0 || approvedOtAmount > 0 ? (
                <AttendanceDetailSummaryRow
                  label={`OT ${minutesToHoursText(approvedOtMinutes)}`}
                  detail="แจกแจงตามประเภทวันทำงาน"
                  details={approvedOtBreakdown}
                  amount={approvedOtAmount}
                  amountLabel="เงิน OT"
                  tone="green"
                />
              ) : null}
              {!hasDailyIssue ? (
                <p className="px-3.5 py-3 text-[13px] font-medium text-slate-500">
                  ไม่มีรายการผิดปกติหรือยอดเงินเพิ่มเติมในวันนี้
                </p>
              ) : null}
            </div>

            {calculationNote ? (
              <div className="mt-3 border-l-2 border-brand-200 pl-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  หมายเหตุ
                </p>
                <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[12.5px] leading-5 text-slate-600">
                  {calculationNote}
                </p>
              </div>
            ) : null}
          </section>

          {timeAdjustRequests.length > 0 ? (
            <section className="border-t border-brand-100 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  คำขอแก้เวลาที่เกี่ยวข้อง
                </p>
                <span className="text-[12.5px] tabular-nums text-slate-500">
                  {numberText(timeAdjustRequests.length)} รายการ
                </span>
              </div>

              <div className="mt-2 divide-y divide-brand-100 border-y border-brand-100">
                {timeAdjustRequests.map((request) => (
                  <div key={request.id} className="py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {timeAdjustTypeLabels[request.adjustType] ||
                            request.adjustType}{" "}
                          · {timeAdjustTargetLogLabel(request)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-violet-700">
                          <TimeOnlyDisplay
                            value={getTimeAdjustOriginalTime(request)}
                          />{" "}
                          →{" "}
                          <TimeOnlyDisplay
                            value={getTimeAdjustRequestedTime(request)}
                          />
                        </p>
                        {request.reason ? (
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                            เหตุผล: {request.reason}
                          </p>
                        ) : null}
                      </div>
                      <span className={timeAdjustPillClass(request.status)}>
                        {timeAdjustStatusLabels[request.status] ||
                          request.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function AttendanceDetailSummaryRow({
  label,
  detail,
  details = [],
  amount,
  amountLabel = "ยอดหัก",
  tone = "red",
}: {
  label: string;
  detail?: string;
  details?: AttendanceDetailBreakdownItem[];
  amount?: string | number | null;
  amountLabel?: string;
  tone?: "red" | "green" | "slate";
}) {
  const hasAmount = amount !== null && amount !== undefined;
  /*
   * คำอธิบายใต้หัวข้อเป็นประโยคบอกว่า "ข้างล่างนี้คือรายการแจกแจง" ซึ่งไม่ได้ให้ข้อมูล
   * เพิ่มเมื่อรายการแจกแจงแสดงอยู่แล้ว — โชว์เฉพาะตอนที่ไม่มีรายการย่อย
   */
  const showDetailText = Boolean(detail) && details.length === 0;
  /*
   * รายการย่อยรายการเดียวที่ยอดเท่ากับยอดหลัก = พิมพ์เลขเดิมซ้ำสองที่ในสองบรรทัดติดกัน
   * กรณีนี้ให้เหลือยอดหลักอันเดียว
   */
  const hideSubAmount =
    details.length === 1 &&
    hasAmount &&
    toNumber(details[0]?.amount) === toNumber(amount);
  const amountToneClass =
    tone === "green"
      ? "text-emerald-700"
      : tone === "slate"
        ? "text-slate-600"
        : "text-rose-600";

  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-slate-900">{label}</p>
          {showDetailText ? (
            <p className="mt-0.5 text-[12px] text-slate-500">{detail}</p>
          ) : null}
        </div>
        {hasAmount ? (
          <p
            className={cn(
              "shrink-0 whitespace-nowrap text-sm font-bold tabular-nums",
              amountToneClass,
            )}
          >
            {amountLabel} {money(amount)} บ.
          </p>
        ) : null}
      </div>

      {/* รายการย่อยใช้ขีดนำหน้า ไม่ใช่กล่องเทาซ้อนอยู่ในกล่อง */}
      {details.length > 0 ? (
        <div className="mt-1.5 space-y-1 border-l-2 border-brand-200 pl-3">
          {details.map((item, index) => {
            const subAmountToneClass =
              item.tone === "green"
                ? "text-emerald-700"
                : item.tone === "slate"
                  ? "text-slate-600"
                  : "text-rose-600";
            const hasSubAmount =
              !hideSubAmount &&
              item.amount !== null &&
              item.amount !== undefined;

            return (
              <div
                key={`${item.label}-${index}`}
                className="flex items-start justify-between gap-3 text-xs leading-5"
              >
                <div className="min-w-0 text-slate-600">
                  <span className="font-medium">{item.label}</span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 text-right tabular-nums">
                  {item.value ? (
                    <span className="font-semibold text-slate-700">
                      {item.value}
                    </span>
                  ) : null}
                  {hasSubAmount ? (
                    <span className={cn("font-bold", subAmountToneClass)}>
                      {item.amountLabel || "ยอดหัก"} {money(item.amount)} บ.
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PaginationFooter({
  meta,
  page,
  onPageChange,
}: {
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, meta.totalPages || 1);

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
      <span className="text-[13px] text-slate-400">
        หน้า {numberText(page)} จาก {numberText(totalPages)} · ทั้งหมด{" "}
        {numberText(meta.total)} รายการ
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(Math.max(1, page - 1));
            scrollPagerToTop();
          }}
        >
          ก่อนหน้า
        </Button>
        <Button
          size="sm"
          disabled={page >= totalPages}
          onClick={() => {
            onPageChange(Math.min(totalPages, page + 1));
            scrollPagerToTop();
          }}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}

export default function AttendanceDailyPage() {
  const { user } = useAuth();
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
  const canManageAttendanceReview = userPermissions.includes(
    "ATTENDANCE_RECALCULATE",
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FilterState>(() =>
    buildInitialFilters(),
  );
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() =>
    buildInitialFilters(),
  );
  const [items, setItems] = useState<AttendanceDailySummary[]>([]);
  const [meta, setMeta] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [summary, setSummary] =
    useState<AttendanceDailySummaryListSummary>(EMPTY_DAILY_SUMMARY);
  const [detailItem, setDetailItem] = useState<AttendanceDailySummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
  ] = useState<number | null>(null);
  const [recalculationProgressDismissed, setRecalculationProgressDismissed] =
    useState(false);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [companies, setCompanies] = useState<OrgOption[]>([]);
  const [branches, setBranches] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [divisions, setDivisions] = useState<OrgOption[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<OrgOption[]>([]);
  const [reviewDialog, setReviewDialog] = useState<ActionDialogState | null>(
    null,
  );
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [locationTarget, setLocationTarget] = useState<{
    employeeId: string;
    workDate: string;
    employeeName: string;
    avatarUrl: string;
    orgLabel: string;
  } | null>(null);
  const loadSequenceRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const lastDataLoadedAtRef = useRef(0);
  const lastHandledWorkflowChangedAtRef = useRef(0);
  const workflowRefreshTimerRef = useRef<number | null>(null);
  const pendingWorkflowChangedAtRef = useRef(0);
  const interactionBusyRef = useRef(false);

  const recalculationProgressVisible =
    !recalculationProgressDismissed &&
    (submitting ||
      recalculationProgress?.status === "RUNNING" ||
      recalculationProgress?.status === "COMPLETED" ||
      recalculationProgress?.status === "FAILED" ||
      /* ไม่ใส่สองสถานะนี้ กล่องจะหายทันทีที่กดหยุด ดูเหมือนปุ่มไม่ทำงาน */
      recalculationProgress?.status === "CANCELLING" ||
      recalculationProgress?.status === "CANCELLED");
  const recalculationDisplayElapsedMs =
    recalculationProgressElapsedMs || recalculationProgress?.elapsedMs || 0;

  const filterBranchOptions = useMemo(() => {
    return branches.filter((branch) => {
      if (!draftFilters.companyId) return true;
      return branch.companyId === draftFilters.companyId;
    });
  }, [branches, draftFilters.companyId]);

  const filterDepartmentOptions = useMemo(() => {
    return departments.filter((department) => {
      if (
        draftFilters.companyId &&
        department.companyId !== draftFilters.companyId
      )
        return false;
      if (
        draftFilters.branchId &&
        department.branchId !== draftFilters.branchId
      )
        return false;
      return true;
    });
  }, [departments, draftFilters.branchId, draftFilters.companyId]);

  const filterDivisionOptions = useMemo(() => {
    return divisions.filter((division) => {
      const department = departments.find(
        (item) => item.id === division.departmentId,
      );
      if (
        draftFilters.departmentId &&
        division.departmentId !== draftFilters.departmentId
      )
        return false;
      if (
        draftFilters.companyId &&
        department?.companyId !== draftFilters.companyId
      )
        return false;
      if (
        draftFilters.branchId &&
        department?.branchId !== draftFilters.branchId
      )
        return false;
      return true;
    });
  }, [
    departments,
    divisions,
    draftFilters.branchId,
    draftFilters.companyId,
    draftFilters.departmentId,
  ]);

  const activeFilterCount = useMemo(() => {
    return [
      draftFilters.companyId,
      draftFilters.branchId,
      draftFilters.departmentId,
      draftFilters.divisionId,
      draftFilters.employeeTypeId,
      draftFilters.search.trim(),
      draftFilters.issue,
    ].filter(Boolean).length;
  }, [draftFilters, tenantScope]);

  // จำนวนช่องตัวกรองที่แสดงจริง: แผนก + ฝ่าย + ประเภทพนักงาน (คงที่ 3) บวกบริษัท/สาขาที่แสดงเฉพาะเมื่อมีให้เลือกมากกว่า 1
  const loadMasterData = useCallback(async () => {
    setMastersLoading(true);
    try {
      const [
        companyResult,
        branchResult,
        departmentResult,
        divisionResult,
        typeResult,
      ] = await Promise.all([
        apiFetchWithMeta<OrgOption[], unknown>(
          "/organization/companies?pageSize=200",
        ),
        apiFetchWithMeta<OrgOption[], unknown>(
          "/organization/branches?pageSize=300",
        ),
        apiFetchWithMeta<OrgOption[], unknown>(
          "/organization/departments?pageSize=500",
        ),
        apiFetchWithMeta<OrgOption[], unknown>(
          "/organization/divisions?pageSize=500",
        ),
        apiFetchWithMeta<OrgOption[], unknown>(
          "/organization/employee-types?pageSize=200",
        ),
      ]);

      setCompanies(
        filterCompaniesForAttendanceScope(
          companyResult.data ?? [],
          tenantScope,
        ),
      );
      setBranches(
        filterBranchesForAttendanceScope(branchResult.data ?? [], tenantScope),
      );
      setDepartments(
        filterOrgUnitsForAttendanceScope(
          departmentResult.data ?? [],
          tenantScope,
        ),
      );
      setDivisions(
        filterOrgUnitsForAttendanceScope(
          divisionResult.data ?? [],
          tenantScope,
        ),
      );
      setEmployeeTypes(
        filterOrgUnitsForAttendanceScope(typeResult.data ?? [], tenantScope),
      );
    } finally {
      setMastersLoading(false);
    }
  }, [scopeBranchId, scopeCompanyId, scopeLevel, tenantScope]);

  const loadData = useCallback(
    async (
      nextFilters = appliedFilters,
      nextPage = page,
      options: { silent?: boolean } = {},
    ) => {
      const requestId = loadSequenceRef.current + 1;
      loadSequenceRef.current = requestId;
      const requestStartedAt = Date.now();
      const silent = Boolean(options.silent);

      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        const normalizedFilters = applyAttendanceTenantScope(
          normalizeDateRange(nextFilters),
          tenantScope,
        );
        const result = await getAttendanceDailySummaries({
          page: nextPage,
          pageSize: PAGE_SIZE,
          search: normalizedFilters.search || undefined,
          companyId: normalizedFilters.companyId || undefined,
          branchId: normalizedFilters.branchId || undefined,
          departmentId: normalizedFilters.departmentId || undefined,
          divisionId: normalizedFilters.divisionId || undefined,
          employeeTypeId: normalizedFilters.employeeTypeId || undefined,
          dateFrom: normalizedFilters.dateFrom,
          dateTo: normalizedFilters.dateTo,
          issue: normalizedFilters.issue || undefined,
        });

        if (requestId !== loadSequenceRef.current) return;
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        setItems(result.items ?? []);
        setSummary(result.summary ?? EMPTY_DAILY_SUMMARY);
        setMeta(
          result.meta ?? {
            page: nextPage,
            pageSize: PAGE_SIZE,
            total: 0,
            totalPages: 1,
          },
        );
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
        if (requestId !== loadSequenceRef.current || silent) return;
        const message =
          err instanceof Error
            ? err.message
            : "ไม่สามารถโหลดข้อมูล Attendance ได้";
        if (hasLoadedOnceRef.current) {
          toast.error(message);
        } else {
          setError(message);
        }
      } finally {
        if (requestId === loadSequenceRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [appliedFilters, page, tenantScope],
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

  useEffect(() => {
    void loadMasterData();
  }, [loadMasterData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
        void loadData(appliedFilters, page, { silent: true });
      }, preferredDelay);
    },
    [appliedFilters, loadData, page],
  );

  useEffect(() => {
    const busy = Boolean(
      submitting ||
      reviewSubmitting ||
      detailItem ||
      reviewDialog ||
      locationTarget,
    );
    interactionBusyRef.current = busy;

    if (!busy && pendingWorkflowChangedAtRef.current > 0) {
      scheduleWorkflowRefresh(pendingWorkflowChangedAtRef.current, 250);
    }
  }, [
    detailItem,
    locationTarget,
    reviewDialog,
    reviewSubmitting,
    scheduleWorkflowRefresh,
    submitting,
  ]);

  useEffect(() => {
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
  }, [scheduleWorkflowRefresh]);

  const applySearch = () => {
    const normalizedFilters = applyAttendanceTenantScope(
      normalizeDateRange(draftFilters),
      tenantScope,
    );
    setPage(1);
    setDraftFilters(normalizedFilters);
    setAppliedFilters(normalizedFilters);
  };

  const shiftDateRange = useCallback(
    (direction: -1 | 1) => {
      setDraftFilters((current) => {
        const normalizedFilters = normalizeDateRange(current);
        const rangeDays = dateRangeLengthDays(
          normalizedFilters.dateFrom,
          normalizedFilters.dateTo,
        );
        const offset = direction * rangeDays;

        return applyAttendanceTenantScope(
          {
            ...normalizedFilters,
            dateFrom: addDaysInput(normalizedFilters.dateFrom, offset),
            dateTo: addDaysInput(normalizedFilters.dateTo, offset),
          },
          tenantScope,
        );
      });
    },
    [tenantScope],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalizedFilters = applyAttendanceTenantScope(
        normalizeDateRange(draftFilters),
        tenantScope,
      );
      setPage(1);
      setAppliedFilters(normalizedFilters);
      if (
        normalizedFilters.dateFrom !== draftFilters.dateFrom ||
        normalizedFilters.dateTo !== draftFilters.dateTo
      ) {
        setDraftFilters(normalizedFilters);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [draftFilters, tenantScope]);


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
    if (!recalculationProgressId || !submitting) return undefined;

    const progressId = recalculationProgressId;
    let cancelled = false;

    async function pollProgress() {
      try {
        const result = await getAttendanceRecalculationProgress(progressId);
        if (!cancelled) {
          setRecalculationProgress(result);
        }
      } catch {
        // The POST request may reach the backend a fraction before the first poll.
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
  }, [recalculationProgressId, submitting]);

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

    const timer = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(timer);
  }, [
    recalculationProgress?.startedAt,
    recalculationProgressFallbackStartedAt,
    recalculationProgressVisible,
  ]);

  useEffect(() => {
    if (submitting || recalculationProgress?.status !== "COMPLETED") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRecalculationProgressDismissed(true);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [recalculationProgress?.status, submitting]);

  const handleRecalculate = async () => {
    if (!canManageAttendanceReview) {
      toast.error("บัญชีนี้ไม่มีสิทธิ์คำนวณ Attendance ใหม่");
      return;
    }

    const normalizedFilters = applyAttendanceTenantScope(
      normalizeDateRange(draftFilters),
      tenantScope,
    );
    const progressId = createAttendanceProgressId();
    const startedAt = new Date().toISOString();

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
      setSubmitting(true);
      const result = await recalculateAttendanceDailySummaries({
        progressId,
        dateFrom: normalizedFilters.dateFrom,
        dateTo: normalizedFilters.dateTo,
        companyId: normalizedFilters.companyId || undefined,
        branchId: normalizedFilters.branchId || undefined,
        departmentId: normalizedFilters.departmentId || undefined,
        divisionId: normalizedFilters.divisionId || undefined,
        employeeTypeId: normalizedFilters.employeeTypeId || undefined,
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

      setPage(1);
      setDraftFilters(normalizedFilters);
      setAppliedFilters(normalizedFilters);
      await loadData(normalizedFilters, 1, { silent: true });
      /* สั่งหยุดกลางทางไม่ใช่ความสำเร็จ ห้ามขึ้นข้อความว่าคำนวณเสร็จ */
          if (result.cancelled) {
            toast.info(
              `หยุดการคำนวณแล้ว — คำนวณไปได้ ${result.calculated.toLocaleString("th-TH")} รายการ`,
            );
          } else {
            toast.success("คำนวณข้อมูล Attendance ใหม่แล้ว");
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
      toast.error(err instanceof Error ? err.message : "คำนวณใหม่ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const openMarkReviewedDialog = (item: AttendanceDailySummary) => {
    if (!canManageAttendanceReview) {
      toast.error("บัญชีนี้ไม่มีสิทธิ์ตรวจสอบ Attendance");
      return;
    }

    setReviewDialog({
      title: "ยืนยันว่าตรวจสอบแล้ว",
      description: `ยืนยันว่า HR ตรวจสถานะ Attendance ของ ${employeeName(item)} วันที่ ${formatThaiDate(item.workDate)} แล้ว และข้อมูลนี้พร้อมรอสรุปใน HR Review`,
      confirmLabel: "ตรวจแล้ว",
      cancelLabel: "ยกเลิก",
      tone: "emerald",
      reasonLabel: "หมายเหตุการตรวจ",
      reasonPlaceholder:
        "เช่น ตรวจสอบเวลา ลา นอกสถานที่ ยอดหัก และคำขอที่เกี่ยวข้องแล้ว",
      onConfirm: async (note?: string) => {
        setReviewSubmitting(true);
        try {
          const updated = await markAttendanceDailySummaryReviewed(item.id, {
            note,
          });
          setItems((current) =>
            current.map((row) => (row.id === updated.id ? updated : row)),
          );
          setDetailItem((current) =>
            current?.id === updated.id ? updated : current,
          );
          await loadData(appliedFilters, page, { silent: true });
          toast.success("บันทึกสถานะตรวจสอบแล้ว");
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "บันทึกสถานะตรวจสอบไม่สำเร็จ",
          );
          throw err;
        } finally {
          setReviewSubmitting(false);
        }
      },
    });
  };

  const metrics = summary;

  const issueCountLabel = useMemo(
    () =>
      issueOptions.map((option) => ({
        ...option,
        count: getIssueCountForOption(option.value, metrics),
      })),
    [metrics],
  );

  /* คำอธิบายสั้น ๆ ว่ากำลังกรองด้วยอะไรอยู่ — ผู้ใช้จะได้ไม่ต้องเปิดป๊อปอัพมาดู */
  const filterSummary = useMemo(() => {
    const orgName = (options: OrgOption[], id: string) => {
      if (!id) return "";
      const found = options.find((option) => option.id === id);
      return found
        ? found.nameTh || found.nameEn || found.code || found.id
        : "";
    };

    return [
      draftFilters.issue
        ? issueCountLabel.find((option) => option.value === draftFilters.issue)
            ?.label
        : "",
      orgName(companies, draftFilters.companyId),
      orgName(filterBranchOptions, draftFilters.branchId),
      orgName(filterDepartmentOptions, draftFilters.departmentId),
      orgName(filterDivisionOptions, draftFilters.divisionId),
      orgName(employeeTypes, draftFilters.employeeTypeId),
      draftFilters.search.trim(),
    ].filter(Boolean) as string[];
  }, [
    companies,
    draftFilters,
    employeeTypes,
    filterBranchOptions,
    filterDepartmentOptions,
    filterDivisionOptions,
    issueCountLabel,
  ]);

  const quickNeedReview = toNumber(metrics.issueCount);

  const departmentGroupRank = useMemo(
    () =>
      buildAttendanceDepartmentGroupRank(
        items,
        (item) => item.employee,
        attendanceDepartmentKey,
      ),
    [items],
  );

  /*
   * ลำดับแถว: วันที่ใหม่สุดก่อน → สาขา → แผนกตามกลุ่มการลงเวลา
   * (บริหาร → ลงครบ 3 รอบ → ยกเว้นเข้างานบ่าย → ยกเว้นรอบอื่น)
   * ในแผนกเดียวกันเรียงกลุ่มเดิมซ้ำอีกชั้น แล้วให้คนที่ดูตำแหน่งลงเวลาได้ขึ้นก่อน
   * จากนั้นเรียงตามระดับตำแหน่ง (ผู้บริหารขึ้นก่อน) ปิดท้ายด้วยรหัสพนักงาน
   * (เรียงเฉพาะรายการในหน้าที่แสดงอยู่ ข้อมูลแบ่งหน้ามาจาก backend)
   */
  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const dateDiff = attendanceDateKey(right).localeCompare(
          attendanceDateKey(left),
        );
        if (dateDiff !== 0) return dateDiff;

        const branchDiff = attendanceBranchSortText(
          left.employee,
        ).localeCompare(attendanceBranchSortText(right.employee), "th");
        if (branchDiff !== 0) return branchDiff;

        const departmentRankDiff =
          (departmentGroupRank.get(attendanceDepartmentKey(left)) ?? 99) -
          (departmentGroupRank.get(attendanceDepartmentKey(right)) ?? 99);
        if (departmentRankDiff !== 0) return departmentRankDiff;

        const departmentDiff = attendanceDepartmentSortText(
          left.employee,
        ).localeCompare(attendanceDepartmentSortText(right.employee), "th");
        if (departmentDiff !== 0) return departmentDiff;

        const groupDiff =
          getAttendanceSessionGroupRank(left.employee) -
          getAttendanceSessionGroupRank(right.employee);
        if (groupDiff !== 0) return groupDiff;

        const locationDiff =
          Number(canViewAttendanceLocation(right)) -
          Number(canViewAttendanceLocation(left));
        if (locationDiff !== 0) return locationDiff;

        const seniorityDiff = compareEmployeeSeniority(
          left.employee,
          right.employee,
        );
        if (seniorityDiff !== 0) return seniorityDiff;

        return (left.employee?.employeeCode || "").localeCompare(
          right.employee?.employeeCode || "",
        );
      }),
    [items, departmentGroupRank],
  );

  /** จำนวนคนของทุกหัวกลุ่ม — นับหัวคนไม่ใช่นับแถว ช่วงหลายวันคนเดิมจึงไม่ถูกนับซ้ำ */
  const groupEmployeeCounts = useMemo(() => {
    const employeeIds = new Map<string, Set<string>>();

    for (const item of items) {
      const employeeId = item.employee?.id;
      if (!employeeId) continue;

      const keys = [
        attendanceDateKey(item),
        attendanceBranchKey(item),
        attendanceDepartmentKey(item),
      ];

      for (const key of keys) {
        const current = employeeIds.get(key) ?? new Set<string>();
        current.add(employeeId);
        employeeIds.set(key, current);
      }
    }

    return new Map(
      Array.from(employeeIds, ([key, ids]) => [key, ids.size] as const),
    );
  }, [items]);

  /** ช่วงวันเดียวไม่ต้องมีหัวคั่นวันที่ — คอลัมน์วันที่บอกอยู่แล้ว */
  const showDateGroup = useMemo(
    () => new Set(items.map(attendanceDateKey)).size > 1,
    [items],
  );

  const columns: Array<Column<AttendanceDailySummary>> = [
    {
      key: "employee",
      header: "พนักงาน",
      width: "w-[26%]",
      cell: (item) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={employeeName(item)}
            src={getEmployeeAvatarUrl(item)}
            size="lg"
          />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
              {employeeName(item)}
            </p>
            <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
              {item.employee?.employeeCode || "-"} · {orgText(item)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "workDate",
      header: "วันที่",
      width: "w-28",
      cell: (item) => (
        <span className="whitespace-nowrap tabular-nums text-slate-600">
          {formatThaiDate(item.workDate)}
        </span>
      ),
    },
    {
      key: "morning",
      header: "เข้าเช้า",
      align: "center",
      width: "w-28",
      cell: (item) => (
        <AttendanceTimeSlotDisplay
          item={item}
          slot="morning"
          label="เช้า"
          value={item.morningInAt}
          variant="table"
        />
      ),
    },
    {
      key: "afternoon",
      header: "เข้าบ่าย",
      align: "center",
      width: "w-28",
      hideBelow: "lg",
      cell: (item) => (
        <AttendanceTimeSlotDisplay
          item={item}
          slot="afternoon"
          label="บ่าย"
          value={item.afternoonInAt}
          variant="table"
        />
      ),
    },
    {
      key: "checkout",
      header: "ออกงาน",
      align: "center",
      width: "w-28",
      cell: (item) => (
        <AttendanceTimeSlotDisplay
          item={item}
          slot="checkout"
          label="ออก"
          value={item.checkOutAt}
          variant="table"
        />
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-40",
      cell: (item) => {
        const lateMinutes = toNumber(item.totalLateMinutes);
        const earlyMinutes = toNumber(item.earlyCheckoutMinutes);
        const isOffsite =
          Boolean(item.offsiteStatus) || toNumber(item.offsiteMinutes) > 0;

        const reviewStatus = getDisplayReviewStatus(item);
        const rowState = getAttendanceRowSlotState(item);
        /*
         * วันหยุดหรือวันลาทั้งวันที่ไม่มีอะไรต้องตรวจ เอาป้ายของวันนั้นขึ้นมาแทน "ปกติ"
         * เพราะช่องเวลาปล่อยว่างไว้แล้ว ถ้ายังขึ้น "ปกติ" จะอ่านไม่ออกว่าวันนั้นเกิดอะไร
         * ส่วนแถวที่ต้องตรวจสอบ ป้ายสถานะยังสำคัญกว่า จึงลงไปอยู่บรรทัดเหตุผลแทน
         */
        const rowBadge =
          rowState && reviewStatus === "CALCULATED" ? rowState : null;

        const reasons = [
          rowBadge ? rowBadge.detail || "" : rowState?.label || "",
          lateMinutes > 0 ? `สาย ${numberText(lateMinutes)} นาที` : "",
          earlyMinutes > 0 ? `ออกก่อน ${numberText(earlyMinutes)} นาที` : "",
          isOffsite ? "นอกสถานที่" : "",
        ].filter(Boolean);

        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span
              className={
                rowBadge
                  ? attendanceTimeSlotBadgeClass(rowBadge.tone)
                  : statusBadgeClass(reviewStatus)
              }
            >
              {rowBadge ? rowBadge.label : getDisplayReviewStatusLabel(item)}
            </span>

            {/* เหตุผลย่อย ๆ รวมเป็นบรรทัดเดียว ไม่ต้องซ้อนกันหลายป้าย */}
            {reasons.length ? (
              <span className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
                {reasons.join(" · ")}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      /*
       * ปุ่มสีทึบทุกแถวทำให้ตารางลายตา — ทั้งคอลัมน์กลายเป็นแถบสีน้ำเงินเรียงกัน
       * เปลี่ยนเป็นไอคอนจาง ๆ ที่ติดสีตอนชี้แถว และกดที่แถวไหนก็เปิดรายละเอียดได้อยู่แล้ว
       */
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      cell: (item) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {/* ปุ่มดูตำแหน่งมีเฉพาะคนที่ลงเวลานอกบริษัทได้ หรือมีงานนอกสถานที่วันนั้น */}
          {canViewAttendanceLocation(item) ? (
            <button
              type="button"
              title="ดูตำแหน่งที่ลงเวลา"
              aria-label={`ดูตำแหน่งที่ลงเวลาของ ${employeeName(item)}`}
              onClick={() =>
                setLocationTarget({
                  employeeId: item.employeeId,
                  workDate: item.workDate,
                  employeeName: employeeName(item),
                  avatarUrl: getEmployeeAvatarUrl(item),
                  orgLabel: `${item.employee?.employeeCode || "-"} · ${orgText(item)}`,
                })
              }
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-700 group-hover:text-slate-500"
            >
              <MapPin className="h-4 w-4" />
            </button>
          ) : null}

          <button
            type="button"
            title="ดูรายละเอียด"
            aria-label={`ดูรายละเอียดของ ${employeeName(item)}`}
            onClick={() => setDetailItem(item)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition group-hover:bg-brand-100 group-hover:text-brand-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  if (loading && !hasLoadedOnce)
    return (
      <PageSurface className="px-5 py-6 sm:px-6">
        <LoadingState
          title="กำลังโหลดข้อมูลลงเวลา"
          description="ระบบกำลังดึงข้อมูลลงเวลารายวันและคำนวณรายการทั้งหมด"
        />
      </PageSurface>
    );

  if (error && !hasLoadedOnce) {
    return (
      <PageSurface className="px-5 py-6 sm:px-6">
        <ErrorState
          title="โหลดข้อมูลไม่สำเร็จ"
          description={error}
          action={
            <Button variant="primary" onClick={() => void loadData()}>
              โหลดใหม่
            </Button>
          }
        />
      </PageSurface>
    );
  }

  return (
    <PageSurface className="xl:overflow-visible">
      <PageHeading
        heroMotif="attendance"
        eyebrow="Attendance"
        title="ตรวจเวลาทำงาน"
        titleAccent="รายวัน"
        description="ตรวจเวลาเข้า-ออกงาน รายการมาสาย ลงเวลาไม่ครบ ขาดงาน ลา นอกสถานที่ ยอดหัก และความพร้อมก่อนส่งเข้า Payroll"
        actions={
          <>
            <div className={TILE_BOX}>
              <StatTile
                icon={<ClipboardList className="h-4 w-4" />}
                label="รายการทั้งหมด"
                value={numberText(metrics.total)}
                helper="ในช่วงวันที่เลือก"
              />
              <StatTile
                icon={<AlertTriangle className="h-4 w-4" />}
                label="ต้องตรวจสอบ"
                value={numberText(quickNeedReview)}
                tone={quickNeedReview > 0 ? "warning" : "positive"}
                helper={`คำขอแก้เวลารออนุมัติ ${numberText(metrics.pendingTimeAdjustRequestCount || 0)}`}
              />
              <StatTile
                icon={<UserX className="h-4 w-4" />}
                label="ขาดงาน"
                value={numberText(metrics.absentCount || 0)}
                tone={toNumber(metrics.absentCount) > 0 ? "warning" : "neutral"}
                helper={`หัก ${money(metrics.absentDeductionAmount)} บาท`}
              />
              <StatTile
                icon={<Wallet className="h-4 w-4" />}
                label="ยอดหักรวม"
                value={`${money(metrics.totalDeductionAmount)} บาท`}
                helper={`พร้อมล็อก ${numberText(metrics.readyForPayroll)} รายการ`}
              />
            </div>
          </>
        }
      />

      {/*
       * ตัวกรองทั้งหมดอยู่ในป๊อปอัพ เหลือบนแถบแค่ปุ่มเปิด สรุปสั้น ๆ ว่ากรองด้วยอะไรอยู่
       * และปุ่มคำนวณใหม่ — เดิมกาง 8 ช่องไว้บนหน้า กินสองบรรทัดและแย่งที่ของตาราง
       * ทั้งที่ส่วนใหญ่ตั้งครั้งเดียวแล้วไม่ได้แตะอีก
       *
       * ช่วงวันที่ยังอยู่บนแถบ เพราะเป็นตัวที่บอกว่าทั้งหน้ากำลังดูข้อมูลของวันไหน
       * และเป็นตัวที่ถูกเลื่อนไป-กลับบ่อยที่สุด
       */}
      {/*
       * แถบเครื่องมืออยู่บนพื้นเทาอ่อน คั่นตัวเองออกจากหัวเรื่องด้านบนและตารางด้านล่าง
       * โดยไม่ต้องมีหัวข้อซ้ำกับชื่อหน้า
       */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            size="md"
            title="เลื่อนช่วงวันที่ย้อนหลัง"
            icon={<ChevronLeft className="h-4 w-4" />}
            onClick={() => shiftDateRange(-1)}
          />

          <ThaiDateInput
            value={draftFilters.dateFrom}
            onChange={(event) => {
              const value = getThaiDateInputValue(event);
              if (!value) return;
              setDraftFilters((current) => ({
                ...current,
                dateFrom: value,
                dateTo: isDateBefore(current.dateTo, value) ? value : current.dateTo,
              }));
            }}
            className="w-[9.5rem]"
            aria-label="ตั้งแต่วันที่"
          />

          <span className="shrink-0 text-slate-300">–</span>

          <ThaiDateInput
            value={draftFilters.dateTo}
            onChange={(event) => {
              const value = getThaiDateInputValue(event);
              if (!value) return;
              setDraftFilters((current) => ({
                ...current,
                dateFrom: isDateBefore(value, current.dateFrom) ? value : current.dateFrom,
                dateTo: value,
              }));
            }}
            className="w-[9.5rem]"
            aria-label="ถึงวันที่"
          />

          <IconButton
            size="md"
            title="เลื่อนช่วงวันที่ถัดไป"
            icon={<ChevronRight className="h-4 w-4" />}
            onClick={() => shiftDateRange(1)}
          />
        </div>

        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition 3xl:h-10",
            activeFilterCount > 0
              ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          ตัวกรอง
          {activeFilterCount > 0 ? (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold tabular-nums text-white">
              {numberText(activeFilterCount)}
            </span>
          ) : null}
        </button>

        {filterSummary.length > 0 ? (
          <p className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
            {filterSummary.join(" · ")}
          </p>
        ) : (
          <span className="flex-1" />
        )}

        <p className="shrink-0 text-[12px] text-slate-500 3xl:text-[12.5px]">
          พบ {numberText(metrics.total)} รายการ
        </p>

        <Button
          size="sm"
          variant="primary"
          className="shrink-0"
          icon={<RefreshCcw className="h-3.5 w-3.5" />}
          loading={submitting}
          disabled={!canManageAttendanceReview}
          title={
            canManageAttendanceReview
              ? "คำนวณ Attendance ใหม่ตามช่วงและตัวกรองที่เลือก"
              : "ต้องมีสิทธิ์ ATTENDANCE_RECALCULATE"
          }
          onClick={handleRecalculate}
        >
          คำนวณใหม่
        </Button>
      </div>

      {/* ตัวกรองทั้งหมด — เลือกแล้วมีผลทันที ไม่ต้องกดยืนยัน (หน้านี้ใช้ debounce อยู่แล้ว) */}
      {filterOpen ? (
        <Modal
          open
          size="sm"
          title="ตัวกรอง"
          description="เลือกแล้วรายการจะอัปเดตให้เอง"
          footer={
            <>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = applyAttendanceTenantScope(
                      buildInitialFilters(),
                      tenantScope,
                    );
                    setPage(1);
                    setDraftFilters(next);
                    setAppliedFilters(next);
                  }}
                  className="mr-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  <X className="h-3.5 w-3.5" />
                  ล้างตัวกรอง {numberText(activeFilterCount)}
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
              <Select
                value={draftFilters.issue}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    issue: event.target.value as DailyIssueFilter,
                  }))
                }
                className="w-full bg-slate-50/80"
                aria-label="ประเด็นที่ต้องตรวจ"
              >
                {issueCountLabel.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label} ({option.count.toLocaleString("th-TH")})
                  </option>
                ))}
              </Select>
            </FilterRow>

            {/* บริษัท/สาขาโชว์เฉพาะผู้ใช้ที่คุมได้หลายแห่ง คนอื่นถูกล็อกจาก backend อยู่แล้ว */}
            {companies.length > 1 ? (
              <FilterRow label="บริษัท">
                <SelectField
                  allLabel="ทุกบริษัท"
                  value={draftFilters.companyId}
                  options={companies}
                  disabled={mastersLoading}
                  onChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      companyId: value,
                      branchId: "",
                      departmentId: "",
                      divisionId: "",
                    }))
                  }
                />
              </FilterRow>
            ) : null}

            {filterBranchOptions.length > 1 ? (
              <FilterRow label="สาขา">
                <SelectField
                  allLabel="ทุกสาขา"
                  value={draftFilters.branchId}
                  options={filterBranchOptions}
                  disabled={mastersLoading}
                  onChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      branchId: value,
                      departmentId: "",
                      divisionId: "",
                    }))
                  }
                />
              </FilterRow>
            ) : null}

            <FilterRow label="แผนก">
              <SelectField
                allLabel="ทุกแผนก"
                value={draftFilters.departmentId}
                options={filterDepartmentOptions}
                disabled={mastersLoading}
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    departmentId: value,
                    divisionId: "",
                  }))
                }
              />
            </FilterRow>

            <FilterRow label="ฝ่าย / กลุ่มงาน">
              <SelectField
                allLabel="ทุกฝ่าย / กลุ่มงาน"
                value={draftFilters.divisionId}
                options={filterDivisionOptions}
                disabled={mastersLoading}
                onChange={(value) =>
                  setDraftFilters((current) => ({ ...current, divisionId: value }))
                }
              />
            </FilterRow>

            <FilterRow label="ประเภทพนักงาน">
              <SelectField
                allLabel="ทุกประเภทพนักงาน"
                value={draftFilters.employeeTypeId}
                options={employeeTypes}
                disabled={mastersLoading}
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    employeeTypeId: value,
                  }))
                }
              />
            </FilterRow>
          </div>
        </Modal>
      ) : null}

      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:tracking-normal [&_thead_th]:text-slate-700 [&_thead_th]:py-3.5 [&_thead_th]:text-[12.5px] 3xl:[&_thead_th]:py-4 3xl:[&_thead_th]:text-[13px] 4xl:[&_thead_th]:py-[1.125rem] 4xl:[&_thead_th]:text-[13.5px]">
        <DataTable
          columns={columns}
          rows={sortedItems}
          rowKey={(item) => item.id}
          loading={loading && items.length === 0}
          onRowClick={setDetailItem}
          groupBy={(item) => {
            const dateKey = attendanceDateKey(item);
            const branchKey = attendanceBranchKey(item);
            const departmentKey = attendanceDepartmentKey(item);

            return [
              ...(showDateGroup
                ? [
                    {
                      key: dateKey,
                      label: (
                        <AttendanceGroupHeading
                          level="date"
                          title={formatThaiDate(item.workDate)}
                          employeeCount={groupEmployeeCounts.get(dateKey)}
                        />
                      ),
                    },
                  ]
                : []),
              {
                key: branchKey,
                label: (
                  <AttendanceGroupHeading
                    level="branch"
                    title={item.employee?.branch?.nameTh || "ไม่ระบุสาขา"}
                    code={item.employee?.branch?.code}
                    employeeCount={groupEmployeeCounts.get(branchKey)}
                  />
                ),
              },
              {
                key: departmentKey,
                label: (
                  <AttendanceGroupHeading
                    level="department"
                    title={item.employee?.department?.nameTh || "ไม่ระบุแผนก"}
                    code={item.employee?.department?.code}
                    employeeCount={groupEmployeeCounts.get(departmentKey)}
                  />
                ),
              },
            ];
          }}
          emptyTitle="ไม่พบข้อมูลลงเวลา"
          emptyDescription="ลองเลือกช่วงวันที่ใหม่ หรือกดคำนวณใหม่"
          minWidth="min-w-0"
          /* 5rem = ความสูงแถบบนสุด — หัวตารางกับแถบชื่อสาขาจะไปค้างต่อจากแถบนั้น */
          pageStickyTop="5rem"
        />
      </div>

      {items.length > 0 ? (
        <PaginationFooter meta={meta} page={page} onPageChange={setPage} />
      ) : null}

      {locationTarget ? (
        <AttendanceLocationDialog
          employeeId={locationTarget.employeeId}
          workDate={locationTarget.workDate}
          employeeName={locationTarget.employeeName}
          avatarUrl={locationTarget.avatarUrl}
          orgLabel={locationTarget.orgLabel}
          onClose={() => setLocationTarget(null)}
        />
      ) : null}

      {detailItem ? (
        <AttendanceDetailDialog
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onMarkReviewed={
            canManageAttendanceReview ? openMarkReviewedDialog : undefined
          }
          onSummaryUpdated={(updated) => {
            setItems((current) =>
              current.map((row) => (row.id === updated.id ? updated : row)),
            );
            setDetailItem((current) =>
              current?.id === updated.id ? updated : current,
            );
          }}
        />
      ) : null}

      {/* คำอธิบายไอคอนอุปกรณ์ที่ใช้ลงเวลา วางครั้งเดียวใต้ตาราง */}
      <div className="border-t border-slate-100 px-5 py-2.5 sm:px-6 3xl:px-7">
        <PunchChannelLegend />
      </div>

      <AttendanceRecalculationProgressModal
        onCancel={handleCancelRecalculation}
        cancelling={recalculationCancelling}
        progress={recalculationProgress}
        elapsedMs={recalculationDisplayElapsedMs}
        visible={recalculationProgressVisible}
        onClose={() => setRecalculationProgressDismissed(true)}
      />

      <ActionDialog
        state={reviewDialog}
        loading={reviewSubmitting}
        onClose={() => setReviewDialog(null)}
      />
    </PageSurface>
  );
}
