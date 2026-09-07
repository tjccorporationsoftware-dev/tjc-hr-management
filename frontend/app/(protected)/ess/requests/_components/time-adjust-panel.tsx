"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Eye,
  ImageIcon,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  cancelEssTimeAdjustRequest,
  cancelMyOffsiteWorkRequest,
  createEssTimeAdjustRequest,
  createOffsiteWorkRequest,
  deleteEssTimeAdjustRequest,
  deleteMyOffsiteWorkRequest,
  getMyOffsiteWorkRequests,
  downloadEssTimeAdjustAttachment,
  getEssTimeAdjustRequests,
  getMyTimeAdjustAttendanceLogs,
  previewEssTimeAdjustAttachment,
  submitEssTimeAdjustRequest,
  submitOffsiteWorkRequest,
  updateEssTimeAdjustRequest,
  updateMyOffsiteWorkRequest,
  uploadEssTimeAdjustAttachment,
} from "@/lib/api";
import { compressImageToDataUrl } from "@/lib/compress-image";
import type {
  CreateOffsiteWorkRequestForm,
  OffsiteWorkRequest,
} from "@/types/offsite-work";
import type {
  CreateEssTimeAdjustRequestForm,
  EssAttachment,
  EssAttendanceLog,
  EssTimeAdjustApprovalStep,
  EssTimeAdjustLog,
  EssTimeAdjustRequest,
  EssTimeAdjustRequestSummary,
} from "@/types/ess";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  Badge,
  Button,
  DataTable,
  DetailItem,
  Field,
  FieldGrid,
  Modal as KitModal,
  Notice,
  RowMenu,
  SearchInput,
  Section,
  Select,
  StatTile,
  TextInput,
  joinClassName,
  type Column,
  type RowMenuItem,
} from "@/components/kit";
import {
  EssStatusBadge,
  essDate,
  essDateTime,
  essTime,
  getErrorMessage,
} from "@/components/ess/ess-ui";

type CheckInSession = "MORNING" | "AFTERNOON" | "";

type TimeAdjustTargetLogChoice =
  | "CHECK_IN_MORNING"
  | "CHECK_IN_AFTERNOON"
  | "CHECK_OUT"
  | "BREAK_START"
  | "BREAK_END";

type TimeAdjustFormState = {
  adjustType: CreateEssTimeAdjustRequestForm["adjustType"];
  targetLogType: CreateEssTimeAdjustRequestForm["targetLogType"];
  targetSession: CheckInSession;
  requestedDate: string;
  requestedTime: string;
  reason: string;
  note: string;
  submit: boolean;
};

type OffsiteEmbeddedFormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  attachmentUrl: string;
};

type EvidencePreviewState = {
  requestId: string;
  attachment: EssAttachment;
  objectUrl: string;
  fileName: string;
  contentType: string;
};

type OffsiteEvidencePreviewState = {
  title: string;
  url: string;
  description?: string | null;
};

type TimeAdjustFilterState = {
  year: string;
  status: string;
  adjustType: string;
  targetLogType: string;
  search: string;
};

const emptySummary: EssTimeAdjustRequestSummary = {
  total: 0,
  draft: 0,
  submitted: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
};

const fieldClass =
  "block h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm shadow-sky-100/70 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 max-[1536px]:h-9 max-[1536px]:rounded-xl max-[1536px]:px-2.5 max-[1536px]:text-xs";

const textareaClass =
  "block min-h-[112px] w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 shadow-sm shadow-sky-100/70 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 max-[1536px]:min-h-[92px] max-[1536px]:rounded-xl max-[1536px]:px-2.5 max-[1536px]:py-2 max-[1536px]:text-xs";

/** ป้ายหัวข้อย่อยชุดเดียวกับแท็บ OT และใบลา */
const LABEL_CLASS =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500";

/** ป้ายของช่องข้อมูลย่อย เล็กและจางกว่าหัวข้อหนึ่งขั้น */
const FIELD_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]";

function count(value: number) {
  return `${value.toLocaleString("th-TH")} รายการ`;
}

/**
 * แถวในตารางประวัติ — คำขอแก้เวลากับ Offsite เป็นคนละระบบ คนละ endpoint
 * แต่ผู้ใช้มองเป็นรายการเดียวกัน จึงรวมเป็น union แล้วแยกทางตอน render
 */
type HistoryRow =
  | {
      kind: "TIME";
      id: string;
      sortAt?: string | null;
      time: EssTimeAdjustRequest;
    }
  | {
      kind: "OFFSITE";
      id: string;
      sortAt?: string | null;
      offsite: OffsiteWorkRequest;
    };

const timeAdjustStatusOptions = [
  { value: "", label: "ทุกสถานะ" },
  { value: "DRAFT", label: "ร่าง" },
  { value: "SUBMITTED", label: "รออนุมัติ" },
  { value: "APPROVED", label: "อนุมัติแล้ว" },
  { value: "REJECTED", label: "ไม่อนุมัติ" },
  { value: "CANCELLED", label: "ยกเลิก" },
];

function currentYearText() {
  return String(new Date().getFullYear());
}

function defaultTimeAdjustFilters(): TimeAdjustFilterState {
  return {
    year: currentYearText(),
    status: "",
    adjustType: "",
    targetLogType: "",
    search: "",
  };
}

const adjustTypeOptions: Array<{
  value: TimeAdjustFormState["adjustType"];
  label: string;
  helper: string;
}> = [
  {
    value: "MISSING_CHECK_IN",
    label: "ลืมลงเวลาเข้า",
    helper: "ใช้เมื่อไม่ได้บันทึกเวลาเข้างาน",
  },
  {
    value: "MISSING_CHECK_OUT",
    label: "ลืมลงเวลาออก",
    helper: "ใช้เมื่อไม่ได้บันทึกเวลาออกงาน",
  },
  {
    value: "WRONG_TIME",
    label: "เวลาผิด",
    helper: "ใช้เมื่อเวลาในระบบคลาดเคลื่อน",
  },
  {
    value: "DEVICE_ERROR",
    label: "อุปกรณ์มีปัญหา",
    helper: "ใช้เมื่อเครื่องสแกนหรือระบบขัดข้อง",
  },
  {
    value: "OUTSIDE_WORK",
    label: "ทำงานนอกสถานที่",
    helper: "ใช้เมื่อปฏิบัติงานนอกพื้นที่บริษัท โดยส่งเข้า Offsite API เดิม",
  },
  {
    value: "OTHER",
    label: "อื่น ๆ",
    helper: "ระบุรายละเอียดเพิ่มเติมในเหตุผล",
  },
];

const targetLogTypeOptions: Array<{
  value: TimeAdjustTargetLogChoice;
  label: string;
  targetLogType: TimeAdjustFormState["targetLogType"];
  targetSession?: CheckInSession;
}> = [
  {
    value: "CHECK_IN_MORNING",
    label: "เข้างานเช้า",
    targetLogType: "CHECK_IN",
    targetSession: "MORNING",
  },
  {
    value: "CHECK_IN_AFTERNOON",
    label: "เข้างานบ่าย",
    targetLogType: "CHECK_IN",
    targetSession: "AFTERNOON",
  },
  { value: "CHECK_OUT", label: "เวลาออกงาน", targetLogType: "CHECK_OUT" },
  { value: "BREAK_START", label: "เริ่มพัก", targetLogType: "BREAK_START" },
  { value: "BREAK_END", label: "กลับจากพัก", targetLogType: "BREAK_END" },
];

const timeHourOptions = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const timeMinuteOptions = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);

function normalizeTimePart(
  value: string | undefined,
  fallback: string,
  max: number,
) {
  const numericValue = Number(value);
  if (
    !Number.isInteger(numericValue) ||
    numericValue < 0 ||
    numericValue > max
  ) {
    return fallback;
  }
  return String(numericValue).padStart(2, "0");
}

function splitTimeValue(value: string) {
  const [hourText, minuteText] = String(value || "").split(":");
  return {
    hour: normalizeTimePart(hourText, "08", 23),
    minute: normalizeTimePart(minuteText, "00", 59),
  };
}

function composeTimeValue(hour: string, minute: string) {
  return `${normalizeTimePart(hour, "08", 23)}:${normalizeTimePart(
    minute,
    "00",
    59,
  )}`;
}

function updateTimePart(
  value: string,
  part: "hour" | "minute",
  nextValue: string,
) {
  const current = splitTimeValue(value);
  return composeTimeValue(
    part === "hour" ? nextValue : current.hour,
    part === "minute" ? nextValue : current.minute,
  );
}

type ReturnedReviewInfo = {
  reason: string;
  note: string;
  returnedAt?: string | null;
};

function readLogValue(
  log: Record<string, unknown> | EssTimeAdjustLog,
  key: string,
) {
  const value = (log as Record<string, unknown>)[key];
  return value === null || value === undefined ? "" : String(value);
}

function isReturnedReviewLog(log: Record<string, unknown> | EssTimeAdjustLog) {
  const action = readLogValue(log, "action");
  const oldStatus = readLogValue(log, "oldStatus");
  const newStatus = readLogValue(log, "newStatus");

  return (
    action === "RETURNED_FOR_REVIEW" ||
    (action === "CANCEL" && oldStatus === "SUBMITTED" && newStatus === "DRAFT")
  );
}

function getLogTimeValue(log: Record<string, unknown> | EssTimeAdjustLog) {
  const value = readLogValue(log, "createdAt");
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getReturnedReviewInfo(
  item?: EssTimeAdjustRequest | null,
): ReturnedReviewInfo | null {
  const log = [...(item?.logs ?? [])]
    .filter(isReturnedReviewLog)
    .sort((a, b) => getLogTimeValue(b) - getLogTimeValue(a))[0];

  if (!log) return null;

  return {
    reason:
      readLogValue(log, "reason") ||
      "ผู้อนุมัติส่งกลับให้ตรวจสอบและแก้ไขข้อมูลอีกครั้ง",
    note: readLogValue(log, "note"),
    returnedAt: readLogValue(log, "createdAt") || null,
  };
}

function isReturnedReviewDraft(item?: EssTimeAdjustRequest | null) {
  return item?.status === "DRAFT" && Boolean(getReturnedReviewInfo(item));
}

function isResubmittedAfterReturnedReview(item?: EssTimeAdjustRequest | null) {
  return item?.status === "SUBMITTED" && Boolean(getReturnedReviewInfo(item));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const defaultForm: TimeAdjustFormState = {
  adjustType: "MISSING_CHECK_IN",
  targetLogType: "CHECK_IN",
  targetSession: "MORNING",
  requestedDate: todayDate(),
  requestedTime: "08:00",
  reason: "",
  note: "",
  submit: true,
};

const defaultOffsiteForm: OffsiteEmbeddedFormState = {
  workDate: todayDate(),
  startTime: "08:00",
  endTime: "17:00",
  reason: "",
  attachmentUrl: "",
};

function normalizeIsoDate(value: string) {
  const text = String(value ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);

  const thaiDisplayMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);

  if (thaiDisplayMatch) {
    const day = thaiDisplayMatch[1].padStart(2, "0");
    const month = thaiDisplayMatch[2].padStart(2, "0");
    const rawYear = Number(thaiDisplayMatch[3]);
    const christianYear = rawYear >= 2400 ? rawYear - 543 : rawYear;

    return `${christianYear}-${month}-${day}`;
  }

  return text;
}

function buildApiDateTime(date: string, time: string) {
  const isoDate = normalizeIsoDate(date);
  const [hour = "00", minute = "00"] = String(time ?? "").split(":");

  return `${isoDate}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00+07:00`;
}

function normalizeClockValue(value: string, fallback = "08:00") {
  const time = splitTimeValue(value || fallback);
  return composeTimeValue(time.hour, time.minute);
}

function minutesFromClock(value: string) {
  const time = splitTimeValue(value);
  return Number(time.hour) * 60 + Number(time.minute);
}

function formatDurationMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours && remainingMinutes) {
    return `${hours.toLocaleString("th-TH")} ชม. ${remainingMinutes.toLocaleString("th-TH")} นาที`;
  }

  if (hours) return `${hours.toLocaleString("th-TH")} ชม.`;
  return `${remainingMinutes.toLocaleString("th-TH")} นาที`;
}

function offsiteBreakOverlapMinutes(startMinutes: number, endMinutes: number) {
  const lunchStart = 12 * 60;
  const lunchEnd = 13 * 60;

  return Math.max(
    0,
    Math.min(endMinutes, lunchEnd) - Math.max(startMinutes, lunchStart),
  );
}

function getOffsiteWorkingMinutes(startTime: string, endTime: string) {
  const startMinutes = minutesFromClock(startTime);
  const endMinutes = minutesFromClock(endTime);
  const rawMinutes = Math.max(0, endMinutes - startMinutes);
  const breakMinutes = offsiteBreakOverlapMinutes(startMinutes, endMinutes);

  return Math.max(0, rawMinutes - breakMinutes);
}

function getOffsiteDurationText(
  form: Pick<OffsiteEmbeddedFormState, "startTime" | "endTime">,
) {
  return formatDurationMinutes(
    getOffsiteWorkingMinutes(form.startTime, form.endTime),
  );
}

function toBangkokClockKey(value?: string | null) {
  if (!value) return "";
  const text = String(value).trim();
  const timeOnlyMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);

  if (timeOnlyMatch) {
    return `${timeOnlyMatch[1].padStart(2, "0")}:${timeOnlyMatch[2]}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function inferCheckInSessionFromTime(value?: string | null): CheckInSession {
  const clock = toBangkokClockKey(value);
  if (!clock) return "MORNING";

  const [hourText = "0"] = clock.split(":");
  return Number(hourText) >= 12 ? "AFTERNOON" : "MORNING";
}

function getTargetLogTypeChoice(
  form: Pick<TimeAdjustFormState, "targetLogType" | "targetSession">,
): TimeAdjustTargetLogChoice {
  if (form.targetLogType === "CHECK_IN") {
    return form.targetSession === "AFTERNOON"
      ? "CHECK_IN_AFTERNOON"
      : "CHECK_IN_MORNING";
  }

  return form.targetLogType as TimeAdjustTargetLogChoice;
}

function timeDiffMinutes(left?: string | null, right?: string | null) {
  const leftClock = toBangkokClockKey(left);
  const rightClock = toBangkokClockKey(right);

  if (!leftClock || !rightClock) return Number.POSITIVE_INFINITY;

  const [leftHour = "0", leftMinute = "0"] = leftClock.split(":");
  const [rightHour = "0", rightMinute = "0"] = rightClock.split(":");
  const leftValue = Number(leftHour) * 60 + Number(leftMinute);
  const rightValue = Number(rightHour) * 60 + Number(rightMinute);

  return Math.abs(leftValue - rightValue);
}

function readAttendanceLogString(
  log: EssAttendanceLog | Record<string, unknown>,
  key: string,
) {
  const value = (log as Record<string, unknown>)[key];
  return value === null || value === undefined ? "" : String(value);
}

function getAttendanceLogSession(
  log?: EssAttendanceLog | null,
): CheckInSession {
  const session = readAttendanceLogString(log ?? {}, "session").toUpperCase();
  if (session === "MORNING" || session === "AFTERNOON") return session;
  return inferCheckInSessionFromTime(log?.logTime);
}

function getRequestedSessionForTarget(
  targetLogType: TimeAdjustFormState["targetLogType"],
  requestedLogTime: string,
  targetSession?: CheckInSession,
) {
  if (targetLogType !== "CHECK_IN") return "";
  return targetSession || inferCheckInSessionFromTime(requestedLogTime);
}

function getOriginalLogMissingMessage(
  targetLogType: TimeAdjustFormState["targetLogType"],
  requestedLogTime: string,
  targetSession?: CheckInSession,
) {
  const label = targetLogTypeLabel(
    targetLogType,
    requestedLogTime,
    targetSession,
  );
  if (targetLogType === "CHECK_IN") {
    return `ไม่พบรายการ${label}เดิม กรุณาตรวจสอบประวัติลงเวลา หรือเลือกประเภท “ลืมลงเวลาเข้า” หากไม่มีการลงเวลาจริง`;
  }
  if (targetLogType === "CHECK_OUT") {
    return "ไม่พบรายการออกงานเดิม กรุณาตรวจสอบประวัติลงเวลา หรือเลือกประเภท “ลืมลงเวลาออก” หากไม่มีการลงเวลาจริง";
  }
  return `ไม่พบรายการ${label}เดิม กรุณาตรวจสอบประวัติลงเวลาก่อนส่งคำขอประเภทเวลาผิด`;
}

function findNearestOriginalAttendanceLog(
  logs: EssAttendanceLog[],
  params: {
    targetLogType: TimeAdjustFormState["targetLogType"];
    requestedLogTime: string;
    targetSession?: CheckInSession;
  },
) {
  const requestedSession = getRequestedSessionForTarget(
    params.targetLogType,
    params.requestedLogTime,
    params.targetSession,
  );

  const candidates = logs.filter((log) => {
    if (log.logType !== params.targetLogType) return false;
    if (
      !log.logTime ||
      String(log.status ?? "").toUpperCase() === "CANCELLED"
    ) {
      return false;
    }

    if (params.targetLogType === "CHECK_IN") {
      return (
        getAttendanceLogSession(log) === requestedSession &&
        timeDiffMinutes(log.logTime, params.requestedLogTime) > 0
      );
    }

    return timeDiffMinutes(log.logTime, params.requestedLogTime) > 0;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((best, log) => {
    const bestScore = timeDiffMinutes(best.logTime, params.requestedLogTime);
    const currentScore = timeDiffMinutes(log.logTime, params.requestedLogTime);
    return currentScore < bestScore ? log : best;
  }, candidates[0]);
}

function adjustTypeLabel(value?: string | null) {
  if (value === "OUTSIDE_WORK") return "ทำงานนอกสถานที่";

  return (
    adjustTypeOptions.find((option) => option.value === value)?.label ??
    value ??
    "-"
  );
}

function targetLogTypeLabel(
  value?: string | null,
  requestedLogTime?: string | null,
  targetSession?: CheckInSession,
) {
  if (value === "CHECK_IN") {
    const session =
      targetSession || inferCheckInSessionFromTime(requestedLogTime);
    return session === "AFTERNOON" ? "เข้างานบ่าย" : "เข้างานเช้า";
  }

  return (
    targetLogTypeOptions.find((option) => option.targetLogType === value)
      ?.label ??
    value ??
    "-"
  );
}

function statusLabel(value?: string | null) {
  const status = String(value ?? "").toUpperCase();
  if (status === "DRAFT") return "ร่าง";
  if (status === "SUBMITTED") return "รออนุมัติ";
  if (status === "APPROVED") return "อนุมัติแล้ว";
  if (status === "REJECTED") return "ไม่อนุมัติ";
  if (status === "CANCELLED") return "ยกเลิก";
  return value || "-";
}

function approvalStepStatusLabel(value?: string | null) {
  const status = String(value ?? "").toUpperCase();
  if (status === "WAITING") return "รอตามลำดับ";
  if (status === "PENDING") return "กำลังรออนุมัติ";
  if (status === "APPROVED") return "อนุมัติแล้ว";
  if (status === "REJECTED") return "ไม่อนุมัติ";
  if (status === "RETURNED") return "ส่งกลับให้แก้ไข";
  if (status === "CANCELLED") return "ยกเลิก";
  return value || "-";
}

function approvalLogActionLabel(value?: string | null) {
  const action = String(value ?? "").toUpperCase();
  if (action === "SUBMIT") return "ยื่นคำขอ";
  if (action === "APPROVE") return "อนุมัติ";
  if (action === "REJECT") return "ไม่อนุมัติ";
  if (action === "CANCEL") return "ยกเลิก";
  if (action === "RETURNED_FOR_REVIEW") return "ส่งกลับให้แก้ไข";
  if (action === "CREATE") return "สร้างคำขอ";
  if (action === "UPDATE") return "แก้ไขคำขอ";
  return value || "-";
}

function fullNameFromEmployee(
  employee?: {
    employeeCode?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
  } | null,
) {
  if (!employee) return "";
  const name =
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ");
  return [employee.employeeCode, name].filter(Boolean).join(" · ");
}

function approvalStepActorName(step?: EssTimeAdjustApprovalStep | null) {
  if (!step) return "";
  if (step.actedBy?.displayName || step.actedBy?.email) {
    return step.actedBy.displayName || step.actedBy.email || "";
  }
  if (step.expectedEmployee) return fullNameFromEmployee(step.expectedEmployee);
  if (step.expectedApprover?.displayName || step.expectedApprover?.email) {
    return (
      step.expectedApprover.displayName || step.expectedApprover.email || ""
    );
  }
  if (step.position?.nameTh || step.position?.nameEn || step.roleCode) {
    return (
      step.position?.nameTh || step.position?.nameEn || step.roleCode || ""
    );
  }
  return "ยังไม่ระบุผู้อนุมัติ";
}

function approvalLogActorName(log?: EssTimeAdjustLog | null) {
  if (!log) return "";
  return log.actedBy?.displayName || log.actedBy?.email || "";
}

function currentApprovalMessage(item?: EssTimeAdjustRequest | null) {
  const status = String(item?.status ?? "").toUpperCase();
  if (isReturnedReviewDraft(item)) return "รอผู้ยื่นแก้ไขและส่งใหม่";
  if (status === "DRAFT") return "ยังไม่ได้ส่งอนุมัติ";
  if (status === "APPROVED") return "อนุมัติครบแล้ว";
  if (status === "REJECTED") return "ไม่อนุมัติ";
  if (status === "CANCELLED") return "ยกเลิกแล้ว";

  const activeStep = [...(item?.approvalSteps ?? [])].find((step) =>
    ["PENDING", "WAITING"].includes(String(step.status ?? "").toUpperCase()),
  );

  return activeStep
    ? `รออนุมัติโดย ${approvalStepActorName(activeStep)}`
    : "กำลังตรวจสอบตามขั้นตอน";
}

function currentApprovalStepLabel(item?: EssTimeAdjustRequest | null) {
  if (isReturnedReviewDraft(item)) return "ตรวจสอบใหม่";
  const activeStep = [...(item?.approvalSteps ?? [])].find((step) =>
    ["PENDING", "WAITING"].includes(String(step.status ?? "").toUpperCase()),
  );
  if (!activeStep) {
    const status = String(item?.status ?? "").toUpperCase();
    if (status === "APPROVED") return "สิ้นสุดกระบวนการ";
    if (status === "DRAFT") return "ยังไม่เริ่มอนุมัติ";
    if (status === "REJECTED") return "สิ้นสุดด้วยการไม่อนุมัติ";
    if (status === "CANCELLED") return "ยกเลิกคำขอ";
    return "-";
  }
  return `ขั้นที่ ${activeStep.stepNo} · ${activeStep.nameTh}`;
}

function formatLogTime(value?: string | null) {
  return value ? essDateTime(value) : "-";
}

function isPendingStatus(status?: string | null) {
  return [
    "DRAFT",
    "SUBMITTED",
    "PENDING",
    "MANAGER_APPROVED",
    "IN_REVIEW",
  ].includes(String(status ?? "").toUpperCase());
}

function isApprovedStatus(status?: string | null) {
  return ["APPROVED", "HR_APPROVED", "MANAGER_APPROVED", "COMPLETED"].includes(
    String(status ?? "").toUpperCase(),
  );
}

function isRejectedStatus(status?: string | null) {
  return ["REJECTED", "MANAGER_REJECTED", "HR_REJECTED", "CANCELLED"].includes(
    String(status ?? "").toUpperCase(),
  );
}

function yearDateRange(yearText?: string) {
  const year = Number(yearText);
  if (!Number.isInteger(year) || year < 1900) return {};

  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
  };
}

function shouldIncludeOffsiteStatus(
  status: string | undefined,
  filterStatus: string,
) {
  if (!filterStatus) return true;

  const normalizedStatus = String(status ?? "").toUpperCase();
  if (filterStatus === "APPROVED")
    return ["APPROVED", "HR_APPROVED"].includes(normalizedStatus);
  if (filterStatus === "REJECTED")
    return ["REJECTED", "MANAGER_REJECTED", "HR_REJECTED"].includes(
      normalizedStatus,
    );

  return normalizedStatus === filterStatus;
}

function filterOffsiteHistoryItems(
  items: OffsiteWorkRequest[],
  filters: TimeAdjustFilterState,
) {
  return items.filter((item) =>
    shouldIncludeOffsiteStatus(item.status, filters.status),
  );
}

function firstAttachment(item: EssTimeAdjustRequest) {
  return item.attachments?.[0] ?? null;
}

function isImageFile(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

export function TimeAdjustRequestPanel() {
  const [items, setItems] = useState<EssTimeAdjustRequest[]>([]);
  const [offsiteItems, setOffsiteItems] = useState<OffsiteWorkRequest[]>([]);
  const [summary, setSummary] =
    useState<EssTimeAdjustRequestSummary>(emptySummary);
  const [form, setForm] = useState<TimeAdjustFormState>(defaultForm);
  const [offsiteForm, setOffsiteForm] =
    useState<OffsiteEmbeddedFormState>(defaultOffsiteForm);
  const [filters, setFilters] = useState<TimeAdjustFilterState>(() =>
    defaultTimeAdjustFilters(),
  );
  const [editingItem, setEditingItem] = useState<EssTimeAdjustRequest | null>(
    null,
  );
  const [editingOffsiteItem, setEditingOffsiteItem] =
    useState<OffsiteWorkRequest | null>(null);
  const [detailItem, setDetailItem] = useState<EssTimeAdjustRequest | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<string | null>(
    null,
  );
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState("");
  const [evidenceViewer, setEvidenceViewer] =
    useState<EvidencePreviewState | null>(null);
  const [offsiteEvidenceViewer, setOffsiteEvidenceViewer] =
    useState<OffsiteEvidencePreviewState | null>(null);
  const [previewingEvidenceId, setPreviewingEvidenceId] = useState<
    string | null
  >(null);
  const [originalLogPreview, setOriginalLogPreview] =
    useState<EssAttendanceLog | null>(null);
  const [originalLogLoading, setOriginalLogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didMountFiltersRef = useRef(false);
  const filterSearchTimerRef = useRef<number | null>(null);

  const offsiteHasInvalidTime =
    minutesFromClock(offsiteForm.startTime) >=
    minutesFromClock(offsiteForm.endTime);
  const offsiteDurationText = getOffsiteDurationText(offsiteForm);

  const selectedAdjustType = adjustTypeOptions.find(
    (option) => option.value === form.adjustType,
  );

  const loadData = useCallback(
    async (
      activeFilters: TimeAdjustFilterState = filters,
      options: { silent?: boolean } = {},
    ) => {
      const silent = Boolean(options.silent);

      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        const yearValue = Number(activeFilters.year);
        const searchText = activeFilters.search.trim();
        const shouldLoadTimeAdjust =
          activeFilters.adjustType !== "OUTSIDE_WORK";
        const shouldLoadOffsite =
          (!activeFilters.adjustType ||
            activeFilters.adjustType === "OUTSIDE_WORK") &&
          !activeFilters.targetLogType;

        const [timeAdjustResponse, offsiteResponse] = await Promise.all([
          shouldLoadTimeAdjust
            ? getEssTimeAdjustRequests({
                page: 1,
                pageSize: 20,
                ...(Number.isInteger(yearValue) ? { year: yearValue } : {}),
                ...(activeFilters.status
                  ? { status: activeFilters.status }
                  : {}),
                ...(activeFilters.adjustType
                  ? { adjustType: activeFilters.adjustType }
                  : {}),
                ...(activeFilters.targetLogType
                  ? { targetLogType: activeFilters.targetLogType }
                  : {}),
                ...(searchText ? { search: searchText } : {}),
              })
            : Promise.resolve({ items: [], summary: emptySummary }),
          shouldLoadOffsite
            ? getMyOffsiteWorkRequests({
                page: 1,
                pageSize: 20,
                ...yearDateRange(activeFilters.year),
                ...(searchText ? { search: searchText } : {}),
                ...(["DRAFT", "SUBMITTED", "CANCELLED"].includes(
                  activeFilters.status,
                )
                  ? {
                      status: activeFilters.status as
                        "DRAFT" | "SUBMITTED" | "CANCELLED",
                    }
                  : {}),
              })
            : Promise.resolve({ items: [] }),
        ]);

        setItems(timeAdjustResponse.items ?? []);
        setOffsiteItems(
          shouldLoadOffsite
            ? filterOffsiteHistoryItems(
                offsiteResponse.items ?? [],
                activeFilters,
              )
            : [],
        );
        setSummary(timeAdjustResponse.summary ?? emptySummary);
      } catch (loadError) {
        const message = getErrorMessage(
          loadError,
          "ไม่สามารถโหลดข้อมูลคำขอแก้เวลา / Offsite ได้",
        );
        if (!silent) {
          setError(message);
          toast.error(message);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void loadData(defaultTimeAdjustFilters());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryType = params.get("requestType") || params.get("type");

    if (queryType !== "offsite") return;

    setForm((current) => ({ ...current, adjustType: "OUTSIDE_WORK" }));
    setEditingItem(null);
    setEditingOffsiteItem(null);
    setOriginalLogPreview(null);
    setOriginalLogLoading(false);
    setOffsiteForm(defaultOffsiteForm);
    resetEvidence();
    setCreateOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetFilters() {
    setFilters(defaultTimeAdjustFilters());
  }

  useEffect(() => {
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }

    if (filterSearchTimerRef.current !== null) {
      window.clearTimeout(filterSearchTimerRef.current);
    }

    const searchDelay = filters.search.trim() ? 400 : 200;
    filterSearchTimerRef.current = window.setTimeout(() => {
      void loadData(filters, { silent: true });
      filterSearchTimerRef.current = null;
    }, searchDelay);

    return () => {
      if (filterSearchTimerRef.current !== null) {
        window.clearTimeout(filterSearchTimerRef.current);
        filterSearchTimerRef.current = null;
      }
    };
  }, [filters, loadData]);

  useEffect(() => {
    if (
      form.adjustType === "OUTSIDE_WORK" ||
      !createOpen ||
      form.adjustType !== "WRONG_TIME" ||
      !form.requestedDate
    ) {
      setOriginalLogPreview(null);
      setOriginalLogLoading(false);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      const requestedLogTime = buildApiDateTime(
        form.requestedDate,
        form.requestedTime,
      );
      const isoDate = normalizeIsoDate(form.requestedDate);
      setOriginalLogLoading(true);

      getMyTimeAdjustAttendanceLogs({
        page: 1,
        pageSize: 50,
        dateFrom: isoDate,
        dateTo: isoDate,
      })
        .then((response) => {
          if (!active) return;
          setOriginalLogPreview(
            findNearestOriginalAttendanceLog(response.items ?? [], {
              targetLogType: form.targetLogType,
              targetSession: form.targetSession,
              requestedLogTime,
            }),
          );
        })
        .catch(() => {
          if (!active) return;
          setOriginalLogPreview(null);
        })
        .finally(() => {
          if (active) setOriginalLogLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    createOpen,
    form.adjustType,
    form.requestedDate,
    form.requestedTime,
    form.targetLogType,
    form.targetSession,
  ]);

  useEffect(() => {
    return () => {
      if (evidencePreviewUrl) window.URL.revokeObjectURL(evidencePreviewUrl);
      if (evidenceViewer?.objectUrl)
        window.URL.revokeObjectURL(evidenceViewer.objectUrl);
    };
  }, [evidencePreviewUrl, evidenceViewer?.objectUrl]);

  function updateForm<Key extends keyof TimeAdjustFormState>(
    key: Key,
    value: TimeAdjustFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateAdjustType(nextAdjustType: TimeAdjustFormState["adjustType"]) {
    if (editingItem && nextAdjustType === "OUTSIDE_WORK") {
      toast.warning(
        "รายการที่กำลังแก้ไขเป็นคำขอแก้เวลาเดิม จึงเปลี่ยนเป็น Offsite ไม่ได้",
      );
      return;
    }

    if (editingOffsiteItem && nextAdjustType !== "OUTSIDE_WORK") {
      toast.warning(
        "รายการที่กำลังแก้ไขเป็นคำขอ Offsite เดิม จึงเปลี่ยนเป็นประเภทแก้เวลาไม่ได้",
      );
      return;
    }

    updateForm("adjustType", nextAdjustType);

    if (nextAdjustType === "OUTSIDE_WORK") {
      setOriginalLogPreview(null);
      setOriginalLogLoading(false);
    }
  }

  function updateOffsiteForm<Key extends keyof OffsiteEmbeddedFormState>(
    key: Key,
    value: OffsiteEmbeddedFormState[Key],
  ) {
    setOffsiteForm((current) => ({ ...current, [key]: value }));
  }

  function resetOffsiteForm() {
    setOffsiteForm(defaultOffsiteForm);
  }

  function resetEvidence() {
    if (evidencePreviewUrl) window.URL.revokeObjectURL(evidencePreviewUrl);
    setEvidenceFile(null);
    setEvidencePreviewUrl("");
  }

  async function loadExistingEvidencePreview(item: EssTimeAdjustRequest) {
    const attachment = item.attachments?.[0];
    if (!attachment) return;

    try {
      const preview = await previewEssTimeAdjustAttachment(
        item.id,
        attachment.id,
        attachment.fileName || "time-adjust-evidence",
      );
      setEvidencePreviewUrl((current) => {
        if (current) window.URL.revokeObjectURL(current);
        return preview.objectUrl;
      });
    } catch {
      toast.warning("โหลดรูปหลักฐานเดิมไม่สำเร็จ แต่ยังแก้ไขคำขอแก้เวลาได้");
    }
  }

  function handleEvidenceFile(file?: File | null) {
    if (!file) return;

    if (!isImageFile(file)) {
      toast.error("รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP เท่านั้น");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 10 MB");
      return;
    }

    resetEvidence();
    setEvidenceFile(file);
    setEvidencePreviewUrl(window.URL.createObjectURL(file));
  }

  async function handleOffsiteAttachmentChange(file?: File | null) {
    if (!file) {
      updateOffsiteForm("attachmentUrl", "");
      return;
    }

    if (!isImageFile(file)) {
      toast.error("รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP เท่านั้น");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 10 MB");
      return;
    }

    /*
     * ต้องย่อก่อนเสมอ — รูปนี้ถูกส่งเป็น base64 ไปกับ JSON body ไม่ใช่ multipart
     * รูปจากกล้องมือถือขนาดจริงจะทะลุเพดาน body ของ backend แล้วคำขอตกทั้งใบ
     */
    try {
      const dataUrl = await compressImageToDataUrl(file);
      updateOffsiteForm("attachmentUrl", dataUrl);
      toast.success("แนบรูปหลักฐาน Offsite เรียบร้อยแล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "อ่านไฟล์รูปภาพไม่สำเร็จ",
      );
    }
  }

  function validateOffsiteForm(shouldSubmit: boolean) {
    if (!offsiteForm.workDate) return "กรุณาเลือกวันที่ทำงานนอกสถานที่";
    if (!offsiteForm.startTime) return "กรุณาระบุเวลาเริ่มทำงานนอกสถานที่";
    if (!offsiteForm.endTime) return "กรุณาระบุเวลาสิ้นสุดทำงานนอกสถานที่";
    if (
      minutesFromClock(offsiteForm.startTime) >=
      minutesFromClock(offsiteForm.endTime)
    ) {
      return "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม";
    }
    if (!offsiteForm.reason.trim())
      return "กรุณาระบุเหตุผลการขอทำงานนอกสถานที่";
    // ใบที่ส่งเข้าคิวอนุมัติต้องมีรูปหลักฐานเสมอ ร่างยังบันทึกไว้ก่อนได้
    if (shouldSubmit && !offsiteForm.attachmentUrl) {
      return "กรุณาแนบรูปหลักฐานการทำงานนอกสถานที่ก่อนส่งคำขอ";
    }
    return "";
  }

  function validateForm(shouldSubmit: boolean) {
    if (!form.requestedDate) return "กรุณาเลือกวันที่ต้องการแก้เวลา";
    if (!form.requestedTime) return "กรุณาระบุเวลาที่ถูกต้อง";
    if (!form.reason.trim()) return "กรุณาระบุเหตุผลในการขอแก้เวลา";
    /*
     * ใบที่ส่งเข้าคิวอนุมัติต้องมีรูปหลักฐานเสมอ ตรงกับที่หลังบ้านบังคับ
     * ร่างยังบันทึกไว้ก่อนได้ ให้พนักงานที่ยังไม่ได้ถ่ายรูปกลับมาแนบทีหลัง
     * ใบที่แก้ไขนับรูปที่แนบไว้ก่อนหน้าด้วย
     */
    if (
      shouldSubmit &&
      !evidenceFile &&
      (editingItem?.attachments?.length ?? 0) === 0
    ) {
      return "กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูปก่อนส่งคำขอแก้เวลา";
    }
    return "";
  }

  async function resolveOriginalAttendanceLogIdForWrongTime(
    requestedLogTime: string,
  ) {
    if (form.adjustType !== "WRONG_TIME") return undefined;

    const isoDate = normalizeIsoDate(form.requestedDate);
    const response = await getMyTimeAdjustAttendanceLogs({
      page: 1,
      pageSize: 50,
      dateFrom: isoDate,
      dateTo: isoDate,
    });
    const originalLog = findNearestOriginalAttendanceLog(response.items ?? [], {
      targetLogType: form.targetLogType,
      targetSession: form.targetSession,
      requestedLogTime,
    });

    if (!originalLog?.id) {
      throw new Error(
        getOriginalLogMissingMessage(
          form.targetLogType,
          requestedLogTime,
          form.targetSession,
        ),
      );
    }

    return originalLog.id;
  }

  async function saveTimeAdjustRequest(shouldSubmit: boolean) {
    const validationMessage = validateForm(shouldSubmit);

    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    try {
      setSaving(true);
      const requestedLogTime = buildApiDateTime(
        form.requestedDate,
        form.requestedTime,
      );
      const originalAttendanceLogId =
        await resolveOriginalAttendanceLogIdForWrongTime(requestedLogTime);

      const payload: CreateEssTimeAdjustRequestForm = {
        originalAttendanceLogId,
        adjustType: form.adjustType,
        targetLogType: form.targetLogType,
        requestedLogTime,
        reason: form.reason.trim(),
        note: form.note.trim() || undefined,
        submit: shouldSubmit,
      };

      if (editingItem) {
        const updatePayload: Partial<CreateEssTimeAdjustRequestForm> = {
          ...payload,
        };
        delete updatePayload.submit;
        await updateEssTimeAdjustRequest(editingItem.id, updatePayload);

        if (evidenceFile) {
          await uploadEssTimeAdjustAttachment(editingItem.id, {
            title: "หลักฐานคำขอแก้เวลา",
            description: form.reason.trim(),
            file: evidenceFile,
          });
        }

        const returnedReview = isReturnedReviewDraft(editingItem);

        if (shouldSubmit && editingItem.status === "DRAFT") {
          await submitEssTimeAdjustRequest(editingItem.id);
        }

        toast.success(
          returnedReview && shouldSubmit
            ? "ส่งคำขอแก้เวลาที่แก้ไขแล้วกลับเข้าคิวอนุมัติเรียบร้อย"
            : "แก้ไขคำขอแก้เวลาเรียบร้อยแล้ว",
        );
      } else {
        /*
         * สร้างเป็นร่างก่อนเสมอ แล้วค่อยแนบรูปและส่งเข้าคิวอนุมัติ
         *
         * รูปหลักฐานอัปโหลดได้ต่อเมื่อมีใบอยู่แล้ว และหลังบ้านไม่รับใบที่ยังไม่มี
         * หลักฐาน การส่งพร้อมสร้างจึงทำไม่ได้อีกต่อไป
         */
        const created = await createEssTimeAdjustRequest({
          ...payload,
          submit: false,
        });

        if (evidenceFile) {
          await uploadEssTimeAdjustAttachment(created.id, {
            title: "หลักฐานคำขอแก้เวลา",
            description: form.reason.trim(),
            file: evidenceFile,
          });
        }

        if (shouldSubmit) {
          await submitEssTimeAdjustRequest(created.id);
        }

        toast.success(
          shouldSubmit
            ? "ส่งคำขอแก้เวลาเรียบร้อยแล้ว"
            : "บันทึกร่างคำขอแก้เวลาเรียบร้อยแล้ว",
        );
      }

      setForm(defaultForm);
      setEditingItem(null);
      setEditingOffsiteItem(null);
      resetEvidence();
      setCreateOpen(false);
      void loadData(filters, { silent: true });
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "บันทึกคำขอแก้เวลาไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function saveOffsiteWorkRequest(shouldSubmit: boolean) {
    const validationMessage = validateOffsiteForm(shouldSubmit);

    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    try {
      setSaving(true);

      const payload: CreateOffsiteWorkRequestForm = {
        workDate: normalizeIsoDate(
          offsiteForm.workDate || form.requestedDate || todayDate(),
        ),
        startTime: normalizeClockValue(offsiteForm.startTime || "08:00"),
        endTime: normalizeClockValue(offsiteForm.endTime || "17:00", "17:00"),
        reason: offsiteForm.reason.trim(),
        attachmentUrl: offsiteForm.attachmentUrl || undefined,
        submit: shouldSubmit,
      };

      if (editingOffsiteItem) {
        const updatePayload = { ...payload };
        delete updatePayload.submit;

        await updateMyOffsiteWorkRequest(editingOffsiteItem.id, updatePayload);

        if (shouldSubmit && editingOffsiteItem.status === "DRAFT") {
          await submitOffsiteWorkRequest(editingOffsiteItem.id);
        }

        toast.success(
          shouldSubmit
            ? "แก้ไขและส่งคำขอทำงานนอกสถานที่เรียบร้อยแล้ว"
            : "แก้ไขร่างคำขอทำงานนอกสถานที่เรียบร้อยแล้ว",
        );
      } else {
        await createOffsiteWorkRequest(payload);

        toast.success(
          shouldSubmit
            ? "สร้างและส่งคำขอทำงานนอกสถานที่เรียบร้อยแล้ว"
            : "บันทึกร่างคำขอทำงานนอกสถานที่เรียบร้อยแล้ว",
        );
      }

      resetOffsiteForm();
      setEditingOffsiteItem(null);
      setCreateOpen(false);
      void loadData(filters, { silent: true });
    } catch (saveError) {
      toast.error(
        getErrorMessage(saveError, "บันทึกคำขอทำงานนอกสถานที่ไม่สำเร็จ"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.adjustType === "OUTSIDE_WORK") {
      await saveOffsiteWorkRequest(true);
      return;
    }

    await saveTimeAdjustRequest(true);
  }

  function openCreateForm(
    initialAdjustType: TimeAdjustFormState["adjustType"] = "MISSING_CHECK_IN",
  ) {
    setEditingItem(null);
    setEditingOffsiteItem(null);
    setForm({ ...defaultForm, adjustType: initialAdjustType });
    resetOffsiteForm();
    setOriginalLogPreview(null);
    setOriginalLogLoading(false);
    resetEvidence();
    setCreateOpen(true);
  }

  function openEditForm(item: EssTimeAdjustRequest) {
    if (isSubmittedForApproval(item.status)) {
      toast.error("รายการที่ส่งอนุมัติแล้ว ต้องยกเลิกการส่งก่อนแก้ไข");
      return;
    }

    if (
      isTerminalTimeAdjustStatus(item.status) &&
      !isReturnedReviewDraft(item)
    ) {
      toast.error("รายการนี้สิ้นสุดกระบวนการแล้ว ไม่สามารถแก้ไขได้");
      return;
    }

    const logType = item.targetLogType ?? item.requestedLogType ?? "CHECK_IN";

    setEditingItem(item);
    setEditingOffsiteItem(null);
    setOriginalLogPreview(
      item.originalAttendanceLog
        ? (item.originalAttendanceLog as EssAttendanceLog)
        : null,
    );
    setOriginalLogLoading(false);
    setForm({
      adjustType:
        item.adjustType === "OUTSIDE_WORK"
          ? "OTHER"
          : (item.adjustType as TimeAdjustFormState["adjustType"]) ||
            "MISSING_CHECK_IN",
      targetLogType:
        (logType as TimeAdjustFormState["targetLogType"]) || "CHECK_IN",
      targetSession:
        logType === "CHECK_IN"
          ? inferCheckInSessionFromTime(item.requestedLogTime)
          : "",
      requestedDate: normalizeDateInput(item.requestedLogTime) || todayDate(),
      requestedTime: normalizeShortTime(item.requestedLogTime) || "08:00",
      reason: item.reason ?? "",
      note: item.note ?? "",
      submit: item.status === "DRAFT",
    });
    resetEvidence();
    setCreateOpen(true);
    void loadExistingEvidencePreview(item);
  }

  function openEditOffsiteForm(item: OffsiteWorkRequest) {
    if (!canEditOffsiteRequest(item.status)) {
      toast.error(
        "รายการนี้ต้องเป็นร่าง หรือถูกส่งกลับให้แก้ไขก่อน จึงจะแก้ไขได้",
      );
      return;
    }

    setEditingItem(null);
    setEditingOffsiteItem(item);
    setOriginalLogPreview(null);
    setOriginalLogLoading(false);
    resetEvidence();
    setForm({ ...defaultForm, adjustType: "OUTSIDE_WORK" });
    setOffsiteForm({
      workDate: normalizeDateInput(item.workDate) || todayDate(),
      startTime: normalizeShortTime(item.startTime) || "08:00",
      endTime: normalizeShortTime(item.endTime) || "17:00",
      reason: item.reason ?? "",
      attachmentUrl: item.attachmentUrl ?? "",
    });
    setCreateOpen(true);
  }

  function handleSubmitOffsiteDraft(item: OffsiteWorkRequest) {
    if (!canEditOffsiteRequest(item.status)) {
      toast.error("ส่งคำขอได้เฉพาะรายการแบบร่างเท่านั้น");
      return;
    }

    setActionDialog({
      title: isReturnedOffsiteDraft(item)
        ? "ส่งคำขอ Offsite ที่แก้ไขแล้วอีกครั้ง"
        : "ส่งคำขอทำงานนอกสถานที่",
      description: `ทำงานนอกสถานที่ · ${essDate(item.workDate)}`,
      confirmLabel: isReturnedOffsiteDraft(item) ? "ส่งคำขอใหม่" : "ส่งคำขอ",
      cancelLabel: "กลับไปก่อน",
      tone: "blue",
      onConfirm: async () => {
        try {
          setSubmittingDraftId(item.id);
          await submitOffsiteWorkRequest(item.id);
          toast.success("ส่งคำขอ Offsite เรียบร้อยแล้ว");
          void loadData(filters, { silent: true });
        } finally {
          setSubmittingDraftId(null);
        }
      },
    });
  }

  function handleCancelOffsiteRequest(item: OffsiteWorkRequest) {
    if (!isSubmittedOffsiteStatus(item.status)) {
      toast.error("ยกเลิกการส่งได้เฉพาะรายการ Offsite ที่รออนุมัติเท่านั้น");
      return;
    }

    setActionDialog({
      title: "ยกเลิกการส่งคำขอ Offsite",
      description:
        "ระบบจะถอนคำขอนี้ออกจากคิวอนุมัติและกลับเป็นร่าง เพื่อให้คุณแก้ไขข้อมูลแล้วส่งคำขอใหม่อีกครั้ง",
      confirmLabel: "ยืนยันยกเลิกการส่ง",
      cancelLabel: "กลับไป",
      tone: "orange",
      onConfirm: async () => {
        try {
          setCancellingId(item.id);
          await cancelMyOffsiteWorkRequest(item.id, {
            reason: "ยกเลิกการส่งเพื่อแก้ไขและส่งใหม่",
          });
          toast.success("ยกเลิกการส่ง Offsite แล้ว รายการกลับเป็นร่าง");
          void loadData(filters, { silent: true });
        } finally {
          setCancellingId(null);
        }
      },
    });
  }

  function handleDeleteOffsiteRequest(item: OffsiteWorkRequest) {
    if (!canEditOffsiteRequest(item.status)) {
      toast.error(
        "ลบได้เฉพาะรายการ Offsite แบบร่าง หรือรายการที่ถูกส่งกลับให้แก้ไขเท่านั้น",
      );
      return;
    }

    setActionDialog({
      title: "ลบรายการ Offsite",
      description:
        "ต้องการลบรายการขอทำงานนอกสถานที่นี้ออกจากประวัติหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบรายการ",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        try {
          setDeletingId(item.id);
          await deleteMyOffsiteWorkRequest(item.id);
          if (editingOffsiteItem?.id === item.id) setEditingOffsiteItem(null);
          toast.success("ลบรายการ Offsite เรียบร้อยแล้ว");
          void loadData(filters, { silent: true });
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  function handleDeleteRequest(item: EssTimeAdjustRequest) {
    if (isSubmittedForApproval(item.status)) {
      toast.error("รายการที่ส่งอนุมัติแล้ว ต้องยกเลิกการส่งก่อนลบ");
      return;
    }

    if (
      isTerminalTimeAdjustStatus(item.status) &&
      !isReturnedReviewDraft(item)
    ) {
      toast.error("รายการนี้สิ้นสุดกระบวนการแล้ว ไม่สามารถลบได้");
      return;
    }

    setActionDialog({
      title: "ลบรายการขอแก้เวลา",
      description:
        "ต้องการลบรายการขอแก้เวลานี้ออกจากประวัติหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบรายการ",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        try {
          setDeletingId(item.id);
          await deleteEssTimeAdjustRequest(item.id);
          if (editingItem?.id === item.id) setEditingItem(null);
          if (detailItem?.id === item.id) setDetailItem(null);
          toast.success("ลบรายการขอแก้เวลาเรียบร้อยแล้ว");
          void loadData(filters, { silent: true });
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  function handleCancelSubmittedRequest(item: EssTimeAdjustRequest) {
    if (!isSubmittedForApproval(item.status)) {
      toast.error("ยกเลิกการส่งได้เฉพาะรายการที่รออนุมัติเท่านั้น");
      return;
    }

    setActionDialog({
      title: "ยกเลิกการส่งคำขอแก้เวลา",
      description:
        "ระบบจะถอนคำขอนี้ออกจากคิวอนุมัติและกลับเป็นร่าง เพื่อให้คุณแก้ไขข้อมูลแล้วส่งคำขอใหม่อีกครั้ง",
      confirmLabel: "ยืนยันยกเลิกการส่ง",
      cancelLabel: "กลับไป",
      tone: "orange",
      onConfirm: async () => {
        try {
          setCancellingId(item.id);
          await cancelEssTimeAdjustRequest(item.id, {
            reason: "ยกเลิกการส่งเพื่อแก้ไขและส่งใหม่",
          });
          if (detailItem?.id === item.id) setDetailItem(null);
          toast.success(
            "ยกเลิกการส่งแล้ว รายการกลับเป็นร่างเพื่อแก้ไขและส่งใหม่",
          );
          void loadData(filters, { silent: true });
        } finally {
          setCancellingId(null);
        }
      },
    });
  }

  async function openEvidenceViewer(
    requestId: string,
    attachment: EssAttachment,
  ) {
    try {
      setPreviewingEvidenceId(attachment.id);
      const preview = await previewEssTimeAdjustAttachment(
        requestId,
        attachment.id,
        attachment.fileName ?? "time-adjust-evidence",
      );

      if (evidenceViewer?.objectUrl)
        window.URL.revokeObjectURL(evidenceViewer.objectUrl);

      setEvidenceViewer({
        requestId,
        attachment,
        objectUrl: preview.objectUrl,
        fileName: preview.fileName,
        contentType: preview.contentType,
      });
    } catch (previewError) {
      toast.error(getErrorMessage(previewError, "เปิดรูปหลักฐานไม่สำเร็จ"));
    } finally {
      setPreviewingEvidenceId(null);
    }
  }

  function closeEvidenceViewer() {
    if (evidenceViewer?.objectUrl)
      window.URL.revokeObjectURL(evidenceViewer.objectUrl);
    setEvidenceViewer(null);
  }

  function openOffsiteEvidenceViewer(item: OffsiteWorkRequest) {
    if (!item.attachmentUrl) {
      toast.warning("รายการนี้ไม่มีรูปหลักฐาน Offsite");
      return;
    }

    setOffsiteEvidenceViewer({
      title: item.requestNo
        ? `รูปหลักฐาน Offsite · ${item.requestNo}`
        : "รูปหลักฐาน Offsite",
      url: item.attachmentUrl,
      description: item.reason || null,
    });
  }

  const timePendingCount =
    summary.submitted ||
    items.filter((item) => isPendingStatus(item.status)).length;
  const timeApprovedCount =
    summary.approved ||
    items.filter((item) => isApprovedStatus(item.status)).length;
  const timeRejectedCount =
    summary.rejected ||
    items.filter((item) => isRejectedStatus(item.status)).length;
  const pendingCount =
    timePendingCount +
    offsiteItems.filter((item) => isPendingStatus(item.status)).length;
  const approvedCount =
    timeApprovedCount +
    offsiteItems.filter((item) => isApprovedStatus(item.status)).length;
  const rejectedCount =
    timeRejectedCount +
    offsiteItems.filter((item) => isRejectedStatus(item.status)).length;
  const returnedCount = items.filter(isReturnedReviewDraft).length;
  const totalCount = (summary.total || items.length) + offsiteItems.length;

  /*
   * ประวัติของสองระบบมาคนละ endpoint แต่ผู้ใช้มองเป็นตารางเดียว
   * รวมแล้วเรียงตามเวลายื่นล่าสุด — เดิมต่อท้ายกันเฉย ๆ Offsite เลยไปกองท้ายตาราง
   */
  const historyRows: HistoryRow[] = [
    ...items.map((item) => ({
      kind: "TIME" as const,
      id: item.id,
      sortAt: item.submittedAt ?? item.createdAt,
      time: item,
    })),
    ...offsiteItems.map((item) => ({
      kind: "OFFSITE" as const,
      id: `offsite-${item.id}`,
      sortAt: item.submittedAt ?? item.createdAt,
      offsite: item,
    })),
  ].sort(
    (a, b) =>
      new Date(b.sortAt ?? 0).getTime() - new Date(a.sortAt ?? 0).getTime(),
  );

  /* เมนูของสองระบบต่างกัน — คำขอแก้เวลามีจอรายละเอียด ส่วน Offsite ยังไม่มี */
  function historyMenuItems(row: HistoryRow): RowMenuItem[] {
    if (row.kind === "OFFSITE") {
      const item = row.offsite;
      const submitted = isSubmittedOffsiteStatus(item.status);
      const editable = canEditOffsiteRequest(item.status);
      const returnedDraft = isReturnedOffsiteDraft(item);

      return [
        {
          label: returnedDraft ? "แก้ไขและส่งใหม่" : "แก้ไข",
          icon: returnedDraft ? (
            <Send className="h-3.5 w-3.5" />
          ) : (
            <Pencil className="h-3.5 w-3.5" />
          ),
          onSelect: () => openEditOffsiteForm(item),
          disabled: !editable,
        },
        {
          label: returnedDraft ? "ส่งใหม่" : "ส่งคำขอ",
          icon: <Send className="h-3.5 w-3.5" />,
          onSelect: () => void handleSubmitOffsiteDraft(item),
          disabled: !editable || submittingDraftId === item.id,
        },
        {
          label: "ยกเลิกการส่ง",
          icon: <Undo2 className="h-3.5 w-3.5" />,
          onSelect: () => void handleCancelOffsiteRequest(item),
          disabled: !submitted || cancellingId === item.id,
          separated: true,
        },
        {
          label: "ลบรายการ",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          tone: "danger",
          onSelect: () => void handleDeleteOffsiteRequest(item),
          disabled: !editable || deletingId === item.id,
        },
      ];
    }

    const item = row.time;
    const returnedDraft = isReturnedReviewDraft(item);
    const editable =
      normalizeRequestStatus(item.status) === "DRAFT" || returnedDraft;
    const submitted = isSubmittedForApproval(item.status);

    return [
      {
        label: "ดูรายละเอียด",
        icon: <Eye className="h-3.5 w-3.5" />,
        onSelect: () => setDetailItem(item),
      },
      {
        label: returnedDraft ? "แก้ไขและส่งใหม่" : "แก้ไข",
        icon: returnedDraft ? (
          <Send className="h-3.5 w-3.5" />
        ) : (
          <Pencil className="h-3.5 w-3.5" />
        ),
        onSelect: () => openEditForm(item),
        disabled: !editable,
        separated: true,
      },
      {
        label: "ยกเลิกการส่ง",
        icon: <Undo2 className="h-3.5 w-3.5" />,
        onSelect: () => void handleCancelSubmittedRequest(item),
        disabled: !submitted || cancellingId === item.id,
      },
      {
        label: "ลบรายการ",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        tone: "danger",
        onSelect: () => void handleDeleteRequest(item),
        disabled: !editable || deletingId === item.id,
      },
    ];
  }

  const columns: Array<Column<HistoryRow>> = [
    {
      key: "when",
      header: "วันที่ / เวลา",
      width: "w-[13rem]",
      cell: (row) =>
        row.kind === "TIME" ? (
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 3xl:text-[13.5px]">
              {essDate(row.time.requestedLogTime)}
            </p>
            <p className="truncate text-[12px] text-slate-400">
              {essTime(row.time.requestedLogTime)} น.
              {row.time.requestNo ? ` · ${row.time.requestNo}` : ""}
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 3xl:text-[13.5px]">
              {essDate(row.offsite.workDate)}
            </p>
            <p className="truncate text-[12px] text-slate-400">
              {essTime(row.offsite.startTime)}–{essTime(row.offsite.endTime)} น.
              {row.offsite.requestNo ? ` · ${row.offsite.requestNo}` : ""}
            </p>
          </div>
        ),
    },
    {
      key: "type",
      header: "ประเภท",
      width: "w-[11rem]",
      cell: (row) =>
        row.kind === "TIME" ? (
          <p className="truncate text-[13px] font-semibold text-slate-700">
            {adjustTypeLabel(row.time.adjustType)}
          </p>
        ) : (
          <Badge tone="positive">ทำงานนอกสถานที่</Badge>
        ),
    },
    {
      key: "target",
      header: "รายการที่แก้",
      width: "w-[11rem]",
      hideBelow: "xl",
      cell: (row) =>
        row.kind === "TIME" ? (
          <p className="truncate text-[13px] text-slate-600">
            {targetLogTypeLabel(
              row.time.targetLogType ?? row.time.requestedLogType,
              row.time.requestedLogTime,
            )}
          </p>
        ) : (
          <p className="truncate text-[13px] text-slate-600">
            {row.offsite.locationName || "คำขอ Offsite"}
          </p>
        ),
    },
    {
      key: "reason",
      header: "เหตุผล",
      cell: (row) => {
        if (row.kind === "OFFSITE") {
          return (
            <p className="truncate text-[13px] text-slate-600">
              {row.offsite.reason || "-"}
            </p>
          );
        }

        const item = row.time;
        const returned = getReturnedReviewInfo(item);
        const returnedDraft = isReturnedReviewDraft(item);

        return (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-slate-600">
              {item.reason || "-"}
            </p>
            {item.note ? (
              <p className="truncate text-[12px] text-slate-400">
                หมายเหตุ: {item.note}
              </p>
            ) : null}
            {returnedDraft && returned?.reason ? (
              <p className="truncate text-[12px] text-amber-600">
                ส่งกลับ: {returned.reason}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "evidence",
      header: "หลักฐาน",
      width: "w-[8rem]",
      hideBelow: "xl",
      cell: (row) => {
        if (row.kind === "OFFSITE") {
          if (!row.offsite.attachmentUrl) {
            return <span className="text-[13px] text-slate-300">ไม่มี</span>;
          }

          return (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openOffsiteEvidenceViewer(row.offsite);
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:text-brand-800"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              ดูรูป
            </button>
          );
        }

        const attachment = firstAttachment(row.time);
        if (!attachment) {
          return <span className="text-[13px] text-slate-300">ไม่มี</span>;
        }

        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openEvidenceViewer(row.time.id, attachment);
            }}
            disabled={previewingEvidenceId === attachment.id}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-60"
          >
            {previewingEvidenceId === attachment.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            ดูรูป
          </button>
        );
      },
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-[12rem]",
      cell: (row) => {
        if (row.kind === "OFFSITE") {
          return (
            <div className="min-w-0">
              <EssStatusBadge status={row.offsite.status} />
              <p className="mt-0.5 truncate text-[11.5px] text-slate-400">
                {essDateTime(row.offsite.submittedAt ?? row.offsite.createdAt)}
              </p>
            </div>
          );
        }

        return (
          <TimeAdjustRequestStatusCell
            item={row.time}
            returnedReviewInfo={getReturnedReviewInfo(row.time)}
            returnedDraft={isReturnedReviewDraft(row.time)}
            resubmittedFromReturned={isResubmittedAfterReturnedReview(row.time)}
          />
        );
      },
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      width: "w-[6rem]",
      cell: (row) => {
        const menuItems = historyMenuItems(row);

        /*
         * Offsite ที่จบแล้วไม่มีอะไรให้ทำเลย (ไม่มีจอรายละเอียดเหมือนคำขอแก้เวลา)
         * เปิดเมนูมาเจอปุ่มเทาทั้งสี่อันไม่ช่วยอะไร บอกไปตรง ๆ ว่าจบยังไงดีกว่า
         */
        if (menuItems.every((menuItem) => menuItem.disabled)) {
          return (
            <span className="text-[12px] text-slate-400">
              {row.kind === "OFFSITE"
                ? offsiteTerminalText(row.offsite)
                : "สิ้นสุดแล้ว"}
            </span>
          );
        }

        return <RowMenu items={menuItems} />;
      },
    },
  ];

  return (
    <>
      {/* ---------------- สรุปคำขอ ---------------- */}
      <section className="border-b border-slate-200 px-5 py-4 3xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL_CLASS}>
              คำขอแก้เวลา / Offsite ปี {filters.year}
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              ยื่นแก้เวลาเข้า-ออกงาน หรือขอทำงานนอกสถานที่
              ใช้ฟอร์มเดียวกันโดยเลือกที่ประเภทคำขอ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadData(filters)}
              disabled={loading}
              icon={
                <RefreshCw
                  className={joinClassName(
                    "h-3.5 w-3.5",
                    loading && "animate-spin",
                  )}
                />
              }
            >
              โหลดข้อมูลใหม่
            </Button>
            <Button
              variant="primary"
              onClick={() => openCreateForm()}
              icon={<PlusCircle className="h-3.5 w-3.5" />}
            >
              ยื่นคำขอ
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-4 sm:divide-y-0">
          <StatTile
            label="คำขอทั้งหมด"
            value={count(totalCount)}
            helper="รวมคำขอแก้เวลาและ Offsite"
          />
          <StatTile
            label="รออนุมัติ"
            value={count(pendingCount)}
            tone={pendingCount > 0 ? "warning" : "neutral"}
            helper={
              pendingCount > 0 ? "รอหัวหน้าหรือ HR ตรวจสอบ" : "ไม่มีค้างอยู่"
            }
          />
          <StatTile
            label="อนุมัติแล้ว"
            value={count(approvedCount)}
            tone="positive"
            helper="ผ่านการอนุมัติแล้ว"
          />
          <StatTile
            label="ส่งกลับ / ไม่อนุมัติ"
            value={count(returnedCount + rejectedCount)}
            tone={returnedCount > 0 ? "warning" : "neutral"}
            helper={
              returnedCount > 0
                ? `ต้องแก้ไขและส่งใหม่ ${count(returnedCount)}`
                : "ไม่มีรายการที่ต้องแก้"
            }
          />
        </div>
      </section>

      {/* ---------------- ตัวกรอง ---------------- */}
      <section className="border-b border-slate-200 px-5 py-3 3xl:px-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadData(filters);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Field label="ปี" className="w-full sm:w-28">
            <TextInput
              value={filters.year}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  year: event.target.value,
                }))
              }
              inputMode="numeric"
            />
          </Field>

          <Field label="สถานะ" className="w-full sm:w-40">
            <Select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              {timeAdjustStatusOptions.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ประเภทคำขอ" className="w-full sm:w-48">
            <Select
              value={filters.adjustType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  adjustType: event.target.value,
                }))
              }
            >
              <option value="">ทุกประเภทคำขอ</option>
              {adjustTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="รายการที่แก้" className="w-full sm:w-44">
            <Select
              value={filters.targetLogType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  targetLogType: event.target.value,
                }))
              }
            >
              <option value="">ทุกรายการ</option>
              <option value="CHECK_IN">เวลาเข้างาน</option>
              <option value="CHECK_OUT">เวลาออกงาน</option>
              <option value="BREAK_START">เริ่มพัก</option>
              <option value="BREAK_END">กลับจากพัก</option>
            </Select>
          </Field>

          <Field label="ค้นหา" className="w-full sm:w-72">
            <SearchInput
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="เลขที่คำขอ เหตุผล หรือหมายเหตุ"
            />
          </Field>

          <div className="flex items-center gap-2 pb-0.5">
            <Button type="submit" variant="primary">
              ค้นหา
            </Button>
            <Button variant="ghost" onClick={resetFilters}>
              ล้างตัวกรอง
            </Button>
          </div>
        </form>
      </section>

      {/* ---------------- ประวัติคำขอ ---------------- */}
      <DataTable
        columns={columns}
        rows={historyRows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={() => void loadData(filters)}
        onRowClick={(row) => {
          if (row.kind === "TIME") setDetailItem(row.time);
        }}
        emptyTitle="ยังไม่มีประวัติคำขอ"
        emptyDescription="เมื่อยื่นคำขอแก้เวลาหรือ Offsite แล้ว รายการจะแสดงที่นี่"
        emptyAction={
          <Button
            variant="primary"
            onClick={() => openCreateForm()}
            icon={<PlusCircle className="h-3.5 w-3.5" />}
          >
            ยื่นคำขอ
          </Button>
        }
        minWidth="min-w-[68rem]"
      />

      {/*
       * กล่องครอบของจอย่อย — CSS ด้านล่างย่อจอรายละเอียดให้พอดีจอเตี้ย
       * ตัวกล่องไม่กินพื้นที่ในหน้า เพราะจอย่อยทุกตัววางแบบ fixed
       */}
      <div className="ess-time-adjust-compact">
        <style>{`
          .ess-time-adjust-compact .time-adjust-detail-dialog {
            width: min(1120px, calc(100vw - 1rem));
            max-height: calc(100dvh - 1rem);
            font-size: 13px;
          }
          .ess-time-adjust-compact .time-adjust-detail-dialog header,
          .ess-time-adjust-compact .time-adjust-detail-dialog .time-adjust-detail-header {
            padding: 1.1rem 1.2rem 1.35rem;
            min-height: 124px;
          }
          .ess-time-adjust-compact .time-adjust-detail-dialog .time-adjust-detail-header h3 {
            font-size: clamp(1.25rem, 1.85vw, 1.7rem);
            line-height: 1.2;
          }
          .ess-time-adjust-compact .time-adjust-detail-dialog .time-adjust-detail-body {
            padding-top: 1.15rem;
          }
          .ess-time-adjust-compact .time-adjust-detail-dialog section {
            border-radius: 18px;
            padding: 0.85rem;
          }
          .ess-time-adjust-compact .time-adjust-detail-dialog .time-adjust-info-tile {
            border-radius: 14px;
            padding: 0.55rem 0.65rem;
          }
          .ess-time-adjust-compact .time-adjust-detail-dialog .time-adjust-info-tile p {
            font-size: 10px;
          }
          .ess-time-adjust-compact .time-adjust-detail-dialog .time-adjust-info-tile div {
            font-size: 12px;
            line-height: 1.35;
          }
        `}</style>

        {createOpen ? (
          <TimeAdjustRequestModal
            onAdjustTypeChange={updateAdjustType}
            form={form}
            offsiteForm={offsiteForm}
            editing={Boolean(editingItem || editingOffsiteItem)}
            returnedReviewInfo={getReturnedReviewInfo(editingItem)}
            originalLogPreview={originalLogPreview}
            originalLogLoading={originalLogLoading}
            saving={saving}
            evidenceFile={evidenceFile}
            evidencePreviewUrl={evidencePreviewUrl}
            selectedAdjustType={selectedAdjustType}
            offsiteHasInvalidTime={offsiteHasInvalidTime}
            offsiteDurationText={offsiteDurationText}
            updateForm={updateForm}
            updateOffsiteForm={updateOffsiteForm}
            onEvidenceFile={handleEvidenceFile}
            onClearEvidence={resetEvidence}
            onOffsiteAttachment={handleOffsiteAttachmentChange}
            onSubmit={submitForm}
            onSaveDraft={() =>
              form.adjustType === "OUTSIDE_WORK"
                ? void saveOffsiteWorkRequest(false)
                : void saveTimeAdjustRequest(false)
            }
            onClose={() => {
              setCreateOpen(false);
              setEditingItem(null);
              setEditingOffsiteItem(null);
              resetEvidence();
              resetOffsiteForm();
            }}
          />
        ) : null}

        {detailItem ? (
          <TimeAdjustRequestDetailModal
            item={detailItem}
            previewingEvidenceId={previewingEvidenceId}
            onOpenEvidence={openEvidenceViewer}
            onClose={() => setDetailItem(null)}
          />
        ) : null}

        {evidenceViewer ? (
          <EvidenceViewerModal
            viewer={evidenceViewer}
            onClose={closeEvidenceViewer}
            onDownload={() =>
              void downloadEssTimeAdjustAttachment(
                evidenceViewer.requestId,
                evidenceViewer.attachment.id,
                evidenceViewer.fileName,
              )
            }
          />
        ) : null}

        {offsiteEvidenceViewer ? (
          <OffsiteEvidenceViewerModal
            viewer={offsiteEvidenceViewer}
            onClose={() => setOffsiteEvidenceViewer(null)}
          />
        ) : null}
      </div>

      <ActionDialog
        state={actionDialog}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}

function TimeAdjustRequestModal({
  form,
  offsiteForm,
  editing,
  returnedReviewInfo,
  originalLogPreview,
  originalLogLoading,
  saving,
  evidenceFile,
  evidencePreviewUrl,
  selectedAdjustType,
  offsiteHasInvalidTime,
  offsiteDurationText,
  updateForm,
  updateOffsiteForm,
  onAdjustTypeChange,
  onEvidenceFile,
  onClearEvidence,
  onOffsiteAttachment,
  onSubmit,
  onSaveDraft,
  onClose,
}: {
  form: TimeAdjustFormState;
  offsiteForm: OffsiteEmbeddedFormState;
  editing: boolean;
  returnedReviewInfo: ReturnedReviewInfo | null;
  originalLogPreview: EssAttendanceLog | null;
  originalLogLoading: boolean;
  saving: boolean;
  evidenceFile: File | null;
  evidencePreviewUrl: string;
  selectedAdjustType?: (typeof adjustTypeOptions)[number];
  offsiteHasInvalidTime: boolean;
  offsiteDurationText: string;
  updateForm: <Key extends keyof TimeAdjustFormState>(
    key: Key,
    value: TimeAdjustFormState[Key],
  ) => void;
  updateOffsiteForm: <Key extends keyof OffsiteEmbeddedFormState>(
    key: Key,
    value: OffsiteEmbeddedFormState[Key],
  ) => void;
  onAdjustTypeChange: (adjustType: TimeAdjustFormState["adjustType"]) => void;
  onEvidenceFile: (file?: File | null) => void;
  onClearEvidence: () => void;
  onOffsiteAttachment: (file?: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onSaveDraft: () => void;
  onClose: () => void;
}) {
  const isOffsite = form.adjustType === "OUTSIDE_WORK";
  const originalLogHint = originalLogLoading
    ? "กำลังค้นหาเวลาเดิมในระบบ..."
    : originalLogPreview?.logTime
      ? `พบเวลาเดิม ${essTime(originalLogPreview.logTime)} น.`
      : form.adjustType === "WRONG_TIME"
        ? "ยังไม่พบเวลาเดิมในระบบ"
        : "ไม่ต้องอ้างอิงเวลาเดิม";

  return (
    <Modal onClose={onClose}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                {isOffsite ? "Offsite Work" : "Time Adjustment"}
              </p>
              <h3 className="mt-0.5 text-[17px] font-bold tracking-tight text-slate-900 3xl:text-[18px]">
                {isOffsite
                  ? "สร้างคำขอทำงานนอกสถานที่"
                  : editing
                    ? "แก้ไขคำขอแก้เวลา"
                    : "สร้างคำขอแก้เวลาใหม่"}
              </h3>
              <p className="mt-1 text-[12.5px] leading-5 text-slate-500 3xl:text-[13px]">
                {isOffsite
                  ? "กรอกวันที่ เวลา เหตุผล และหลักฐาน ระบบจะส่งเข้าระบบ Offsite เดิม"
                  : returnedReviewInfo
                    ? "แก้ไขข้อมูลตามเหตุผลที่ถูกส่งกลับ แล้วส่งเข้าคิวอนุมัติใหม่"
                    : "กรอกข้อมูลเวลาและแนบหลักฐานให้ผู้อนุมัติตรวจสอบ"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="ปิดฟอร์มคำขอ"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5 max-[1536px]:px-4 max-[1536px]:py-4">
          {returnedReviewInfo && !isOffsite ? (
            <div className="mb-4">
              <Notice
                tone="warning"
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                <p className="font-semibold">
                  รายการนี้ถูกส่งกลับให้ตรวจสอบใหม่
                </p>
                <p className="mt-0.5">เหตุผล: {returnedReviewInfo.reason}</p>
                {returnedReviewInfo.returnedAt ? (
                  <p className="mt-0.5">
                    ส่งกลับเมื่อ {essDateTime(returnedReviewInfo.returnedAt)}
                  </p>
                ) : null}
              </Notice>
            </div>
          ) : null}

          <div className="space-y-5">
            <section className="border-b border-slate-100 pb-5">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className={LABEL_CLASS}>ประเภทคำขอ</p>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
                    เลือกจากรายการเดียว โดย Offsite จะส่งผ่าน Offsite API เดิม
                  </p>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  {selectedAdjustType?.helper ??
                    "ระบบจะส่งข้อมูลให้ผู้อนุมัติตรวจสอบ"}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    ประเภทคำขอ
                  </span>
                  <select
                    value={form.adjustType}
                    onChange={(event) =>
                      onAdjustTypeChange(
                        event.target.value as TimeAdjustFormState["adjustType"],
                      )
                    }
                    className={`${fieldClass} mt-2`}
                  >
                    {adjustTypeOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={editing && option.value === "OUTSIDE_WORK"}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end text-xs font-medium leading-5 text-slate-500">
                  {isOffsite
                    ? "ทำงานนอกสถานที่จะไม่บันทึกเป็น Time Adjustment"
                    : "คำขอแก้เวลาจะบันทึกผ่าน Time Adjustment API เดิม"}
                </div>
              </div>
            </section>

            {isOffsite ? (
              <section className="pb-5">
                <div className="mb-3">
                  <p className={LABEL_CLASS}>รายละเอียด Offsite</p>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
                    ระบุวันที่และช่วงเวลาทำงาน พร้อมเหตุผลและหลักฐาน
                    โดยไม่ต้องกรอกสถานที่หรือพิกัด
                  </p>
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        วันที่ทำงานนอกสถานที่
                      </span>
                      <ThaiDateInput
                        value={offsiteForm.workDate}
                        onChange={(event) =>
                          updateOffsiteForm("workDate", event.target.value)
                        }
                        className="mt-2"
                      />
                    </label>

                    <TimePickerField
                      label="เวลาเริ่ม"
                      value={offsiteForm.startTime}
                      onChange={(value) =>
                        updateOffsiteForm("startTime", value)
                      }
                    />

                    <TimePickerField
                      label="เวลาสิ้นสุด"
                      value={offsiteForm.endTime}
                      onChange={(value) => updateOffsiteForm("endTime", value)}
                    />
                  </div>

                  <p
                    className={`text-xs font-semibold ${offsiteHasInvalidTime ? "text-red-600" : "text-slate-500"}`}
                  >
                    {offsiteHasInvalidTime
                      ? "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม"
                      : `ระยะเวลาทำงานโดยประมาณ ${offsiteDurationText}`}
                  </p>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      เหตุผล
                    </span>
                    <textarea
                      value={offsiteForm.reason}
                      onChange={(event) =>
                        updateOffsiteForm("reason", event.target.value)
                      }
                      className={`${textareaClass} mt-2`}
                      placeholder="เช่น ออกไปตรวจรับงานลูกค้า, ติดตั้งอุปกรณ์, ประชุมนอกสถานที่"
                      required={isOffsite}
                    />
                  </label>

                  <div className="flex flex-col gap-3 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/30 p-3 md:flex-row md:items-center">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-emerald-100 bg-white text-emerald-500">
                      {offsiteForm.attachmentUrl ? (
                        <img
                          src={offsiteForm.attachmentUrl}
                          alt="หลักฐาน Offsite"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-7 w-7" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">
                        รูปหลักฐาน Offsite *
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        ต้องแนบก่อนส่งคำขอ · รองรับ JPG, PNG, WEBP ขนาดไม่เกิน
                        10 MB
                      </p>
                      {offsiteForm.attachmentUrl ? (
                        <button
                          type="button"
                          onClick={() => updateOffsiteForm("attachmentUrl", "")}
                          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-xl border border-red-100 bg-white px-3 text-xs font-bold text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          ลบรูป
                        </button>
                      ) : null}
                    </div>
                    <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
                      <Upload className="h-3.5 w-3.5" />
                      เลือกรูปหลักฐาน
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          onOffsiteAttachment(event.target.files?.[0] ?? null)
                        }
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="border-b border-slate-100 pb-5">
                  <div className="mb-3">
                    <p className={LABEL_CLASS}>เวลาและรายการที่ต้องการแก้</p>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
                      เลือกรายการ วันที่ และเวลาที่ถูกต้อง
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        รายการที่ต้องการแก้
                      </span>
                      <select
                        value={getTargetLogTypeChoice(form)}
                        onChange={(event) => {
                          const option = targetLogTypeOptions.find(
                            (item) => item.value === event.target.value,
                          );
                          if (!option) return;
                          updateForm("targetLogType", option.targetLogType);
                          updateForm(
                            "targetSession",
                            option.targetSession ?? "",
                          );
                        }}
                        className={`${fieldClass} mt-2`}
                      >
                        {targetLogTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        วันที่ต้องการแก้
                      </span>
                      <ThaiDateInput
                        value={form.requestedDate}
                        onChange={(event) =>
                          updateForm("requestedDate", event.target.value)
                        }
                        className="mt-2"
                      />
                    </label>

                    <TimePickerField
                      label="เวลาที่ถูกต้อง"
                      value={form.requestedTime}
                      onChange={(value) => updateForm("requestedTime", value)}
                    />
                  </div>

                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    เวลาเดิมในระบบ:{" "}
                    <span className="text-brand-700">{originalLogHint}</span>
                  </p>
                </section>

                <section className="border-b border-slate-100 pb-5">
                  <div className="mb-3">
                    <p className={LABEL_CLASS}>รายละเอียดคำขอ</p>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
                      ระบุเหตุผลให้ชัดเจนเพื่อช่วยให้การอนุมัติเร็วขึ้น
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">
                        เหตุผล
                      </span>
                      <textarea
                        value={form.reason}
                        onChange={(event) =>
                          updateForm("reason", event.target.value)
                        }
                        className={`${textareaClass} mt-2`}
                        placeholder="เช่น ลืมสแกนนิ้วตอนเข้างาน, เครื่องสแกนขัดข้อง"
                        required
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">
                        หมายเหตุ
                      </span>
                      <textarea
                        value={form.note}
                        onChange={(event) =>
                          updateForm("note", event.target.value)
                        }
                        className={`${textareaClass} mt-2 min-h-[84px]`}
                        placeholder="หมายเหตุเพิ่มเติม ถ้ามี"
                      />
                    </label>
                  </div>
                </section>

                <section>
                  <div className="mb-3">
                    <p className={LABEL_CLASS}>หลักฐานประกอบคำขอ *</p>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
                      ต้องแนบรูปอย่างน้อย 1 รูปก่อนส่งคำขอ
                    </p>
                  </div>
                  <EvidenceUploadBox
                    file={evidenceFile}
                    previewUrl={evidencePreviewUrl}
                    onFile={onEvidenceFile}
                    onClear={onClearEvidence}
                  />
                </section>
              </>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-20 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:px-6">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>

          <Button variant="secondary" onClick={onSaveDraft} disabled={saving}>
            {isOffsite
              ? "บันทึก Offsite เป็นร่าง"
              : returnedReviewInfo
                ? "บันทึกการแก้ไข"
                : "บันทึกเป็นฉบับร่าง"}
          </Button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-5 text-[13px] font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isOffsite
              ? "ส่งคำขอ Offsite"
              : returnedReviewInfo
                ? "ส่งคำขอแก้เวลาใหม่"
                : "ส่งคำขอแก้เวลา"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TimeAdjustRequestStatusCell({
  item,
  returnedReviewInfo,
  returnedDraft,
  resubmittedFromReturned,
}: {
  item: EssTimeAdjustRequest;
  returnedReviewInfo: ReturnedReviewInfo | null;
  returnedDraft: boolean;
  resubmittedFromReturned: boolean;
}) {
  if (returnedDraft) {
    return (
      <div className="min-w-0">
        <span className="inline-flex rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
          ตรวจสอบใหม่
        </span>
        <p className="mt-1 text-xs font-medium leading-5 text-orange-700">
          รอแก้ไขและส่งใหม่
        </p>
        {returnedReviewInfo?.returnedAt ? (
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
            ส่งกลับเมื่อ {essDateTime(returnedReviewInfo.returnedAt)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <EssStatusBadge status={item.status} />
      {resubmittedFromReturned ? (
        <p className="mt-1 text-xs font-medium leading-5 text-brand-700">
          ส่งใหม่จากการตรวจสอบใหม่
        </p>
      ) : null}
    </div>
  );
}

function normalizeRequestStatus(status?: string | null) {
  return String(status ?? "").toUpperCase();
}

function isSubmittedForApproval(status?: string | null) {
  return normalizeRequestStatus(status) === "SUBMITTED";
}

function isTerminalTimeAdjustStatus(status?: string | null) {
  return ["APPROVED", "REJECTED", "CANCELLED"].includes(
    normalizeRequestStatus(status),
  );
}

function normalizeDateInput(value?: string | null) {
  if (!value) return "";
  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return year && month && day ? `${year}-${month}-${day}` : "";
}

function normalizeShortTime(value?: string | null) {
  return toBangkokClockKey(value) || "";
}

function isSubmittedOffsiteStatus(status?: string | null) {
  return ["SUBMITTED", "MANAGER_APPROVED"].includes(
    String(status ?? "").toUpperCase(),
  );
}

function isReturnedOffsiteDraft(item?: OffsiteWorkRequest | null) {
  if (String(item?.status ?? "").toUpperCase() !== "DRAFT") return false;

  return Boolean(
    item?.approvalSnapshot?.steps?.some((step) => {
      return (
        step.status === "CANCELLED" &&
        Boolean(step.actedAt || step.reason || step.note)
      );
    }),
  );
}

function canEditOffsiteRequest(status?: string | null) {
  return String(status ?? "").toUpperCase() === "DRAFT";
}

function offsiteTerminalText(item: OffsiteWorkRequest) {
  const status = String(item.status ?? "").toUpperCase();
  if (["APPROVED", "HR_APPROVED"].includes(status)) return "อนุมัติแล้ว";
  if (status === "CANCELLED") return "ยกเลิกแล้ว";
  if (status.includes("REJECTED")) return "ไม่อนุมัติ";
  return "ดูได้เท่านั้น";
}

function EvidenceUploadBox({
  file,
  previewUrl,
  onFile,
  onClear,
}: {
  file: File | null;
  previewUrl: string;
  onFile: (file?: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-brand-200 bg-brand-50/50 p-3 md:flex-row md:items-center">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-brand-700">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="หลักฐานคำขอแก้เวลา"
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="h-7 w-7" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900 3xl:text-[13.5px]">
          รูปหลักฐานคำขอแก้เวลา *
        </p>
        <p className="mt-0.5 text-[11.5px] leading-5 text-slate-500">
          ต้องแนบก่อนส่งคำขอ · รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 10 MB
        </p>
        {file ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="max-w-full truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-[11.5px] font-semibold text-brand-700">
              {file.name}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              ลบรูป
            </button>
          </div>
        ) : null}
      </div>

      <label className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white transition hover:bg-brand-700">
        <Upload className="h-3.5 w-3.5" />
        เลือกรูปหลักฐาน
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          className="hidden"
        />
      </label>
    </div>
  );
}

function TimeAdjustRequestDetailModal({
  item,
  previewingEvidenceId,
  onOpenEvidence,
  onClose,
}: {
  item: EssTimeAdjustRequest;
  previewingEvidenceId: string | null;
  onOpenEvidence: (requestId: string, attachment: EssAttachment) => void;
  onClose: () => void;
}) {
  const attachment = firstAttachment(item);
  const logType = item.targetLogType ?? item.requestedLogType;
  const returnedReviewInfo = getReturnedReviewInfo(item);
  const steps = [...(item.approvalSteps ?? [])].sort(
    (a, b) => a.stepNo - b.stepNo,
  );
  const logs = [...(item.logs ?? [])].sort(
    (a, b) => getLogTimeValue(b) - getLogTimeValue(a),
  );
  const originalLog = item.originalAttendanceLog as
    EssAttendanceLog | null | undefined;
  const appliedLog = item.appliedAttendanceLog as
    EssAttendanceLog | null | undefined;

  return (
    <KitModal
      open
      size="lg"
      title={`รายละเอียดคำขอแก้เวลา${item.requestNo ? ` ${item.requestNo}` : ""}`}
      description={`${adjustTypeLabel(item.adjustType)} · ${essDate(item.requestedLogTime)} ${essTime(item.requestedLogTime)} น.`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <EssStatusBadge status={item.status} />
          <span className="text-[12.5px] text-slate-500 3xl:text-[13px]">
            {currentApprovalStepLabel(item)} · {currentApprovalMessage(item)}
          </span>
        </div>

        {returnedReviewInfo ? (
          <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
            <p className="font-semibold">รายการนี้ถูกส่งกลับให้ตรวจสอบใหม่</p>
            <p className="mt-0.5">เหตุผล: {returnedReviewInfo.reason}</p>
            {returnedReviewInfo.returnedAt ? (
              <p className="mt-0.5">
                ส่งกลับเมื่อ {essDateTime(returnedReviewInfo.returnedAt)}
              </p>
            ) : null}
          </Notice>
        ) : null}

        <Section title="สรุปคำขอ">
          <FieldGrid columns={3}>
            <DetailItem label="เลขที่คำขอ" value={item.requestNo || "-"} />
            <DetailItem
              label="ประเภทคำขอ"
              value={adjustTypeLabel(item.adjustType)}
            />
            <DetailItem
              label="รายการที่ขอแก้"
              value={targetLogTypeLabel(logType, item.requestedLogTime)}
            />
            <DetailItem
              label="วัน/เวลาที่ขอแก้"
              value={`${essDate(item.requestedLogTime)} · ${essTime(item.requestedLogTime)} น.`}
            />
            <DetailItem
              label="ผู้อนุมัติปัจจุบัน"
              value={currentApprovalMessage(item)}
            />
            <DetailItem
              label="ขั้นตอนปัจจุบัน"
              value={currentApprovalStepLabel(item)}
            />
          </FieldGrid>
        </Section>

        <Section
          title="ข้อมูลเวลา"
          description="เทียบเวลาเดิมในระบบ เวลาที่ขอแก้ และเวลาที่ระบบนำไปใช้จริง"
        >
          <FieldGrid columns={3}>
            <DetailItem
              label="เวลาเดิมในระบบ"
              value={
                originalLog?.logTime
                  ? `${essDate(originalLog.logTime)} · ${essTime(originalLog.logTime)} น.`
                  : item.adjustType === "WRONG_TIME"
                    ? "ไม่พบเวลาเดิม"
                    : "ไม่ต้องอ้างอิง"
              }
            />
            <DetailItem
              label="เวลาที่ขอแก้ใหม่"
              value={`${essDate(item.requestedLogTime)} · ${essTime(item.requestedLogTime)} น.`}
            />
            <DetailItem
              label="เวลาที่ระบบนำไปใช้"
              value={
                appliedLog?.logTime
                  ? `${essDate(appliedLog.logTime)} · ${essTime(appliedLog.logTime)} น.`
                  : item.status === "APPROVED"
                    ? "รอตรวจสอบข้อมูลที่นำไปใช้"
                    : "ยังไม่ถูกนำไปใช้"
              }
            />
          </FieldGrid>
        </Section>

        <Section title="เหตุผลและรายละเอียด">
          <div className="space-y-2">
            <DetailText label="เหตุผล" value={item.reason} />
            {item.note ? (
              <DetailText label="หมายเหตุ" value={item.note} />
            ) : null}
            {returnedReviewInfo?.reason ? (
              <DetailText
                label="เหตุผลที่ส่งกลับ"
                value={returnedReviewInfo.reason}
                tone="amber"
              />
            ) : null}
          </div>
        </Section>

        <Section
          title="หลักฐานแนบ"
          description="ไฟล์หรือรูปภาพประกอบการขอแก้เวลา"
        >
          {attachment ? (
            <button
              type="button"
              onClick={() => onOpenEvidence(item.id, attachment)}
              disabled={previewingEvidenceId === attachment.id}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 text-left transition hover:bg-brand-50/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                {previewingEvidenceId === attachment.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-900">
                  {attachment.fileName || "หลักฐานคำขอแก้เวลา"}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-slate-400">
                  กดเพื่อเปิดดูหลักฐาน
                </span>
              </span>
            </button>
          ) : (
            <p className="py-4 text-center text-[13px] text-slate-400">
              ไม่มีหลักฐานแนบในคำขอนี้
            </p>
          )}
        </Section>

        <Section
          title="ขั้นตอนอนุมัติ"
          description="เส้นทางการอนุมัติและผู้รับผิดชอบแต่ละขั้น"
        >
          {steps.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {steps.map((step) => (
                <ApprovalStepRow key={step.id} step={step} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-[13px] text-slate-400">
              ยังไม่มีขั้นตอนอนุมัติ หรือรายการยังไม่ได้ส่งอนุมัติ
            </p>
          )}
        </Section>

        <Section
          title="ประวัติการดำเนินการ"
          description="การสร้าง ส่ง อนุมัติ ไม่อนุมัติ หรือส่งกลับ เรียงจากล่าสุด"
        >
          {logs.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13px] font-semibold text-slate-900">
                      {approvalLogActionLabel(log.action)}
                    </p>
                    <p className="text-[11.5px] tabular-nums text-slate-400">
                      {formatLogTime(log.createdAt)}
                    </p>
                  </div>

                  <p className="mt-0.5 text-[11.5px] text-slate-500">
                    {[
                      log.oldStatus || log.newStatus
                        ? `${statusLabel(log.oldStatus)} → ${statusLabel(log.newStatus)}`
                        : "",
                      approvalLogActorName(log)
                        ? `โดย ${approvalLogActorName(log)}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {log.reason ? (
                    <p className="mt-1 text-[12px] leading-5 text-slate-600">
                      เหตุผล: {log.reason}
                    </p>
                  ) : null}
                  {log.note ? (
                    <p className="mt-0.5 text-[12px] leading-5 text-slate-500">
                      หมายเหตุ: {log.note}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-[13px] text-slate-400">
              ยังไม่มีประวัติการดำเนินการเพิ่มเติม
            </p>
          )}
        </Section>
      </div>
    </KitModal>
  );
}

/** ข้อความยาวหนึ่งก้อน — ป้ายเล็กด้านบน เนื้อความด้านล่าง ไม่มีกล่องครอบ */
function DetailText({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value?: string | null;
  tone?: "slate" | "amber";
}) {
  return (
    <div className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <p
        className={
          tone === "amber"
            ? "text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-600"
            : FIELD_LABEL_CLASS
        }
      >
        {label}
      </p>
      <p
        className={joinClassName(
          "mt-0.5 whitespace-pre-wrap text-[13px] leading-6",
          tone === "amber" ? "text-amber-700" : "text-slate-700",
        )}
      >
        {value || "-"}
      </p>
    </div>
  );
}

/** ขั้นอนุมัติหนึ่งขั้น — แถวเดียว ไม่ใช่การ์ดในการ์ด */
function ApprovalStepRow({ step }: { step: EssTimeAdjustApprovalStep }) {
  const status = String(step.status ?? "").toUpperCase();
  const toneClass =
    status === "APPROVED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "REJECTED"
        ? "bg-rose-50 text-rose-700"
        : status === "PENDING"
          ? "bg-brand-50 text-brand-700"
          : status === "CANCELLED"
            ? "bg-slate-100 text-slate-500"
            : "bg-amber-50 text-amber-700";

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
        {step.stepNo}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-900">
          {step.nameTh}
        </p>
        <p className="truncate text-[11.5px] text-slate-500">
          ผู้อนุมัติ: {approvalStepActorName(step)}
          {step.actedAt ? ` · ${essDateTime(step.actedAt)}` : ""}
        </p>
        {step.reason ? (
          <p className="mt-0.5 text-[12px] leading-5 text-slate-600">
            เหตุผล: {step.reason}
          </p>
        ) : null}
        {step.note ? (
          <p className="text-[12px] leading-5 text-slate-500">
            หมายเหตุ: {step.note}
          </p>
        ) : null}
      </div>

      <span
        className={joinClassName(
          "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          toneClass,
        )}
      >
        {approvalStepStatusLabel(step.status)}
      </span>
    </div>
  );
}

function OffsiteEvidenceViewerModal({
  viewer,
  onClose,
}: {
  viewer: OffsiteEvidencePreviewState;
  onClose: () => void;
}) {
  return (
    <KitModal
      open
      size="md-wide"
      title={viewer.title}
      description={viewer.description || "หลักฐานการทำงานนอกสถานที่"}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={viewer.url}
        alt={viewer.title}
        className="mx-auto max-h-[62dvh] rounded-lg border border-slate-200 object-contain"
      />
    </KitModal>
  );
}

function EvidenceViewerModal({
  viewer,
  onClose,
  onDownload,
}: {
  viewer: EvidencePreviewState;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <KitModal
      open
      size="md-wide"
      title="รูปหลักฐานคำขอแก้เวลา"
      description={viewer.fileName}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
          <Button
            variant="primary"
            onClick={onDownload}
            icon={<Upload className="h-3.5 w-3.5" />}
          >
            ดาวน์โหลดรูป
          </Button>
        </>
      }
    >
      {viewer.contentType.startsWith("image/") ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={viewer.objectUrl}
          alt={viewer.fileName}
          className="mx-auto max-h-[62dvh] rounded-lg border border-slate-200 object-contain"
        />
      ) : (
        <p className="py-10 text-center text-[13px] text-slate-500">
          ไฟล์นี้ไม่ใช่รูปภาพ กรุณากดดาวน์โหลดเพื่อเปิดดู
        </p>
      )}
    </KitModal>
  );
}

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm max-[1536px]:p-3">
      <button
        type="button"
        aria-label="ปิดฟอร์มคำขอแก้เวลา"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-sky-50 max-[1536px]:max-w-4xl max-[1536px]:rounded-xl">
        {children}
      </div>
    </div>
  );
}

function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const time = splitTimeValue(value);

  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <select
          value={time.hour}
          onChange={(event) =>
            onChange(updateTimePart(value, "hour", event.target.value))
          }
          className={fieldClass}
          aria-label={`${label} ชั่วโมง`}
        >
          {timeHourOptions.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <span className="text-sm font-bold text-slate-400">:</span>
        <select
          value={time.minute}
          onChange={(event) =>
            onChange(updateTimePart(value, "minute", event.target.value))
          }
          className={fieldClass}
          aria-label={`${label} นาที`}
        >
          {timeMinuteOptions.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-xs font-medium text-slate-500">
        เลือกเวลาแบบเดียวกับฟอร์ม Offsite เพื่อให้รูปแบบเป็น HH:mm เสมอ
      </p>
    </label>
  );
}
