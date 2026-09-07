"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  cancelEssOvertimeRequest,
  createEssOvertimeRequest,
  deleteEssOvertimeRequest,
  downloadEssOvertimeAttachment,
  getEssOvertimeDayType,
  getEssOvertimeRequests,
  previewEssOvertimeAttachment,
  submitEssOvertimeRequest,
  updateEssOvertimeRequest,
  uploadEssOvertimeAttachment,
} from "@/lib/api";
import { formatThaiDate, formatThaiDateTime } from "@/lib/date-format";
import { ESS_REQUEST_STATUS } from "@/lib/status-labels";
import type {
  CreateEssOvertimeRequestForm,
  EssAttachment,
  EssOvertimeApprovalLog,
  EssOvertimeApprovalStep,
  EssOvertimeDayType,
  EssOvertimeRequest,
  EssOvertimeRequestSummary,
  EssOvertimeWorkType,
} from "@/types/ess";

/**
 * ทำงานล่วงเวลา (OT)
 * -------------------
 * ยื่นคำขอ OT และติดตามสถานะ — ตรรกะเดิมทั้งหมด (คิดชั่วโมงสุทธิหลังหักพัก
 * ประเภทวันทำงาน/วันหยุด หลักฐานแนบ และการส่งกลับให้แก้ไข) เปลี่ยนแค่เปลือก
 */

// ─── ชนิดข้อมูล ───────────────────────────────────────────────────────────────

type OvertimeFormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  reason: string;
  note: string;
  submit: boolean;
};

type OvertimeFilterState = {
  year: string;
  status: string;
  workType: string;
  search: string;
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

const LABEL_CLASS =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500";

const emptyOvertimeSummary: EssOvertimeRequestSummary = {
  total: 0,
  draft: 0,
  submitted: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
  totalHours: 0,
  approvedHours: 0,
};

const overtimeStatusOptions = [
  { value: "", label: "ทุกสถานะ" },
  { value: "DRAFT", label: "ร่าง" },
  { value: "SUBMITTED", label: "รออนุมัติ" },
  { value: "APPROVED", label: "อนุมัติแล้ว" },
  { value: "REJECTED", label: "ไม่อนุมัติ" },
  { value: "CANCELLED", label: "ยกเลิก" },
];

/*
 * ประเภทวันไม่ใช่ช่องให้เลือกอีกแล้ว
 *
 * ระบบอ่านจากปฏิทินวันหยุดของหน้า /settings/work-policies เอง ชุดนี้เหลือไว้
 * สำหรับตัวกรองรายการและแปลงรหัสเป็นคำไทยเวลาแสดงผลเท่านั้น
 */
const workTypeOptions: Array<{
  value: EssOvertimeWorkType;
  label: string;
  helper: string;
}> = [
  {
    value: "WORKDAY",
    label: "วันทำงาน",
    helper: "ทำงานล่วงเวลาหลังเวลาเลิกงานปกติ",
  },
  {
    value: "HOLIDAY",
    label: "วันหยุด",
    helper: "ทำงานในวันหยุดประจำสัปดาห์หรือวันหยุดบริษัท",
  },
  {
    value: "SPECIAL_HOLIDAY",
    label: "วันหยุดพิเศษ",
    helper: "วันหยุดนักขัตฤกษ์หรือวันหยุดพิเศษตามประกาศบริษัท",
  },
];

/** ช่วงเวลาที่พนักงานเลือกบ่อย กดแล้วเติมเวลาให้ทันที */
const timePresets = [
  {
    label: "หลังเลิกงาน 1 ชม.",
    startTime: "17:00",
    endTime: "18:00",
    breakMinutes: "0",
  },
  {
    label: "หลังเลิกงาน 2 ชม.",
    startTime: "17:00",
    endTime: "19:00",
    breakMinutes: "0",
  },
  { label: "กะเย็น", startTime: "18:00", endTime: "20:00", breakMinutes: "0" },
  {
    label: "วันหยุดเต็มวัน",
    startTime: "08:00",
    endTime: "17:00",
    breakMinutes: "60",
  },
];

// ─── ตัวช่วย ──────────────────────────────────────────────────────────────────

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
  return new Date().toISOString().slice(0, 10);
}

function defaultOvertimeFilters(): OvertimeFilterState {
  return { year: currentYearText(), status: "", workType: "", search: "" };
}

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

function normalizeShortTime(value?: string | null) {
  if (!value) return "";
  const text = String(value);
  const match = /(\d{2}:\d{2})/.exec(text);
  return match?.[1] ?? text.slice(0, 5);
}

/** รับได้ทั้ง ISO, ค.ศ. และวันที่ไทย dd/mm/yyyy ที่ ThaiDateInput ส่งมา */
function normalizeIsoDate(value: string) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const isoDateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (isoDateMatch) return isoDateMatch[1];

  const thaiDisplayMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (thaiDisplayMatch) {
    const day = thaiDisplayMatch[1].padStart(2, "0");
    const month = thaiDisplayMatch[2].padStart(2, "0");
    const rawYear = Number(thaiDisplayMatch[3]);
    const christianYear = rawYear >= 2400 ? rawYear - 543 : rawYear;
    return `${christianYear}-${month}-${day}`;
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return text;
}

function buildApiDateTime(workDate: string, time: string) {
  const isoDate = normalizeIsoDate(workDate);
  const [hour = "00", minute = "00"] = String(time ?? "").split(":");
  return `${isoDate}T${normalizeTimePart(hour, "00", 23)}:${normalizeTimePart(minute, "00", 59)}:00.000+07:00`;
}

function minutesFromTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function durationMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: string | number = 0,
) {
  const rawMinutes = Math.max(
    0,
    minutesFromTime(endTime) - minutesFromTime(startTime),
  );
  const breakValue = Number(breakMinutes || 0);
  return Math.max(
    0,
    rawMinutes - (Number.isFinite(breakValue) ? breakValue : 0),
  );
}

function durationText(
  startTime: string,
  endTime: string,
  breakMinutes: string | number = 0,
) {
  const total = durationMinutes(startTime, endTime, breakMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours && minutes) return `${num(hours)} ชม. ${num(minutes)} นาที`;
  if (hours) return `${num(hours)} ชม.`;
  return `${num(minutes)} นาที`;
}

function workTypeLabel(value?: string | null) {
  return (
    workTypeOptions.find((option) => option.value === value)?.label ??
    value ??
    "-"
  );
}

function getFileSizeText(size?: number | null) {
  if (!size || size <= 0) return "ไม่ระบุขนาด";
  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB`;
  }
  return `${(size / (1024 * 1024)).toLocaleString("th-TH", { maximumFractionDigits: 1 })} MB`;
}

// ─── สถานะ ────────────────────────────────────────────────────────────────────

function normalizeStatus(status?: string | null) {
  return String(status ?? "").toUpperCase();
}

function isRequestEditable(status?: string | null) {
  return normalizeStatus(status) === "DRAFT";
}

function isRequestSubmitted(status?: string | null) {
  return normalizeStatus(status) === "SUBMITTED";
}

function isRequestLocked(status?: string | null) {
  return ["APPROVED", "REJECTED", "CANCELLED"].includes(
    normalizeStatus(status),
  );
}

function readLogValue(
  log: Record<string, unknown> | EssOvertimeApprovalLog,
  key: string,
) {
  const value = (log as Record<string, unknown>)[key];
  return value === null || value === undefined ? "" : String(value);
}

function isReturnedReviewLog(
  log: Record<string, unknown> | EssOvertimeApprovalLog,
) {
  const action = readLogValue(log, "action");
  const oldStatus = readLogValue(log, "oldStatus");
  const newStatus = readLogValue(log, "newStatus");

  return (
    action === "RETURNED_FOR_REVIEW" ||
    (action === "CANCEL" && oldStatus === "SUBMITTED" && newStatus === "DRAFT")
  );
}

function getLogTimeValue(
  log: Record<string, unknown> | EssOvertimeApprovalLog,
) {
  const value = readLogValue(log, "createdAt");
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getReturnedReviewInfo(
  item?: EssOvertimeRequest | null,
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

function isReturnedReviewDraft(item?: EssOvertimeRequest | null) {
  return item?.status === "DRAFT" && Boolean(getReturnedReviewInfo(item));
}

function isResubmittedAfterReturnedReview(item?: EssOvertimeRequest | null) {
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
  employee?: EssOvertimeApprovalStep["expectedEmployee"] | null,
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

function getApprovalPersonName(step?: EssOvertimeApprovalStep | null) {
  if (!step) return "-";
  if (step.expectedEmployee)
    return getEmployeeDisplayName(step.expectedEmployee);
  if (step.expectedApprover) return getUserDisplayName(step.expectedApprover);
  if (step.position?.nameTh) return step.position.nameTh;
  if (step.roleCode) return step.roleCode;
  return approverTypeText(step.approverType);
}

function getStepDisplayName(step?: EssOvertimeApprovalStep | null) {
  if (!step) return "-";
  return step.nameTh || approverTypeText(step.approverType);
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

const defaultForm: OvertimeFormState = {
  workDate: todayDate(),
  startTime: "17:00",
  endTime: "18:00",
  breakMinutes: "0",
  reason: "",
  note: "",
  submit: true,
};

// ─── แผงหลัก ─────────────────────────────────────────────────────────────────

export function OvertimeRequestPanel() {
  const [items, setItems] = useState<EssOvertimeRequest[]>([]);
  const [summary, setSummary] =
    useState<EssOvertimeRequestSummary>(emptyOvertimeSummary);
  const [filters, setFilters] = useState<OvertimeFilterState>(() =>
    defaultOvertimeFilters(),
  );
  const [form, setForm] = useState<OvertimeFormState>(defaultForm);
  const [editingItem, setEditingItem] = useState<EssOvertimeRequest | null>(
    null,
  );
  const [detailItem, setDetailItem] = useState<EssOvertimeRequest | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  /* ประเภทวันที่ระบบจับให้จากปฏิทินวันหยุด — โชว์อย่างเดียว แก้ไม่ได้ */
  const [dayType, setDayType] = useState<EssOvertimeDayType | null>(null);
  const [dayTypeError, setDayTypeError] = useState<{
    workDate: string;
    message: string;
  } | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState("");
  const [evidenceViewer, setEvidenceViewer] =
    useState<EvidencePreviewState | null>(null);
  const [previewingEvidenceId, setPreviewingEvidenceId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const hasInvalidTime =
    minutesFromTime(form.startTime) >= minutesFromTime(form.endTime);
  const hasInvalidBreak =
    Number(form.breakMinutes || 0) < 0 ||
    durationMinutes(form.startTime, form.endTime, 0) <
      Number(form.breakMinutes || 0);
  const totalDurationText = durationText(
    form.startTime,
    form.endTime,
    form.breakMinutes,
  );
  const returnedReviewInfo = getReturnedReviewInfo(editingItem);

  /*
   * ประเภทวันมาจากปฏิทิน ไม่ใช่จากที่ผู้ยื่นเลือก
   *
   * เปิดฟอร์มหรือเปลี่ยนวันที่เมื่อไหร่ ถามหลังบ้านใหม่ทุกครั้ง เพื่อให้ตัวเลข
   * ชั่วโมงและอัตราที่ผู้ยื่นเห็นตรงกับที่ระบบจะบันทึกจริง
   */
  const formWorkDate = normalizeIsoDate(form.workDate);

  useEffect(() => {
    if (!createOpen || !formWorkDate) return;

    let active = true;

    getEssOvertimeDayType(formWorkDate)
      .then((result) => {
        if (active) setDayType(result);
      })
      .catch((dayTypeFetchError) => {
        if (!active) return;
        setDayTypeError({
          workDate: formWorkDate,
          message:
            dayTypeFetchError instanceof Error
              ? dayTypeFetchError.message
              : "ตรวจประเภทวันจากปฏิทินไม่สำเร็จ",
        });
      });

    return () => {
      active = false;
    };
  }, [createOpen, formWorkDate]);

  /* ผลที่ค้างจากวันที่ก่อนหน้าไม่นับ ระหว่างรอผลของวันใหม่ถือว่ากำลังโหลด */
  const activeDayType =
    dayType && dayType.workDate === formWorkDate ? dayType : null;
  const activeDayTypeError =
    dayTypeError && dayTypeError.workDate === formWorkDate
      ? dayTypeError.message
      : "";
  const dayTypeLoading =
    Boolean(formWorkDate) && !activeDayType && !activeDayTypeError;

  const loadData = useCallback(
    async (activeFilters: OvertimeFilterState = filters) => {
      try {
        setLoading(true);
        setError(null);
        const yearValue = Number(activeFilters.year);
        const response = await getEssOvertimeRequests({
          page: 1,
          pageSize: 20,
          ...(Number.isInteger(yearValue) &&
          yearValue >= 2000 &&
          yearValue <= 2100
            ? { year: yearValue }
            : {}),
          ...(activeFilters.status ? { status: activeFilters.status } : {}),
          ...(activeFilters.workType
            ? { workType: activeFilters.workType }
            : {}),
          ...(activeFilters.search.trim()
            ? { search: activeFilters.search.trim() }
            : {}),
        });
        setItems(response.items ?? []);
        setSummary(response.summary ?? emptyOvertimeSummary);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลดข้อมูล OT ได้";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(defaultOvertimeFilters());
    // โหลดครั้งแรกด้วยตัวกรองเริ่มต้นเท่านั้น การกรองรอบถัดไปสั่งจากปุ่มค้นหา
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm<Key extends keyof OvertimeFormState>(
    key: Key,
    value: OvertimeFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function clearEvidenceFile() {
    setEvidenceFile(null);
    setEvidencePreviewUrl((current) => {
      if (current?.startsWith("blob:")) window.URL.revokeObjectURL(current);
      return "";
    });
  }

  async function loadExistingEvidencePreview(item: EssOvertimeRequest) {
    const attachment = item.attachments?.[0];
    if (!attachment) return;

    try {
      const preview = await previewEssOvertimeAttachment(
        item.id,
        attachment.id,
        attachment.fileName || "overtime-evidence",
      );
      setEvidencePreviewUrl((current) => {
        if (current?.startsWith("blob:")) window.URL.revokeObjectURL(current);
        return preview.objectUrl;
      });
    } catch {
      toast.warning("โหลดรูปหลักฐานเดิมไม่สำเร็จ แต่ยังแก้ไขข้อมูล OT ได้");
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
      toast.success("แนบรูปหลักฐาน OT เรียบร้อยแล้ว");
    };
    reader.onerror = () => toast.error("อ่านไฟล์รูปหลักฐานไม่สำเร็จ");
    reader.readAsDataURL(file);
  }

  async function handlePreviewEvidence(
    requestId: string,
    attachment: EssAttachment,
  ) {
    try {
      setPreviewingEvidenceId(attachment.id);
      const preview = await previewEssOvertimeAttachment(
        requestId,
        attachment.id,
        attachment.fileName || "overtime-evidence",
      );

      setEvidenceViewer((current) => {
        if (current?.objectUrl) window.URL.revokeObjectURL(current.objectUrl);
        return { requestId, attachment, ...preview };
      });
    } catch (previewError) {
      toast.error(
        previewError instanceof Error
          ? previewError.message
          : "เปิดรูปหลักฐาน OT ไม่สำเร็จ",
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
      await downloadEssOvertimeAttachment(
        requestId,
        attachment.id,
        attachment.fileName || "overtime-evidence",
      );
    } catch (downloadError) {
      toast.error(
        downloadError instanceof Error
          ? downloadError.message
          : "ดาวน์โหลดหลักฐาน OT ไม่สำเร็จ",
      );
    }
  }

  function closeEvidenceViewer() {
    setEvidenceViewer((current) => {
      if (current?.objectUrl) window.URL.revokeObjectURL(current.objectUrl);
      return null;
    });
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setEditingItem(null);
    clearEvidenceFile();
  }

  function openCreateForm() {
    setEditingItem(null);
    setForm(defaultForm);
    clearEvidenceFile();
    setCreateOpen(true);
  }

  function openEditForm(item: EssOvertimeRequest) {
    if (isRequestLocked(item.status)) {
      toast.error("รายการที่อนุมัติแล้วไม่สามารถแก้ไขได้");
      return;
    }

    setEditingItem(item);
    setForm({
      workDate: normalizeIsoDate(String(item.workDate ?? todayDate())),
      startTime: normalizeShortTime(item.startTime) || "17:00",
      endTime: normalizeShortTime(item.endTime) || "18:00",
      breakMinutes: String(item.breakMinutes ?? "0"),
      reason: item.reason ?? "",
      note: item.note ?? "",
      submit: item.status === "DRAFT",
    });
    clearEvidenceFile();
    setCreateOpen(true);
    void loadExistingEvidencePreview(item);
  }

  function handleDeleteRequest(item: EssOvertimeRequest) {
    if (isRequestLocked(item.status)) {
      toast.error("รายการที่อนุมัติแล้วไม่สามารถลบได้");
      return;
    }

    setActionDialog({
      title: "ลบรายการ OT",
      description:
        "ต้องการลบรายการ OT นี้ออกจากประวัติหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบรายการ",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        try {
          setDeletingId(item.id);
          await deleteEssOvertimeRequest(item.id);
          if (editingItem?.id === item.id) setEditingItem(null);
          if (detailItem?.id === item.id) setDetailItem(null);
          toast.success("ลบรายการ OT เรียบร้อยแล้ว");
          await loadData();
        } catch (deleteError) {
          toast.error(
            deleteError instanceof Error
              ? deleteError.message
              : "ลบรายการ OT ไม่สำเร็จ",
          );
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  function handleCancelSubmission(item: EssOvertimeRequest) {
    if (!isRequestSubmitted(item.status)) {
      toast.error("ยกเลิกการส่งได้เฉพาะรายการที่รออนุมัติ");
      return;
    }

    setActionDialog({
      title: "ยกเลิกการส่งคำขอ OT",
      description:
        "ระบบจะถอนคำขอนี้ออกจากคิวอนุมัติและกลับเป็นร่าง เพื่อให้คุณแก้ไขข้อมูลแล้วส่งคำขอใหม่อีกครั้ง",
      confirmLabel: "ยืนยันยกเลิกการส่ง",
      cancelLabel: "กลับไป",
      tone: "orange",
      onConfirm: async () => {
        try {
          setCancelingId(item.id);
          await cancelEssOvertimeRequest(item.id, {
            reason: "ยกเลิกการส่งจากพนักงาน",
          });
          if (detailItem?.id === item.id) setDetailItem(null);
          toast.success("ยกเลิกการส่งคำขอ OT แล้ว สามารถแก้ไขและส่งใหม่ได้");
          await loadData(filters);
        } catch (cancelError) {
          toast.error(
            cancelError instanceof Error
              ? cancelError.message
              : "ยกเลิกการส่งคำขอ OT ไม่สำเร็จ",
          );
        } finally {
          setCancelingId(null);
        }
      },
    });
  }

  function validateForm(shouldSubmit: boolean) {
    if (!form.workDate) return "กรุณาเลือกวันที่ทำ OT";
    if (hasInvalidTime) return "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มทำ OT";
    if (hasInvalidBreak) return "เวลาพักต้องไม่มากกว่าระยะเวลาทำ OT";
    if (!form.reason.trim()) return "กรุณาระบุเหตุผลในการทำ OT";
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
      return "กรุณาแนบรูปหลักฐานการทำ OT อย่างน้อย 1 รูป";
    }
    return "";
  }

  async function saveOvertimeRequest(shouldSubmit: boolean) {
    const validationMessage = validateForm(shouldSubmit);
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    try {
      setSaving(true);
      const workDate = normalizeIsoDate(form.workDate);

      const payload: CreateEssOvertimeRequestForm = {
        workDate,
        startTime: buildApiDateTime(workDate, form.startTime),
        endTime: buildApiDateTime(workDate, form.endTime),
        breakMinutes: Number(form.breakMinutes || 0),
        reason: form.reason.trim(),
        note: form.note.trim() || undefined,
        submit: shouldSubmit,
      };

      if (editingItem) {
        const updatePayload: Partial<CreateEssOvertimeRequestForm> = {
          ...payload,
        };
        delete updatePayload.submit;
        await updateEssOvertimeRequest(editingItem.id, updatePayload);

        if (evidenceFile) {
          await uploadEssOvertimeAttachment(editingItem.id, {
            title: "หลักฐานประกอบคำขอ OT",
            description: form.reason.trim() || "รูปหลักฐานประกอบคำขอ OT",
            file: evidenceFile,
          });
        }

        const returnedReview = isReturnedReviewDraft(editingItem);

        if (shouldSubmit && editingItem.status === "DRAFT") {
          await submitEssOvertimeRequest(editingItem.id);
        }

        toast.success(
          returnedReview && shouldSubmit
            ? "ส่งคำขอ OT ที่แก้ไขแล้วกลับเข้าคิวอนุมัติเรียบร้อย"
            : "แก้ไขคำขอ OT เรียบร้อยแล้ว",
        );
      } else {
        /*
         * สร้างเป็นร่างก่อนเสมอ แล้วค่อยแนบรูปและส่งเข้าคิวอนุมัติ
         *
         * รูปหลักฐานอัปโหลดได้ต่อเมื่อมีใบอยู่แล้ว และหลังบ้านไม่รับใบที่ยังไม่มี
         * หลักฐาน การส่งพร้อมสร้างจึงทำไม่ได้อีกต่อไป
         */
        const createdRequest = await createEssOvertimeRequest({
          ...payload,
          submit: false,
        });

        if (evidenceFile) {
          await uploadEssOvertimeAttachment(createdRequest.id, {
            title: "หลักฐานประกอบคำขอ OT",
            description: form.reason.trim() || "รูปหลักฐานประกอบคำขอ OT",
            file: evidenceFile,
          });
        }

        if (shouldSubmit) {
          await submitEssOvertimeRequest(createdRequest.id);
        }

        toast.success(
          shouldSubmit
            ? "ส่งคำขอ OT เรียบร้อยแล้ว"
            : "บันทึกร่างคำขอ OT เรียบร้อยแล้ว",
        );
      }

      setForm(defaultForm);
      setEditingItem(null);
      clearEvidenceFile();
      setCreateOpen(false);
      await loadData();
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "บันทึกคำขอ OT ไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveOvertimeRequest(true);
  }

  const isUnlinkedAccount = Boolean(
    error?.includes("ยังไม่ได้ผูกกับข้อมูลพนักงาน"),
  );

  const columns: Array<Column<EssOvertimeRequest>> = [
    {
      key: "workDate",
      header: "วันที่ทำ OT",
      width: "w-[13rem]",
      cell: (item) => (
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 3xl:text-[13.5px]">
            {date(item.workDate)}
          </p>
          <p className="truncate text-[12px] text-slate-400">
            {workTypeLabel(item.workType)}
            {item.requestNo ? ` · ${item.requestNo}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "time",
      header: "ช่วงเวลา",
      width: "w-[10rem]",
      cell: (item) => (
        <div className="min-w-0">
          <p className="text-[13px] tabular-nums text-slate-700">
            {normalizeShortTime(item.startTime) || "--:--"}–
            {normalizeShortTime(item.endTime) || "--:--"}
          </p>
          <p className="text-[12px] text-slate-400">
            {Number(item.breakMinutes ?? 0) > 0
              ? `หักพัก ${num(item.breakMinutes, 0)} นาที`
              : "ไม่มีเวลาพัก"}
          </p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "ชั่วโมง",
      align: "right",
      width: "w-[7rem]",
      cell: (item) => (
        <span className="text-[13px] font-semibold tabular-nums text-slate-800">
          {num(item.totalHours)} ชม.
        </span>
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
      {/* ---------------- สรุป OT ---------------- */}
      <section className="border-b border-slate-200 px-5 py-4 3xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL_CLASS}>คำขอ OT ปี {filters.year}</p>
            <p className="mt-1 text-[13px] text-slate-500">
              ชั่วโมงที่นับได้คือเวลาทำงานจริงหลังหักเวลาพักแล้ว
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
              onClick={openCreateForm}
              icon={<PlusCircle className="h-3.5 w-3.5" />}
            >
              ขอทำ OT
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-4 sm:divide-y-0">
          <StatTile
            label="คำขอทั้งหมด"
            value={num(summary.total, 0)}
            helper={`ร่าง ${num(summary.draft, 0)} · รออนุมัติ ${num(summary.submitted, 0)}`}
          />
          <StatTile
            label="ชั่วโมงที่ยื่นรวม"
            value={`${num(summary.totalHours)} ชม.`}
            helper="รวมทุกสถานะในปีนี้"
          />
          <StatTile
            label="ชั่วโมงที่อนุมัติแล้ว"
            value={`${num(summary.approvedHours)} ชม.`}
            tone="positive"
            helper={`${num(summary.approved, 0)} คำขอ`}
          />
          <StatTile
            label="รออนุมัติ"
            value={num(summary.submitted, 0)}
            tone={summary.submitted > 0 ? "warning" : "neutral"}
            helper={summary.submitted > 0 ? "ยังไม่ได้ผล" : "ไม่มีค้างอยู่"}
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
              {overtimeStatusOptions.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ประเภทวัน" className="w-full sm:w-44">
            <Select
              value={filters.workType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  workType: event.target.value,
                }))
              }
            >
              <option value="">ทุกประเภทวัน</option>
              {workTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
            <Button
              variant="ghost"
              onClick={() => {
                const next = defaultOvertimeFilters();
                setFilters(next);
                void loadData(next);
              }}
            >
              ล้างตัวกรอง
            </Button>
          </div>
        </form>
      </section>

      {/* ---------------- ประวัติคำขอ ---------------- */}
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={loading}
        error={
          isUnlinkedAccount
            ? "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงยังยื่นคำขอ OT ไม่ได้ — ผูกบัญชีกับพนักงานได้ที่หน้า ผู้ใช้และสิทธิ์"
            : error
        }
        onRetry={() => void loadData(filters)}
        onRowClick={(item) => setDetailItem(item)}
        emptyTitle="ยังไม่มีคำขอ OT"
        emptyDescription="เมื่อยื่นคำขอแล้ว รายการจะแสดงที่นี่"
        emptyAction={
          <Button
            variant="primary"
            onClick={openCreateForm}
            icon={<PlusCircle className="h-3.5 w-3.5" />}
          >
            ขอทำ OT
          </Button>
        }
        minWidth="min-w-[62rem]"
      />

      {/* ---------------- ฟอร์มคำขอ OT ---------------- */}
      <Modal
        open={createOpen}
        size="lg"
        title={
          returnedReviewInfo
            ? "แก้ไขคำขอ OT ที่ถูกส่งกลับ"
            : editingItem
              ? "แก้ไขคำขอ OT"
              : "ขอทำงานล่วงเวลา"
        }
        description={
          returnedReviewInfo
            ? "แก้ไขตามเหตุผลที่ผู้อนุมัติส่งกลับ แล้วส่งเข้าคิวอนุมัติใหม่"
            : "ระบุวันที่ ช่วงเวลา และเหตุผลของการทำ OT — ประเภทวันระบบตรวจให้เอง"
        }
        onClose={closeCreateModal}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeCreateModal}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button
              variant="secondary"
              onClick={() => void saveOvertimeRequest(false)}
              disabled={saving}
            >
              {returnedReviewInfo ? "บันทึกการแก้ไข" : "บันทึกเป็นร่าง"}
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="ess-overtime-form"
              loading={saving}
              icon={<Send className="h-3.5 w-3.5" />}
            >
              {returnedReviewInfo ? "ส่งคำขอใหม่" : "ส่งคำขอ"}
            </Button>
          </>
        }
      >
        <form
          id="ess-overtime-form"
          onSubmit={submitForm}
          className="space-y-4"
        >
          {returnedReviewInfo ? (
            <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
              <p className="font-semibold">คำขอนี้ถูกส่งกลับให้ตรวจสอบใหม่</p>
              <p className="mt-0.5">เหตุผล: {returnedReviewInfo.reason}</p>
              {returnedReviewInfo.returnedAt ? (
                <p className="mt-0.5 text-[12.5px]">
                  ส่งกลับเมื่อ {dateTime(returnedReviewInfo.returnedAt)}
                </p>
              ) : null}
            </Notice>
          ) : null}

          <Section title="วันที่และช่วงเวลา">
            <FieldGrid columns={2}>
              <Field label="วันที่ทำ OT" required>
                <ThaiDateInput
                  value={form.workDate}
                  onChange={(event) =>
                    updateForm("workDate", event.target.value)
                  }
                  className="mt-0"
                />
              </Field>

              {/* ระบบจับประเภทวันจากปฏิทินวันหยุดเอง ผู้ยื่นดูได้อย่างเดียว */}
              <Field
                label="ประเภทวัน"
                hint={
                  dayTypeLoading
                    ? "กำลังเทียบกับปฏิทินวันหยุด"
                    : activeDayTypeError
                      ? "แก้วันที่แล้วระบบจะตรวจให้ใหม่"
                      : (activeDayType?.reason ??
                        "ระบบตรวจให้อัตโนมัติจากปฏิทินวันหยุดของบริษัท")
                }
              >
                <div className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 max-[1536px]:h-10 max-[1536px]:px-2.5">
                  {dayTypeLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                      <span className="text-[13px] text-slate-500">
                        กำลังตรวจปฏิทิน…
                      </span>
                    </>
                  ) : activeDayTypeError ? (
                    <span className="truncate text-[13px] font-semibold text-rose-600">
                      {activeDayTypeError}
                    </span>
                  ) : (
                    <>
                      <Badge
                        tone={
                          activeDayType && activeDayType.workType !== "WORKDAY"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {activeDayType?.label ?? "-"}
                      </Badge>
                      {activeDayType?.holidayName ? (
                        <span className="truncate text-[12.5px] text-slate-500">
                          {activeDayType.holidayName}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </Field>

              <Field label="เวลาเริ่ม" required>
                <TextInput
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    updateForm("startTime", event.target.value)
                  }
                />
              </Field>

              <Field label="เวลาสิ้นสุด" required>
                <TextInput
                  type="time"
                  value={form.endTime}
                  onChange={(event) =>
                    updateForm("endTime", event.target.value)
                  }
                />
              </Field>

              <Field label="เวลาพัก (นาที)" hint="หักออกจากชั่วโมง OT">
                <TextInput
                  type="number"
                  min={0}
                  value={form.breakMinutes}
                  onChange={(event) =>
                    updateForm("breakMinutes", event.target.value)
                  }
                />
              </Field>

              <Field
                label="ช่วงเวลาที่ใช้บ่อย"
                hint="กดเพื่อเติมเวลาให้อัตโนมัติ"
              >
                <div className="grid grid-cols-2 gap-2">
                  {timePresets.map((preset) => {
                    const active =
                      preset.startTime === form.startTime &&
                      preset.endTime === form.endTime;

                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            startTime: preset.startTime,
                            endTime: preset.endTime,
                            breakMinutes: preset.breakMinutes,
                          }))
                        }
                        className={joinClassName(
                          "h-9 rounded-lg border px-2 text-[12.5px] font-semibold transition 3xl:h-10",
                          active
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </FieldGrid>

            {hasInvalidTime ? (
              <Notice
                tone="critical"
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มทำ OT
              </Notice>
            ) : hasInvalidBreak ? (
              <Notice
                tone="critical"
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                เวลาพักต้องไม่มากกว่าระยะเวลาทำ OT
              </Notice>
            ) : (
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className={LABEL_CLASS}>ชั่วโมง OT ที่จะได้</p>
                <p className="mt-0.5 text-[17px] font-bold tabular-nums text-brand-700 3xl:text-[19px]">
                  {totalDurationText}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  คิดจาก {form.startTime}–{form.endTime}
                  {Number(form.breakMinutes || 0) > 0
                    ? ` หักพัก ${num(form.breakMinutes, 0)} นาที`
                    : ""}
                </p>
              </div>
            )}
          </Section>

          <Section title="รายละเอียดคำขอ">
            <FieldGrid columns={1}>
              <Field label="เหตุผล" required>
                <Textarea
                  rows={2}
                  value={form.reason}
                  onChange={(event) => updateForm("reason", event.target.value)}
                  placeholder="ระบุงานที่ต้องทำนอกเวลา และเหตุผลที่ต้องทำ OT"
                />
              </Field>

              <Field label="หมายเหตุ">
                <Textarea
                  rows={2}
                  value={form.note}
                  onChange={(event) => updateForm("note", event.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม ถ้ามี"
                />
              </Field>
            </FieldGrid>
          </Section>

          <Section
            title="หลักฐานประกอบ *"
            description="ต้องแนบรูปหลักฐานการทำ OT อย่างน้อย 1 รูปก่อนส่งคำขอ เช่น รูปงานที่ทำหรืออีเมลที่ได้รับมอบหมาย (JPG, JPEG, PNG ไม่เกิน 10 MB)"
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-brand-700">
                  <Upload className="h-4 w-4" />
                  เลือกรูปหลักฐาน
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
                  <p className="mt-2 text-[12.5px] text-rose-500">
                    {(editingItem?.attachments?.length ?? 0) > 0
                      ? "ใช้รูปหลักฐานเดิมที่แนบไว้ เลือกไฟล์ใหม่เพื่อเพิ่มรูป"
                      : "ยังไม่ได้เลือกไฟล์ — ต้องแนบรูปก่อนจึงจะส่งคำขอได้"}
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                {evidencePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={evidencePreviewUrl}
                    alt="ตัวอย่างรูปหลักฐาน OT"
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

      {/* ---------------- รายละเอียดคำขอ ---------------- */}
      <OvertimeDetailModal
        item={detailItem}
        previewingEvidenceId={previewingEvidenceId}
        onPreviewEvidence={handlePreviewEvidence}
        onClose={() => setDetailItem(null)}
      />

      {/* ---------------- ดูรูปหลักฐาน ---------------- */}
      <Modal
        open={Boolean(evidenceViewer)}
        size="lg"
        title="หลักฐานประกอบคำขอ OT"
        description={evidenceViewer?.fileName}
        onClose={closeEvidenceViewer}
        footer={
          <>
            <Button variant="ghost" onClick={closeEvidenceViewer}>
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

// ─── รายละเอียดคำขอ OT ────────────────────────────────────────────────────────

function OvertimeDetailModal({
  item,
  previewingEvidenceId,
  onPreviewEvidence,
  onClose,
}: {
  item: EssOvertimeRequest | null;
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
  const approvalLogs = [...(item.approvalLogs ?? [])].sort(
    (a, b) => getLogTimeValue(b) - getLogTimeValue(a),
  );
  const returned = getReturnedReviewInfo(item);

  return (
    <Modal
      open
      size="lg"
      title={`รายละเอียดคำขอ OT${item.requestNo ? ` ${item.requestNo}` : ""}`}
      description={`${date(item.workDate)} · ${workTypeLabel(item.workType)}`}
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
            ยื่นเมื่อ {dateTime(item.submittedAt ?? item.createdAt)}
          </span>
        </div>

        <Section title="ข้อมูลคำขอ">
          <FieldGrid columns={3}>
            <DetailItem label="วันที่ทำ OT" value={date(item.workDate)} />
            <DetailItem
              label="ช่วงเวลา"
              value={`${normalizeShortTime(item.startTime) || "--:--"}–${normalizeShortTime(item.endTime) || "--:--"}`}
            />
            <DetailItem
              label="เวลาพัก"
              value={`${num(item.breakMinutes, 0)} นาที`}
            />
            <DetailItem
              label="ชั่วโมงที่ขอ"
              value={`${num(item.totalHours)} ชม.`}
            />
            <DetailItem
              label="ประเภทวัน"
              value={workTypeLabel(item.workType)}
            />
            <DetailItem
              label="อนุมัติเมื่อ"
              value={dateTime(item.approvedAt)}
            />
          </FieldGrid>
        </Section>

        <Section title="เหตุผลและหมายเหตุ">
          <div className="space-y-2">
            {/* ป้ายกับเนื้อความพอแล้ว ในป๊อปอัพไม่ต้องมีกรอบซ้อนอีกชั้น */}
            <div className="border-b border-slate-100 pb-2">
              <p className={LABEL_CLASS}>เหตุผล</p>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">
                {item.reason?.trim() || "-"}
              </p>
            </div>
            {item.note ? (
              <div className="border-b border-slate-100 pb-2">
                <p className={LABEL_CLASS}>หมายเหตุ</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">
                  {item.note}
                </p>
              </div>
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

        <Section title="หลักฐานแนบ">
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
            <p className="text-[13px] text-slate-400">ไม่มีหลักฐานแนบ</p>
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

        {approvalLogs.length > 0 ? (
          <Section title="ประวัติการดำเนินการ">
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
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
          </Section>
        ) : null}
      </div>
    </Modal>
  );
}
