"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Download,
  Eye,
  ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  PlusCircle,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  Badge,
  Button,
  DataTable,
  DetailItem,
  Field,
  FieldGrid,
  Modal,
  Notice,
  RowMenu,
  SearchInput,
  Section,
  Select,
  StatTile,
  TextInput,
  Textarea,
  joinClassName,
  type Column,
  type RowMenuItem,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cancelEssLeaveRequest,
  createEssLeaveRequest,
  deleteEssLeaveRequest,
  downloadEssLeaveAttachment,
  getEssLeaveBalances,
  getEssLeaveRequests,
  getEssLeaveTypes,
  previewEssLeaveAttachment,
  submitEssLeaveRequest,
  updateEssLeaveRequest,
  uploadEssLeaveAttachment,
} from "@/lib/api";
import { formatThaiDate, formatThaiDateTime } from "@/lib/date-format";
import { ESS_REQUEST_STATUS } from "@/lib/status-labels";
import type {
  CreateEssLeaveRequestForm,
  EssAttachment,
  EssLeaveApprovalLog,
  EssLeaveApprovalStep,
  EssLeaveBalance,
  EssLeaveRequest,
} from "@/types/ess";
import type { LeaveDayType, LeaveType } from "@/types/leave";

/**
 * ใบลา (พนักงาน)
 * --------------
 * สามส่วนเรียงตามลำดับที่พนักงานใช้จริง:
 *   สิทธิ์ที่เหลือ → ยื่นใบลา → ติดตามสถานะใบที่ยื่นไปแล้ว
 *
 * ตรรกะทั้งหมด (โควตา ลาย้อนหลัง ครึ่งวัน รายชั่วโมง หลักฐาน ส่งกลับแก้ไข)
 * ยกมาจากของเดิมทั้งชุด เปลี่ยนเฉพาะเปลือกให้เป็นชุด kit เดียวกับหน้าอื่น
 */

// ─── ชนิดข้อมูล ───────────────────────────────────────────────────────────────

type LeaveFormState = {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  dayType: LeaveDayType;
  startTime: string;
  endTime: string;
  reason: string;
  retroactiveReason: string;
  contactInfo: string;
  note: string;
  submit: boolean;
};

type LeaveFilterState = {
  year: string;
  status: string;
  leaveTypeId: string;
  search: string;
};

type LeaveEstimate = {
  label: string;
  helper: string;
  totalDays: number;
  totalMinutes: number;
};

type EvidencePreviewState = {
  requestId: string;
  attachment: EssAttachment;
  objectUrl: string;
  fileName: string;
  contentType: string;
};

type ReturnedReviewInfo = {
  reason: string;
  note: string;
  returnedAt?: string | null;
};

const FULL_DAY_MINUTES = 480;

const LABEL_CLASS =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500";

// ─── ตัวช่วยรูปแบบข้อมูล ──────────────────────────────────────────────────────

function num(value: unknown, digits = 2) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString("th-TH", { maximumFractionDigits: digits });
}

function date(value?: string | null) {
  return formatThaiDate(value);
}

function dateTime(value?: string | Date | null) {
  return formatThaiDateTime(value);
}

function currentYearText() {
  return String(new Date().getFullYear());
}

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayDiffInclusive(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return 0;
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / oneDay) + 1;
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function isRetroactiveDate(startDate: string) {
  return Boolean(startDate && startDate < todayDate());
}

function formatDayType(value?: string | null) {
  switch (value) {
    case "FULL_DAY":
      return "เต็มวัน";
    case "HALF_DAY_MORNING":
      return "ครึ่งวันเช้า";
    case "HALF_DAY_AFTERNOON":
      return "ครึ่งวันบ่าย";
    case "HOURLY":
      return "รายชั่วโมง";
    default:
      return "ไม่ระบุรูปแบบ";
  }
}

function normalizeDateInput(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function normalizeShortTime(value?: string | null) {
  if (!value) return "";
  const text = String(value);
  const match = /(\d{2}:\d{2})/.exec(text);
  return match?.[1] ?? text.slice(0, 5);
}

function buildEstimate(form: LeaveFormState): LeaveEstimate {
  if (form.dayType === "HOURLY") {
    const start = minutesFromTime(form.startTime);
    const end = minutesFromTime(form.endTime);
    const totalMinutes =
      start !== null && end !== null && end > start ? end - start : 0;
    const totalDays = totalMinutes > 0 ? totalMinutes / FULL_DAY_MINUTES : 0;

    return {
      label: totalMinutes > 0 ? `${totalMinutes} นาที` : "รอระบุช่วงเวลา",
      helper:
        totalMinutes > 0
          ? `คิดเป็นประมาณ ${num(totalDays)} วัน โดยอ้างอิง ${FULL_DAY_MINUTES} นาทีต่อวัน`
          : "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด",
      totalDays,
      totalMinutes,
    };
  }

  if (
    form.dayType === "HALF_DAY_MORNING" ||
    form.dayType === "HALF_DAY_AFTERNOON"
  ) {
    return {
      label: "0.5 วัน",
      helper: "ลาครึ่งวันต้องเป็นวันเดียวกัน",
      totalDays: 0.5,
      totalMinutes: FULL_DAY_MINUTES / 2,
    };
  }

  const days = dayDiffInclusive(form.startDate, form.endDate);

  return {
    label: days > 0 ? `${num(days)} วัน` : "รอระบุวันที่",
    helper:
      days > 0
        ? "ระบบจะตรวจโควตาและวันลาตาม policy หลังส่งคำขอ"
        : "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม",
    totalDays: days,
    totalMinutes: days * FULL_DAY_MINUTES,
  };
}

function getRequestTotalMinutes(item: EssLeaveRequest) {
  const explicitMinutes = Number(item.totalMinutes ?? 0);
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    return Math.round(explicitMinutes);
  }

  const start = item.startTime ? minutesFromTime(item.startTime) : null;
  const end = item.endTime ? minutesFromTime(item.endTime) : null;
  if (start !== null && end !== null && end > start) return end - start;

  const totalDays = Number(item.totalDays ?? 0);
  if (Number.isFinite(totalDays) && totalDays > 0) {
    return Math.round(totalDays * FULL_DAY_MINUTES);
  }

  return 0;
}

function getRequestTotalDays(item: EssLeaveRequest) {
  const totalDays = Number(item.totalDays ?? 0);
  if (Number.isFinite(totalDays) && totalDays > 0) return totalDays;

  const totalMinutes = getRequestTotalMinutes(item);
  return totalMinutes > 0 ? totalMinutes / FULL_DAY_MINUTES : 0;
}

function formatDurationMinutes(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0)
    return "รอข้อมูลเวลา";
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours > 0 && minutes > 0) {
    return `${num(hours)} ชั่วโมง ${num(minutes)} นาที`;
  }
  if (hours > 0) return `${num(hours)} ชั่วโมง`;
  return `${num(minutes)} นาที`;
}

function formatLeaveDuration(item: EssLeaveRequest) {
  const totalMinutes = getRequestTotalMinutes(item);
  const totalDays = getRequestTotalDays(item);

  if (item.dayType === "HOURLY") {
    if (totalMinutes > 0) {
      const dayText = totalDays > 0 ? ` (${num(totalDays)} วัน)` : "";
      return `${formatDurationMinutes(totalMinutes)}${dayText}`;
    }
    return "รอข้อมูลเวลา";
  }

  if (totalDays > 0) return `${num(totalDays)} วัน`;
  if (totalMinutes > 0) return `${num(totalMinutes / FULL_DAY_MINUTES)} วัน`;

  return "รอข้อมูลระยะเวลา";
}

// ─── สถานะและการส่งกลับให้แก้ไข ───────────────────────────────────────────────

function normalizeStatus(status?: string | null) {
  return String(status ?? "").toUpperCase();
}

function isRequestEditable(status?: string | null) {
  return normalizeStatus(status) === "DRAFT";
}

function isRequestSubmitted(status?: string | null) {
  return normalizeStatus(status) === "SUBMITTED";
}

function readLogValue(
  log: EssLeaveApprovalLog,
  key: keyof EssLeaveApprovalLog,
) {
  const value = log[key];
  return value === null || value === undefined ? "" : String(value);
}

function isReturnedReviewLog(log: EssLeaveApprovalLog) {
  const action = readLogValue(log, "action");
  const oldStatus = readLogValue(log, "oldStatus");
  const newStatus = readLogValue(log, "newStatus");

  return (
    action === "RETURNED_FOR_REVIEW" ||
    (action === "CANCEL" && oldStatus === "SUBMITTED" && newStatus === "DRAFT")
  );
}

function getLogTimeValue(log: EssLeaveApprovalLog) {
  const value = readLogValue(log, "createdAt");
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getReturnedReviewInfo(
  item?: EssLeaveRequest | null,
): ReturnedReviewInfo | null {
  const log = [...(item?.approvalLogs ?? [])]
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

function isReturnedReviewDraft(item?: EssLeaveRequest | null) {
  return item?.status === "DRAFT" && Boolean(getReturnedReviewInfo(item));
}

function isResubmittedAfterReturnedReview(item?: EssLeaveRequest | null) {
  return item?.status === "SUBMITTED" && Boolean(getReturnedReviewInfo(item));
}

// ─── สายอนุมัติ ───────────────────────────────────────────────────────────────

function getApprovalStepStatusLabel(status?: string | null) {
  switch (normalizeStatus(status)) {
    case "APPROVED":
      return "อนุมัติแล้ว";
    case "REJECTED":
      return "ไม่อนุมัติ";
    case "PENDING":
      return "รอดำเนินการ";
    case "WAITING":
      return "รอคิว";
    case "CANCELLED":
      return "ยกเลิก";
    case "SKIPPED":
      return "ข้ามขั้นตอน";
    default:
      return "ยังไม่ระบุ";
  }
}

function getUserDisplayName(
  user?: { displayName?: string | null; email?: string | null } | null,
) {
  return user?.displayName || user?.email || "-";
}

function getEmployeeDisplayName(
  employee?: EssLeaveApprovalStep["expectedEmployee"] | null,
) {
  if (!employee) return "-";
  const fullName = [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return employee.displayName || fullName || employee.employeeCode || "-";
}

function approverTypeText(type?: string | null) {
  const map: Record<string, string> = {
    SUPERVISOR: "หัวหน้าโดยตรง",
    POSITION: "ตามตำแหน่ง",
    EMPLOYEE: "พนักงานที่กำหนด",
    ROLE: "ตาม Role",
    HR_ADMIN: "HR Admin",
    EXECUTIVE: "ผู้บริหาร",
  };

  return type ? map[type] || type : "ผู้อนุมัติ";
}

function getApprovalPersonName(step?: EssLeaveApprovalStep | null) {
  if (!step) return "-";
  if (step.expectedEmployee)
    return getEmployeeDisplayName(step.expectedEmployee);
  if (step.expectedApprover) return getUserDisplayName(step.expectedApprover);
  if (step.position?.nameTh) return step.position.nameTh;
  if (step.roleCode) return step.roleCode;
  return approverTypeText(step.approverType);
}

function getStepDisplayName(step?: EssLeaveApprovalStep | null) {
  if (!step) return "-";
  return step.nameTh || approverTypeText(step.approverType);
}

function getApprovalDisplayInfo(item: EssLeaveRequest) {
  const status = normalizeStatus(item.status);
  const steps = item.approvalSteps ?? [];
  const currentStep =
    steps.find((step) => normalizeStatus(step.status) === "PENDING") ?? null;
  const waitingStep =
    steps.find((step) => normalizeStatus(step.status) === "WAITING") ?? null;

  if (status === "DRAFT") {
    return isReturnedReviewDraft(item)
      ? { approver: "ส่งกลับให้แก้ไข", step: "รอผู้ยื่นแก้ไขและส่งใหม่" }
      : { approver: "ยังไม่ได้ส่งอนุมัติ", step: "บันทึกเป็นร่าง" };
  }

  if (status === "SUBMITTED") {
    if (currentStep) {
      return {
        approver: getApprovalPersonName(currentStep),
        step: `${currentStep.stepNo}. ${getStepDisplayName(currentStep)}`,
      };
    }
    if (waitingStep) {
      return {
        approver: "รอเปิดขั้นตอนถัดไป",
        step: `${waitingStep.stepNo}. ${getStepDisplayName(waitingStep)}`,
      };
    }
    return { approver: "รอสร้างสายอนุมัติ", step: "ยังไม่มีขั้นตอนอนุมัติ" };
  }

  if (status === "APPROVED") {
    return { approver: "อนุมัติครบแล้ว", step: "สิ้นสุดกระบวนการ" };
  }
  if (status === "REJECTED") {
    return { approver: "ไม่อนุมัติ", step: "สิ้นสุดกระบวนการ" };
  }
  if (status === "CANCELLED") {
    return { approver: "ยกเลิกแล้ว", step: "สิ้นสุดกระบวนการ" };
  }

  return { approver: "-", step: "-" };
}

function approvalActionText(action?: string | null) {
  const map: Record<string, string> = {
    SUBMIT: "ยื่นคำขอ",
    APPROVE: "อนุมัติ",
    REJECT: "ไม่อนุมัติ",
    CANCEL: "ยกเลิก",
    RETURNED_FOR_REVIEW: "ส่งกลับให้แก้ไข",
  };
  return action ? map[action] || action : "ดำเนินการ";
}

function sortApprovalLogs(logs: EssLeaveApprovalLog[]) {
  return [...logs].sort((a, b) => getLogTimeValue(b) - getLogTimeValue(a));
}

// ─── ข้อมูลประกอบใบลา ─────────────────────────────────────────────────────────

function booleanText(
  value: boolean | null | undefined,
  trueText: string,
  falseText: string,
  unknownText = "ไม่ระบุ",
) {
  if (value === true) return trueText;
  if (value === false) return falseText;
  return unknownText;
}

function requiresAttachmentForRequest(item: EssLeaveRequest) {
  const leaveType = item.leaveType;
  const afterDays = Number(leaveType?.attachmentRequiredAfterDays ?? 0);
  const totalDays = getRequestTotalDays(item);

  return Boolean(
    leaveType?.requiresAttachment ||
    (item.isRetroactive && leaveType?.backdatedRequiresAttachment) ||
    (afterDays > 0 && totalDays >= afterDays),
  );
}

function getQuotaImpactText(item: EssLeaveRequest) {
  if (item.leaveType?.deductQuota === false) return "ไม่หักสิทธิ์ลา";
  return `หักสิทธิ์ลา ${formatLeaveDuration(item)}`;
}

function getFileSizeText(size?: number | null) {
  if (!size || size <= 0) return "ไม่ระบุขนาด";
  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB`;
  }
  return `${(size / (1024 * 1024)).toLocaleString("th-TH", { maximumFractionDigits: 1 })} MB`;
}

function getMatchingBalance(
  item: EssLeaveRequest,
  balances: EssLeaveBalance[],
) {
  const requestYear =
    parseDateOnly(item.startDate ?? "")?.getFullYear() ??
    new Date().getFullYear();

  return (
    balances.find(
      (balance) =>
        balance.year === requestYear &&
        balance.leaveType?.id === item.leaveType?.id,
    ) ?? null
  );
}

// ─── ค่าเริ่มต้น ──────────────────────────────────────────────────────────────

const defaultFilters: LeaveFilterState = {
  year: currentYearText(),
  status: "",
  leaveTypeId: "",
  search: "",
};

const leaveStatusOptions = [
  { value: "", label: "ทุกสถานะ" },
  { value: "DRAFT", label: "ร่าง" },
  { value: "SUBMITTED", label: "รออนุมัติ" },
  { value: "APPROVED", label: "อนุมัติแล้ว" },
  { value: "REJECTED", label: "ไม่อนุมัติ" },
  { value: "CANCELLED", label: "ยกเลิกแล้ว" },
];

const defaultForm: LeaveFormState = {
  leaveTypeId: "",
  startDate: todayDate(),
  endDate: todayDate(),
  dayType: "FULL_DAY",
  startTime: "09:00",
  endTime: "10:00",
  reason: "",
  retroactiveReason: "",
  contactInfo: "",
  note: "",
  submit: true,
};

const DAY_TYPE_OPTIONS: Array<{ value: LeaveDayType; label: string }> = [
  { value: "FULL_DAY", label: "เต็มวัน" },
  { value: "HALF_DAY_MORNING", label: "ครึ่งวันเช้า" },
  { value: "HALF_DAY_AFTERNOON", label: "ครึ่งวันบ่าย" },
  { value: "HOURLY", label: "รายชั่วโมง" },
];

// ─── แผงหลัก ─────────────────────────────────────────────────────────────────

export function LeaveRequestPanel() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<EssLeaveBalance[]>([]);
  const [items, setItems] = useState<EssLeaveRequest[]>([]);
  const [form, setForm] = useState<LeaveFormState>(defaultForm);
  const [filterDraft, setFilterDraft] =
    useState<LeaveFilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<LeaveFilterState>(defaultFilters);
  const [editingItem, setEditingItem] = useState<EssLeaveRequest | null>(null);
  const [detailItem, setDetailItem] = useState<EssLeaveRequest | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState("");
  const [evidenceViewer, setEvidenceViewer] =
    useState<EvidencePreviewState | null>(null);
  const [previewingEvidenceId, setPreviewingEvidenceId] = useState<
    string | null
  >(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filterYear =
        Number(appliedFilters.year) || new Date().getFullYear();
      const [typesResponse, balancesResponse, requestsResponse] =
        await Promise.all([
          getEssLeaveTypes({ status: "ACTIVE" }),
          getEssLeaveBalances({ year: filterYear }),
          getEssLeaveRequests({
            page: 1,
            pageSize: 50,
            year: filterYear,
            status: appliedFilters.status || undefined,
            leaveTypeId: appliedFilters.leaveTypeId || undefined,
            search: appliedFilters.search.trim() || undefined,
          }),
        ]);

      setLeaveTypes(typesResponse ?? []);
      setBalances(balancesResponse ?? []);
      setItems(requestsResponse.items ?? []);
      setForm((current) => ({
        ...current,
        leaveTypeId: current.leaveTypeId || typesResponse?.[0]?.id || "",
      }));
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "ไม่สามารถโหลดข้อมูลใบลาได้";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (evidenceViewer?.objectUrl) {
        window.URL.revokeObjectURL(evidenceViewer.objectUrl);
      }
    };
  }, [evidenceViewer?.objectUrl]);

  function applyFilters() {
    setAppliedFilters({ ...filterDraft, search: filterDraft.search.trim() });
  }

  function resetFilters() {
    setFilterDraft(defaultFilters);
    setAppliedFilters(defaultFilters);
  }

  const selectedType = useMemo(
    () => leaveTypes.find((item) => item.id === form.leaveTypeId) ?? null,
    [leaveTypes, form.leaveTypeId],
  );

  const selectedBalance = useMemo(
    () => balances.find((item) => item.leaveType?.id === form.leaveTypeId),
    [balances, form.leaveTypeId],
  );

  const estimate = useMemo(() => buildEstimate(form), [form]);
  const isRetroactive = isRetroactiveDate(form.startDate);
  const hourlyAllowed = selectedType?.allowHourly ?? false;
  const halfDayAllowed = selectedType?.allowHalfDay ?? false;
  const backdatedAllowed = selectedType?.allowBackdated ?? false;
  const attachmentRequiredAfterDays = Number(
    selectedType?.attachmentRequiredAfterDays ?? 0,
  );
  const attachmentRequired = Boolean(
    selectedType?.requiresAttachment ||
    (isRetroactive && selectedType?.backdatedRequiresAttachment) ||
    (attachmentRequiredAfterDays > 0 &&
      estimate.totalDays >= attachmentRequiredAfterDays),
  );

  const returnedReviewInfo = getReturnedReviewInfo(editingItem);

  /** สิทธิ์ที่ใช้ได้จริง เรียงจากที่เหลือน้อยที่สุดเพื่อให้เห็นตัวที่ใกล้หมดก่อน */
  const usableBalances = useMemo(
    () =>
      [...balances]
        .filter((item) => Number(item.entitlementDays ?? 0) > 0)
        .sort(
          (a, b) => Number(a.remainingDays ?? 0) - Number(b.remainingDays ?? 0),
        ),
    [balances],
  );

  const totalRemaining = usableBalances.reduce(
    (sum, item) => sum + Number(item.remainingDays ?? 0),
    0,
  );
  const pendingCount = items.filter((item) =>
    ["DRAFT", "SUBMITTED"].includes(normalizeStatus(item.status)),
  ).length;

  function setDayType(dayType: LeaveDayType) {
    setForm((current) => ({
      ...current,
      dayType,
      endDate:
        dayType === "HOURLY" ||
        dayType === "HALF_DAY_MORNING" ||
        dayType === "HALF_DAY_AFTERNOON"
          ? current.startDate
          : current.endDate,
    }));
  }

  function clearEvidenceFile() {
    setEvidenceFile(null);
    setEvidencePreviewUrl((current) => {
      if (current?.startsWith("blob:")) window.URL.revokeObjectURL(current);
      return "";
    });
  }

  async function loadExistingEvidencePreview(item: EssLeaveRequest) {
    const attachment = item.attachments?.[0];
    if (!attachment) return;

    try {
      const preview = await previewEssLeaveAttachment(
        item.id,
        attachment.id,
        attachment.fileName || "leave-evidence",
      );
      setEvidencePreviewUrl((current) => {
        if (current?.startsWith("blob:")) window.URL.revokeObjectURL(current);
        return preview.objectUrl;
      });
    } catch {
      toast.warning("โหลดรูปหลักฐานเดิมไม่สำเร็จ แต่ยังแก้ไขข้อมูลใบลาได้");
    }
  }

  function handleEvidenceFileChange(file: File | null) {
    if (!file) {
      clearEvidenceFile();
      return;
    }

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("รองรับเฉพาะรูปภาพ JPG, JPEG และ PNG เท่านั้น");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("รูปหลักฐานต้องมีขนาดไม่เกิน 10 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setEvidenceFile(file);
      setEvidencePreviewUrl(
        typeof reader.result === "string" ? reader.result : "",
      );
      toast.success("แนบรูปหลักฐานเรียบร้อยแล้ว");
    };
    reader.onerror = () => toast.error("อ่านไฟล์รูปหลักฐานไม่สำเร็จ");
    reader.readAsDataURL(file);
  }

  function validateLeaveForm(shouldSubmit: boolean) {
    if (
      !form.leaveTypeId ||
      !form.startDate ||
      !form.endDate ||
      !form.reason.trim()
    ) {
      return "กรุณากรอกประเภทลา วันที่ และเหตุผลให้ครบถ้วน";
    }

    if (form.dayType === "HOURLY") {
      const start = minutesFromTime(form.startTime);
      const end = minutesFromTime(form.endTime);
      if (!hourlyAllowed) return "ประเภทลานี้ยังไม่อนุญาตให้ลารายชั่วโมง";
      if (form.startDate !== form.endDate) {
        return "ลารายชั่วโมงต้องเลือกวันที่เริ่มและสิ้นสุดเป็นวันเดียวกัน";
      }
      if (start === null || end === null || end <= start) {
        return "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ถูกต้อง";
      }
    }

    if (
      (form.dayType === "HALF_DAY_MORNING" ||
        form.dayType === "HALF_DAY_AFTERNOON") &&
      !halfDayAllowed
    ) {
      return "ประเภทลานี้ยังไม่อนุญาตให้ลาครึ่งวัน";
    }

    if (
      (form.dayType === "HALF_DAY_MORNING" ||
        form.dayType === "HALF_DAY_AFTERNOON") &&
      form.startDate !== form.endDate
    ) {
      return "ลาครึ่งวันต้องเลือกวันที่เริ่มและสิ้นสุดเป็นวันเดียวกัน";
    }

    if (isRetroactive) {
      if (!backdatedAllowed) return "ประเภทลานี้ยังไม่อนุญาตให้ลาย้อนหลัง";
      if (!form.retroactiveReason.trim() && shouldSubmit) {
        return "กรุณาระบุเหตุผลการลาย้อนหลัง";
      }
    }

    if (
      shouldSubmit &&
      attachmentRequired &&
      !evidenceFile &&
      !editingItem?.attachments?.length
    ) {
      return "กรุณาแนบรูปหลักฐานประกอบใบลา";
    }

    return "";
  }

  async function saveLeaveRequest(shouldSubmit: boolean) {
    const validationMessage = validateLeaveForm(shouldSubmit);
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    try {
      setSaving(true);
      const payload: CreateEssLeaveRequestForm = {
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        dayType: form.dayType,
        reason: form.reason.trim(),
        contactInfo: form.contactInfo.trim() || undefined,
        note: form.note.trim() || undefined,
        submit: shouldSubmit,
      };

      if (form.dayType === "HOURLY") {
        payload.startTime = form.startTime;
        payload.endTime = form.endTime;
      }

      if (isRetroactive) {
        payload.retroactiveReason = form.retroactiveReason.trim();
      }

      if (editingItem) {
        const updatePayload: Partial<CreateEssLeaveRequestForm> = {
          ...payload,
        };
        delete updatePayload.submit;
        await updateEssLeaveRequest(editingItem.id, updatePayload);

        if (evidenceFile) {
          await uploadEssLeaveAttachment(editingItem.id, {
            title: "หลักฐานประกอบใบลา",
            description: form.reason.trim(),
            file: evidenceFile,
          });
        }

        const returnedReview = isReturnedReviewDraft(editingItem);

        if (shouldSubmit && editingItem.status === "DRAFT") {
          await submitEssLeaveRequest(editingItem.id);
        }

        toast.success(
          returnedReview && shouldSubmit
            ? "ส่งใบลาที่แก้ไขแล้วกลับเข้าคิวอนุมัติเรียบร้อย"
            : "แก้ไขใบลาเรียบร้อยแล้ว",
        );
      } else {
        const createdRequest = await createEssLeaveRequest({
          ...payload,
          submit: false,
        });

        if (evidenceFile) {
          await uploadEssLeaveAttachment(createdRequest.id, {
            title: "หลักฐานประกอบใบลา",
            description: form.reason.trim(),
            file: evidenceFile,
          });
        }

        if (shouldSubmit) {
          await submitEssLeaveRequest(createdRequest.id);
        }

        toast.success(
          shouldSubmit ? "ส่งใบลาเรียบร้อยแล้ว" : "บันทึกร่างใบลาเรียบร้อยแล้ว",
        );
      }

      setForm((current) => ({
        ...defaultForm,
        leaveTypeId: current.leaveTypeId,
      }));
      setEditingItem(null);
      clearEvidenceFile();
      setCreateOpen(false);
      await loadData();
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "บันทึกใบลาไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviewEvidence(
    requestId: string,
    attachment: EssAttachment,
  ) {
    try {
      setPreviewingEvidenceId(attachment.id);
      const preview = await previewEssLeaveAttachment(
        requestId,
        attachment.id,
        attachment.fileName || "leave-evidence",
      );

      setEvidenceViewer({
        requestId,
        attachment,
        objectUrl: preview.objectUrl,
        fileName: preview.fileName,
        contentType: preview.contentType,
      });
    } catch (previewError) {
      toast.error(
        previewError instanceof Error
          ? previewError.message
          : "เปิดรูปหลักฐานไม่สำเร็จ",
      );
    } finally {
      setPreviewingEvidenceId(null);
    }
  }

  async function handleDownloadEvidence(
    requestId: string,
    attachment: EssAttachment,
  ) {
    try {
      await downloadEssLeaveAttachment(
        requestId,
        attachment.id,
        attachment.fileName || "leave-evidence",
      );
    } catch (downloadError) {
      toast.error(
        downloadError instanceof Error
          ? downloadError.message
          : "ดาวน์โหลดหลักฐานไม่สำเร็จ",
      );
    }
  }

  function openCreateForm() {
    setEditingItem(null);
    setForm((current) => ({
      ...defaultForm,
      leaveTypeId: current.leaveTypeId || leaveTypes[0]?.id || "",
    }));
    clearEvidenceFile();
    setCreateOpen(true);
  }

  function openEditForm(item: EssLeaveRequest) {
    if (!isRequestEditable(item.status)) {
      toast.error(
        isRequestSubmitted(item.status)
          ? "ต้องยกเลิกการส่งคำขอก่อนจึงจะแก้ไขใบลาได้"
          : "รายการสถานะนี้ไม่สามารถแก้ไขได้",
      );
      return;
    }

    setEditingItem(item);
    setForm({
      leaveTypeId: item.leaveType?.id ?? leaveTypes[0]?.id ?? "",
      startDate: normalizeDateInput(item.startDate) || todayDate(),
      endDate:
        normalizeDateInput(item.endDate) ||
        normalizeDateInput(item.startDate) ||
        todayDate(),
      dayType: (item.dayType as LeaveDayType) || "FULL_DAY",
      startTime: normalizeShortTime(item.startTime) || "09:00",
      endTime: normalizeShortTime(item.endTime) || "10:00",
      reason: item.reason ?? "",
      retroactiveReason: item.retroactiveReason ?? "",
      contactInfo: item.contactInfo ?? "",
      note: item.note ?? "",
      submit: item.status === "DRAFT",
    });
    clearEvidenceFile();
    setCreateOpen(true);
    void loadExistingEvidencePreview(item);
  }

  function handleDeleteRequest(item: EssLeaveRequest) {
    if (!isRequestEditable(item.status)) {
      toast.error(
        isRequestSubmitted(item.status)
          ? "ต้องยกเลิกการส่งคำขอก่อนจึงจะลบใบลาได้"
          : "รายการสถานะนี้ไม่สามารถลบได้",
      );
      return;
    }

    setActionDialog({
      title: "ลบรายการใบลา",
      description:
        "ต้องการลบรายการใบลานี้ออกจากประวัติหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบรายการ",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        try {
          setDeletingId(item.id);
          await deleteEssLeaveRequest(item.id);
          if (editingItem?.id === item.id) setEditingItem(null);
          if (detailItem?.id === item.id) setDetailItem(null);
          toast.success("ลบรายการใบลาเรียบร้อยแล้ว");
          await loadData();
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  function handleCancelSubmission(item: EssLeaveRequest) {
    if (!isRequestSubmitted(item.status)) {
      toast.error("ยกเลิกการส่งได้เฉพาะใบลาที่รออนุมัติเท่านั้น");
      return;
    }

    setActionDialog({
      title: "ยกเลิกการส่งใบลา",
      description:
        "ระบบจะถอนใบลานี้ออกจากคิวอนุมัติและกลับเป็นร่าง เพื่อให้คุณแก้ไขข้อมูลหรือส่งคำขอใหม่อีกครั้ง",
      confirmLabel: "ยืนยันยกเลิกการส่ง",
      cancelLabel: "กลับไป",
      tone: "orange",
      onConfirm: async () => {
        try {
          setCancelingId(item.id);
          await cancelEssLeaveRequest(item.id, {
            reason: "ผู้ยื่นยกเลิกการส่งเพื่อกลับไปแก้ไขหรือลบคำขอ",
          });
          if (detailItem?.id === item.id) setDetailItem(null);
          toast.success(
            "ยกเลิกการส่งใบลาแล้ว รายการกลับเป็นร่างเพื่อแก้ไขและส่งใหม่",
          );
          await loadData();
        } finally {
          setCancelingId(null);
        }
      },
    });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveLeaveRequest(true);
  }

  const isUnlinkedAccount = Boolean(
    error?.includes("ยังไม่ได้ผูกกับข้อมูลพนักงาน"),
  );

  const columns: Array<Column<EssLeaveRequest>> = [
    {
      key: "date",
      header: "วันที่ / ประเภท",
      width: "w-[15rem]",
      cell: (item) => {
        const range =
          item.endDate && item.endDate !== item.startDate
            ? `${date(item.startDate)} – ${date(item.endDate)}`
            : date(item.startDate);

        return (
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 3xl:text-[13.5px]">
              {range}
            </p>
            <p className="truncate text-[12px] text-slate-400">
              {item.leaveType?.nameTh ?? "ใบลา"}
              {item.requestNo ? ` · ${item.requestNo}` : ""}
            </p>
            {item.isRetroactive ? (
              <p className="text-[11.5px] text-amber-600">ลาย้อนหลัง</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "duration",
      header: "ระยะเวลา",
      width: "w-[11rem]",
      cell: (item) => (
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tabular-nums text-slate-700">
            {formatLeaveDuration(item)}
          </p>
          <p className="text-[12px] text-slate-400">
            {formatDayType(item.dayType)}
            {item.dayType === "HOURLY"
              ? ` · ${normalizeShortTime(item.startTime) || "--:--"}–${normalizeShortTime(item.endTime) || "--:--"}`
              : ""}
          </p>
        </div>
      ),
    },
    {
      key: "reason",
      header: "เหตุผล",
      cell: (item) => {
        const returned = getReturnedReviewInfo(item);
        const returnedDraft = isReturnedReviewDraft(item);

        return (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-slate-600">
              {item.reason || "-"}
            </p>
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
      cell: (item) => {
        const attachments = item.attachments ?? [];
        if (attachments.length === 0) {
          return <span className="text-[13px] text-slate-300">ไม่มี</span>;
        }

        const [first] = attachments;

        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handlePreviewEvidence(item.id, first);
            }}
            disabled={previewingEvidenceId === first.id}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-60"
          >
            {previewingEvidenceId === first.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            {attachments.length > 1 ? `${attachments.length} ไฟล์` : "ดูรูป"}
          </button>
        );
      },
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-[12rem]",
      cell: (item) => {
        const returnedDraft = isReturnedReviewDraft(item);

        return (
          <div className="min-w-0">
            {returnedDraft ? (
              <Badge tone="warning">ตรวจสอบใหม่</Badge>
            ) : (
              <StatusBadge
                vocabulary={ESS_REQUEST_STATUS}
                status={item.status}
              />
            )}
            <p className="mt-0.5 truncate text-[11.5px] text-slate-400">
              {returnedDraft
                ? "รอแก้ไขและส่งใหม่"
                : isResubmittedAfterReturnedReview(item)
                  ? "ส่งใหม่จากการตรวจสอบ"
                  : dateTime(item.submittedAt ?? item.createdAt)}
            </p>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      width: "w-[6rem]",
      cell: (item) => {
        const returnedDraft = isReturnedReviewDraft(item);
        const editable = isRequestEditable(item.status);
        const submitted = isRequestSubmitted(item.status);

        const menuItems: RowMenuItem[] = [
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
            onSelect: () => handleCancelSubmission(item),
            disabled: !submitted || cancelingId === item.id,
          },
          {
            label: "ลบรายการ",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            tone: "danger",
            onSelect: () => handleDeleteRequest(item),
            disabled: !editable || deletingId === item.id,
          },
        ];

        return <RowMenu items={menuItems} />;
      },
    },
  ];

  return (
    <>
      {/* ---------------- สิทธิ์การลาปีนี้ ---------------- */}
      <section className="border-b border-slate-200 px-5 py-4 3xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL_CLASS}>สิทธิ์การลาปี {appliedFilters.year}</p>
            <p className="mt-1 text-[13px] text-slate-500">
              ยอดคงเหลือคำนวณจากสิทธิ์ที่ได้รับ ยกมา และปรับปรุง
              หักด้วยที่ใช้ไปและที่รออนุมัติ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadData()}
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
              onClick={openCreateForm}
              icon={<PlusCircle className="h-3.5 w-3.5" />}
            >
              ยื่นใบลา
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-4 sm:divide-y-0">
          <StatTile
            label="วันลาคงเหลือรวม"
            value={`${num(totalRemaining)} วัน`}
            helper={`${usableBalances.length} ประเภทที่ใช้ได้`}
          />
          <StatTile
            label="ใบลาในปีนี้"
            value={items.length.toLocaleString("th-TH")}
            helper="ตามตัวกรองด้านล่าง"
          />
          <StatTile
            label="รออนุมัติ"
            value={pendingCount.toLocaleString("th-TH")}
            tone={pendingCount > 0 ? "warning" : "positive"}
            helper={pendingCount > 0 ? "ยังไม่ได้ผล" : "ไม่มีค้างอยู่"}
          />
          <StatTile
            label="ประเภทที่ยื่นได้"
            value={leaveTypes.length.toLocaleString("th-TH")}
            helper="ตามที่ HR เปิดใช้งาน"
          />
        </div>

        {usableBalances.length > 0 ? (
          /*
            ยอดคงเหลือเป็นข้อมูลอ้างอิงข้างฟอร์ม ไม่ใช่เนื้อหาหลักของแท็บ
            จึงบีบเป็นกริดหลายคอลัมน์บรรทัดละประเภท — แปดประเภทจบใน 2-3 บรรทัด
            (เดิมเป็นแถวเต็มความกว้างพร้อมแถบสัดส่วน กินความสูงเกือบเต็มจอ)
          */
          <div className="mt-3 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
            {usableBalances.map((balance) => {
              const entitlement =
                Number(balance.entitlementDays ?? 0) +
                Number(balance.carriedForwardDays ?? 0) +
                Number(balance.adjustedDays ?? 0);
              const remaining = Number(balance.remainingDays ?? 0);
              const pending = Number(balance.pendingDays ?? 0);
              const runningOut =
                entitlement > 0 && remaining / entitlement <= 0.2;

              return (
                <div
                  key={balance.id}
                  className="flex items-center gap-2 border-b border-slate-100 py-1.5"
                  title={`คงเหลือ ${num(remaining)} จาก ${num(entitlement)} วัน · ใช้แล้ว ${num(balance.usedDays)} · รออนุมัติ ${num(pending)}`}
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600 3xl:text-[13px]">
                    {balance.leaveType?.nameTh ?? "ประเภทลา"}
                  </span>

                  {/* รออนุมัติขึ้นเฉพาะตอนมีจริง ไม่งั้นทุกแถวจะมีเลขศูนย์ห้อยอยู่ */}
                  {pending > 0 ? (
                    <span className="shrink-0 text-[11px] font-semibold text-amber-600">
                      รอ {num(pending)}
                    </span>
                  ) : null}

                  <span className="shrink-0 text-right text-[12.5px] tabular-nums 3xl:text-[13px]">
                    <span
                      className={joinClassName(
                        "font-bold",
                        runningOut ? "text-amber-600" : "text-brand-700",
                      )}
                    >
                      {num(remaining)}
                    </span>
                    <span className="text-slate-300">/{num(entitlement)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
            ยังไม่มีสิทธิ์การลาของปีนี้ในระบบ — HR
            ต้องสร้างโควตาการลาประจำปีให้ก่อน จึงจะเห็นยอดคงเหลือ
          </Notice>
        )}
      </section>

      {/* ---------------- ตัวกรอง ---------------- */}
      <section className="border-b border-slate-200 px-5 py-3 3xl:px-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Field label="ปี" className="w-full sm:w-28">
            <TextInput
              value={filterDraft.year}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  year: event.target.value,
                }))
              }
              inputMode="numeric"
            />
          </Field>

          <Field label="สถานะ" className="w-full sm:w-40">
            <Select
              value={filterDraft.status}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              {leaveStatusOptions.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ประเภทลา" className="w-full sm:w-52">
            <Select
              value={filterDraft.leaveTypeId}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  leaveTypeId: event.target.value,
                }))
              }
            >
              <option value="">ทุกประเภทลา</option>
              {leaveTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nameTh}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ค้นหา" className="w-full sm:w-72">
            <SearchInput
              value={filterDraft.search}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="เลขที่ใบลา เหตุผล หรือหมายเหตุ"
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

      {/* ---------------- ประวัติใบลา ---------------- */}
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={loading}
        error={
          isUnlinkedAccount
            ? "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงยังยื่นใบลาไม่ได้ — ผูกบัญชีกับพนักงานได้ที่หน้า ผู้ใช้และสิทธิ์"
            : error
        }
        onRetry={() => void loadData()}
        onRowClick={(item) => setDetailItem(item)}
        emptyTitle="ยังไม่มีประวัติใบลา"
        emptyDescription="เมื่อยื่นใบลาแล้ว รายการจะแสดงที่นี่"
        emptyAction={
          <Button
            variant="primary"
            onClick={openCreateForm}
            icon={<PlusCircle className="h-3.5 w-3.5" />}
          >
            ยื่นใบลา
          </Button>
        }
        minWidth="min-w-[62rem]"
      />

      {/* ---------------- ฟอร์มใบลา ---------------- */}
      <Modal
        open={createOpen}
        size="lg"
        title={
          returnedReviewInfo
            ? "แก้ไขใบลาที่ถูกส่งกลับ"
            : editingItem
              ? "แก้ไขใบลา"
              : "ยื่นใบลาใหม่"
        }
        description={
          returnedReviewInfo
            ? "แก้ไขตามเหตุผลที่ผู้อนุมัติส่งกลับ แล้วส่งเข้าคิวอนุมัติใหม่"
            : "กรอกประเภทลา วันที่ รูปแบบการลา และเหตุผลสำหรับส่งอนุมัติ"
        }
        onClose={() => {
          setCreateOpen(false);
          setEditingItem(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setEditingItem(null);
              }}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button
              variant="secondary"
              onClick={() => void saveLeaveRequest(false)}
              disabled={saving}
            >
              {returnedReviewInfo ? "บันทึกการแก้ไข" : "บันทึกเป็นร่าง"}
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="ess-leave-form"
              loading={saving}
              icon={<Send className="h-3.5 w-3.5" />}
            >
              {returnedReviewInfo ? "ส่งใบลาใหม่" : "ส่งใบลา"}
            </Button>
          </>
        }
      >
        <form id="ess-leave-form" onSubmit={submitForm} className="space-y-4">
          {returnedReviewInfo ? (
            <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
              <p className="font-semibold">ใบลานี้ถูกส่งกลับให้ตรวจสอบใหม่</p>
              <p className="mt-0.5">เหตุผล: {returnedReviewInfo.reason}</p>
              {returnedReviewInfo.returnedAt ? (
                <p className="mt-0.5 text-[12.5px]">
                  ส่งกลับเมื่อ {dateTime(returnedReviewInfo.returnedAt)}
                </p>
              ) : null}
            </Notice>
          ) : null}

          <Section title="ประเภทและรูปแบบการลา">
            <FieldGrid columns={2}>
              <Field label="ประเภทลา" required className="sm:col-span-2">
                <Select
                  value={form.leaveTypeId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      leaveTypeId: event.target.value,
                    }))
                  }
                >
                  <option value="">เลือกประเภทลา</option>
                  {leaveTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameTh}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="รูปแบบการลา"
                hint="ตัวเลือกที่ปิดอยู่คือรูปแบบที่ประเภทลานี้ยังไม่อนุญาต"
                className="sm:col-span-2"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {DAY_TYPE_OPTIONS.map((option) => {
                    const disabled =
                      (option.value === "HOURLY" && !hourlyAllowed) ||
                      ((option.value === "HALF_DAY_MORNING" ||
                        option.value === "HALF_DAY_AFTERNOON") &&
                        !halfDayAllowed);
                    const active = form.dayType === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => setDayType(option.value)}
                        className={joinClassName(
                          "h-9 rounded-lg border text-[13px] font-semibold transition 3xl:h-10",
                          active
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                          disabled &&
                            "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 hover:bg-slate-50",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </FieldGrid>
          </Section>

          <Section title="วันที่และช่วงเวลา">
            <FieldGrid columns={2}>
              <Field label="วันที่เริ่มลา" required>
                <ThaiDateInput
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                      endDate:
                        current.dayType === "HOURLY" ||
                        current.dayType === "HALF_DAY_MORNING" ||
                        current.dayType === "HALF_DAY_AFTERNOON"
                          ? event.target.value
                          : current.endDate,
                    }))
                  }
                  className="mt-0"
                />
              </Field>

              <Field label="วันที่สิ้นสุดลา" required>
                <ThaiDateInput
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                  className="mt-0"
                  disabled={
                    form.dayType === "HOURLY" ||
                    form.dayType === "HALF_DAY_MORNING" ||
                    form.dayType === "HALF_DAY_AFTERNOON"
                  }
                />
              </Field>

              {form.dayType === "HOURLY" ? (
                <>
                  <Field label="เวลาเริ่มลา" required>
                    <TextInput
                      type="time"
                      value={form.startTime}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          startTime: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="เวลาสิ้นสุดลา" required>
                    <TextInput
                      type="time"
                      value={form.endTime}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          endTime: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </>
              ) : null}
            </FieldGrid>

            {isRetroactive ? (
              <div className="mt-3 space-y-2">
                <Notice
                  tone={backdatedAllowed ? "warning" : "critical"}
                  icon={<AlertTriangle className="h-4 w-4" />}
                >
                  {backdatedAllowed
                    ? `คำขอนี้เป็นการลาย้อนหลัง ประเภทลานี้อนุญาตได้${
                        selectedType?.maxBackdatedDays
                          ? ` ไม่เกิน ${selectedType.maxBackdatedDays} วัน`
                          : "ตาม policy"
                      }`
                    : "ประเภทลานี้ยังไม่เปิดให้ลาย้อนหลัง กรุณาติดต่อ HR"}
                </Notice>

                <Field label="เหตุผลการลาย้อนหลัง" required>
                  <Textarea
                    rows={2}
                    value={form.retroactiveReason}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        retroactiveReason: event.target.value,
                      }))
                    }
                    placeholder="เช่น มีเหตุจำเป็นกะทันหัน หรือเอกสารล่าช้า"
                  />
                </Field>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
              <div className="px-4 py-3">
                <p className={LABEL_CLASS}>ประมาณการวันลา</p>
                <p className="mt-0.5 text-[17px] font-bold tabular-nums text-brand-700 3xl:text-[19px]">
                  {estimate.label}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  {estimate.helper}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className={LABEL_CLASS}>สิทธิ์คงเหลือของประเภทนี้</p>
                <p className="mt-0.5 text-[17px] font-bold tabular-nums text-slate-900 3xl:text-[19px]">
                  {selectedBalance
                    ? `${num(selectedBalance.remainingDays)} วัน`
                    : "ยังไม่มีข้อมูล"}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  {selectedBalance
                    ? `ใช้แล้ว ${num(selectedBalance.usedDays)} วัน · รออนุมัติ ${num(selectedBalance.pendingDays)} วัน`
                    : "HR ยังไม่ได้สร้างสิทธิ์ลาประเภทนี้"}
                </p>
              </div>
            </div>
          </Section>

          <Section title="รายละเอียดคำขอ">
            <FieldGrid columns={1}>
              <Field label="เหตุผล" required>
                <Textarea
                  rows={2}
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="ระบุเหตุผลในการลา"
                />
              </Field>

              <Field label="ข้อมูลติดต่อระหว่างลา">
                <TextInput
                  value={form.contactInfo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      contactInfo: event.target.value,
                    }))
                  }
                  placeholder="เบอร์โทรศัพท์หรือช่องทางติดต่อ"
                />
              </Field>

              <Field label="หมายเหตุ">
                <Textarea
                  rows={2}
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="หมายเหตุเพิ่มเติม ถ้ามี"
                />
              </Field>
            </FieldGrid>
          </Section>

          <Section
            title="หลักฐานประกอบใบลา"
            description={
              attachmentRequired
                ? "ใบลานี้ต้องแนบหลักฐานก่อนส่งอนุมัติ (JPG, JPEG, PNG ไม่เกิน 10 MB)"
                : "แนบได้ถ้ามี เช่น ใบรับรองแพทย์ (JPG, JPEG, PNG ไม่เกิน 10 MB)"
            }
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-brand-700">
                  <Upload className="h-4 w-4" />
                  เลือกรูปหลักฐาน
                  {attachmentRequired ? (
                    <span className="text-rose-500">*</span>
                  ) : null}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(event) =>
                      handleEvidenceFileChange(event.target.files?.[0] ?? null)
                    }
                  />
                </label>

                {evidenceFile ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="min-w-0 truncate text-[12.5px] text-slate-600">
                      {evidenceFile.name}
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={clearEvidenceFile}
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                    >
                      ลบ
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-[12.5px] text-slate-400">
                    ยังไม่ได้เลือกไฟล์
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                {evidencePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={evidencePreviewUrl}
                    alt="ตัวอย่างรูปหลักฐานใบลา"
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-1 text-slate-300">
                    <ImageIcon className="h-6 w-6" />
                    <p className="text-[12px]">ยังไม่มีรูป</p>
                  </div>
                )}
              </div>
            </div>
          </Section>
        </form>
      </Modal>

      {/* ---------------- รายละเอียดใบลา ---------------- */}
      <LeaveDetailModal
        item={detailItem}
        balances={balances}
        previewingEvidenceId={previewingEvidenceId}
        onPreviewEvidence={handlePreviewEvidence}
        onClose={() => setDetailItem(null)}
      />

      {/* ---------------- ดูรูปหลักฐาน ---------------- */}
      <Modal
        open={Boolean(evidenceViewer)}
        size="lg"
        title="หลักฐานประกอบใบลา"
        description={evidenceViewer?.fileName}
        onClose={() => setEvidenceViewer(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEvidenceViewer(null)}>
              ปิด
            </Button>
            <Button
              variant="primary"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => {
                if (!evidenceViewer) return;
                void handleDownloadEvidence(
                  evidenceViewer.requestId,
                  evidenceViewer.attachment,
                );
              }}
            >
              ดาวน์โหลด
            </Button>
          </>
        }
      >
        {evidenceViewer ? (
          evidenceViewer.contentType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={evidenceViewer.objectUrl}
              alt={evidenceViewer.fileName}
              className="max-h-[60vh] w-full rounded-lg object-contain"
            />
          ) : (
            <p className="py-10 text-center text-[13px] text-slate-400">
              ไฟล์นี้เปิดดูในหน้าเว็บไม่ได้ กดดาวน์โหลดเพื่อเปิดด้วยโปรแกรมอื่น
            </p>
          )
        ) : null}
      </Modal>

      <ActionDialog
        state={actionDialog}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}

// ─── รายละเอียดใบลา ───────────────────────────────────────────────────────────

function LeaveDetailModal({
  item,
  balances,
  previewingEvidenceId,
  onPreviewEvidence,
  onClose,
}: {
  item: EssLeaveRequest | null;
  balances: EssLeaveBalance[];
  previewingEvidenceId: string | null;
  onPreviewEvidence: (requestId: string, attachment: EssAttachment) => void;
  onClose: () => void;
}) {
  if (!item) {
    return (
      <Modal open={false} title="" onClose={onClose}>
        {null}
      </Modal>
    );
  }

  const attachments = item.attachments ?? [];
  const approvalSteps = [...(item.approvalSteps ?? [])].sort(
    (a, b) => a.stepNo - b.stepNo,
  );
  const approvalLogs = sortApprovalLogs(item.approvalLogs ?? []);
  const isHourly = item.dayType === "HOURLY";
  const dateRange =
    item.endDate && item.endDate !== item.startDate
      ? `${date(item.startDate)} – ${date(item.endDate)}`
      : date(item.startDate);
  const returned = getReturnedReviewInfo(item);
  const approvalInfo = getApprovalDisplayInfo(item);
  const matchingBalance = getMatchingBalance(item, balances);

  return (
    <Modal
      open
      size="lg"
      title={`รายละเอียดใบลา${item.requestNo ? ` ${item.requestNo}` : ""}`}
      description={`${item.leaveType?.nameTh ?? "ใบลา"} · ${dateRange}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge vocabulary={ESS_REQUEST_STATUS} status={item.status} />
          <span className="text-[13px] text-slate-400">
            {approvalInfo.step} · {approvalInfo.approver}
          </span>
        </div>

        <Section title="ข้อมูลการลา">
          <FieldGrid columns={3}>
            <DetailItem label="ระยะเวลา" value={formatLeaveDuration(item)} />
            <DetailItem label="รูปแบบ" value={formatDayType(item.dayType)} />
            <DetailItem
              label="ช่วงเวลา"
              value={
                isHourly
                  ? `${normalizeShortTime(item.startTime) || "--:--"}–${normalizeShortTime(item.endTime) || "--:--"}`
                  : "ทั้งวันตามรูปแบบ"
              }
            />
            <DetailItem
              label="ลาย้อนหลัง"
              value={item.isRetroactive ? "ใช่" : "ไม่ใช่"}
            />
            <DetailItem
              label="ค่าจ้าง"
              value={booleanText(
                item.leaveType?.isPaid,
                "ได้รับค่าจ้าง",
                "ไม่จ่ายค่าจ้าง",
              )}
            />
            <DetailItem label="ผลต่อสิทธิ์" value={getQuotaImpactText(item)} />
          </FieldGrid>
        </Section>

        <Section title="สิทธิ์คงเหลือของประเภทลานี้">
          <FieldGrid columns={3}>
            <DetailItem
              label="คงเหลือ"
              value={
                matchingBalance
                  ? `${num(matchingBalance.remainingDays)} วัน`
                  : "ยังไม่มีข้อมูลสิทธิ์ปีนี้"
              }
            />
            <DetailItem
              label="ใช้แล้ว"
              value={
                matchingBalance ? `${num(matchingBalance.usedDays)} วัน` : "-"
              }
            />
            <DetailItem
              label="รออนุมัติ"
              value={
                matchingBalance
                  ? `${num(matchingBalance.pendingDays)} วัน`
                  : "-"
              }
            />
          </FieldGrid>
        </Section>

        <Section title="เหตุผลและรายละเอียด">
          <div className="space-y-2">
            <DetailText label="เหตุผล" value={item.reason} />
            {item.contactInfo ? (
              <DetailText label="ข้อมูลติดต่อ" value={item.contactInfo} />
            ) : null}
            {item.note ? (
              <DetailText label="หมายเหตุ" value={item.note} />
            ) : null}
            {item.retroactiveReason ? (
              <DetailText
                label="เหตุผลลาย้อนหลัง"
                value={item.retroactiveReason}
              />
            ) : null}
            {returned ? (
              <Notice
                tone="warning"
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                <p className="font-semibold">เหตุผลที่ส่งกลับให้ตรวจสอบใหม่</p>
                <p className="mt-0.5">{returned.reason}</p>
                {returned.note ? (
                  <p className="mt-0.5">หมายเหตุ: {returned.note}</p>
                ) : null}
              </Notice>
            ) : null}
          </div>
        </Section>

        <Section
          title="หลักฐานแนบ"
          description={
            attachments.length === 0 && requiresAttachmentForRequest(item)
              ? "ใบลานี้ควรมีหลักฐานแนบ แต่ยังไม่พบไฟล์"
              : undefined
          }
        >
          {attachments.length > 0 ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {attachments.map((attachment, index) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => onPreviewEvidence(item.id, attachment)}
                  disabled={previewingEvidenceId === attachment.id}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-slate-700">
                        {attachment.title ||
                          attachment.fileName ||
                          `หลักฐาน ${index + 1}`}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-400">
                        {attachment.mimeType || "ไฟล์แนบ"} ·{" "}
                        {getFileSizeText(attachment.fileSize)}
                      </span>
                    </span>
                  </span>
                  {previewingEvidenceId === attachment.id ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-slate-400">
              ไม่มีหลักฐานแนบในใบลานี้
            </p>
          )}
        </Section>

        <Section title="ขั้นตอนอนุมัติ">
          {approvalSteps.length > 0 ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {approvalSteps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-700">
                      {step.stepNo}. {getStepDisplayName(step)}
                    </p>
                    <p className="truncate text-[12px] text-slate-400">
                      {getApprovalPersonName(step)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12.5px] text-slate-500">
                    {getApprovalStepStatusLabel(step.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-slate-400">
              ยังไม่มีขั้นตอนอนุมัติ หรือรายการนี้ยังเป็นร่าง
            </p>
          )}
        </Section>

        <Section title="ประวัติการดำเนินการ">
          <FieldGrid columns={3}>
            <DetailItem label="สร้างคำขอ" value={dateTime(item.createdAt)} />
            <DetailItem label="ยื่นคำขอ" value={dateTime(item.submittedAt)} />
            <DetailItem label="อนุมัติ" value={dateTime(item.approvedAt)} />
          </FieldGrid>

          {approvalLogs.length > 0 ? (
            <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {approvalLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-semibold text-slate-700">
                      {approvalActionText(log.action)}
                      <span className="ml-1 font-normal text-slate-400">
                        โดย {getUserDisplayName(log.approvedBy)}
                      </span>
                    </p>
                    <span className="shrink-0 text-[12px] text-slate-400">
                      {dateTime(log.createdAt)}
                    </span>
                  </div>
                  {log.reason || log.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-slate-500">
                      {log.reason || log.note}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </Section>
      </div>
    </Modal>
  );
}

function DetailText({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}): ReactNode {
  return (
    <div className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <p className={LABEL_CLASS}>{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">
        {value?.trim() || "-"}
      </p>
    </div>
  );
}
