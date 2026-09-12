"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  RefreshCcw,
  RotateCcw,
  Timer,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  approveApprovalDocumentRequest,
  approveApprovalLeaveRequest,
  approveApprovalOffsiteRequest,
  approveApprovalOvertimeRequest,
  approveApprovalTimeAdjustRequest,
  getPendingApprovals,
  getPublicFileUrl,
  rejectApprovalDocumentRequest,
  rejectApprovalLeaveRequest,
  rejectApprovalOffsiteRequest,
  rejectApprovalOvertimeRequest,
  rejectApprovalTimeAdjustRequest,
  returnApprovalDocumentRequest,
  returnApprovalLeaveRequest,
  returnApprovalOffsiteRequest,
  returnApprovalOvertimeRequest,
  returnApprovalTimeAdjustRequest,
} from "@/lib/api";

import type {
  ApprovalActionForm,
  ApprovalItem,
  ApprovalListSummary,
  ApprovalLog,
  ApprovalRequestKind,
  ApprovalRequestStatusFilter,
  ApprovalStep,
} from "@/types/approvals";

import { ApprovalAttachments } from "./approval-attachments";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  formatDateInputValue,
  formatThaiDate,
  formatThaiDateTime,
  formatThaiTime,
} from "@/lib/date-format";

import {
  Avatar,
  Badge,
  Button,
  IconButton,
  Notice,
  SearchInput,
  Select,
  joinClassName,
  type TabItem,
  type Tone,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { REQUEST_STATUS, statusLabel } from "@/lib/status-labels";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

/**
 * แท็บ "รออนุมัติ" — เดิมเป็นหน้า /approvals แยก ยุบมาเป็นแท็บแรกในหน้า
 * "ศูนย์คำขอ" ตรรกะทางธุรกิจทั้งหมด (5-way action dispatch ตามประเภทคำขอ,
 * ตัวกรองประเภท/สถานะ/วันที่/เร่งด่วน, สายอนุมัติในโมดัลรายละเอียด) คงไว้
 * เหมือนเดิมทุกจุด เปลี่ยนแค่การแสดงผลให้ใช้ชุด kit
 */

const PAGE_SIZE = 20;

/** ค้างเกินกี่วันถึงนับว่าเร่งด่วน — ต้องตรงกับที่ backend ใช้คำนวณ summary.urgent */
const URGENT_DAYS = 3;

export type QueueSummary = {
  pending: number;
  urgent: number;
  today: number;
  week: number;
};

const TYPE_TABS: Array<{
  key: ApprovalRequestKind;
  label: string;
  count: (s: ApprovalListSummary) => number;
}> = [
  {
    key: "ALL",
    label: "ทั้งหมด",
    // summary.total ถูกกรองตามประเภทที่เลือกอยู่ จึงรวมรายประเภทเองเพื่อให้ได้ยอดรวมจริงเสมอ
    count: (s) => s.leave + s.overtime + s.timeAdjust + s.offsite + s.document,
  },
  { key: "LEAVE", label: "การลา", count: (s) => s.leave },
  { key: "OVERTIME", label: "OT", count: (s) => s.overtime },
  { key: "TIME_ADJUST", label: "ขอแก้เวลา", count: (s) => s.timeAdjust },
  { key: "OFFSITE", label: "นอกสถานที่", count: (s) => s.offsite },
  { key: "DOCUMENT", label: "เอกสาร", count: (s) => s.document },
];

function count(value: number) {
  return value.toLocaleString("th-TH");
}

/** ค้างมากี่วันแล้ว ใช้เตือนในแถวที่รออนุมัตินานเกินกำหนด */
function daysPending(item: ApprovalItem) {
  if (!item.submittedAt) return 0;

  const submitted = new Date(item.submittedAt).getTime();
  if (Number.isNaN(submitted)) return 0;

  return Math.floor((Date.now() - submitted) / 86_400_000);
}

const STATUS_FILTERS: Array<{ value: ApprovalRequestStatusFilter; label: string }> = [
  { value: "SUBMITTED", label: "รออนุมัติ" },
  { value: "APPROVED", label: "อนุมัติแล้ว" },
  { value: "REJECTED", label: "ไม่อนุมัติ" },
  { value: "RETURNED", label: "ตีกลับ" },
  { value: "ALL", label: "ทั้งหมด" },
];

const typeText: Record<string, string> = {
  LEAVE: "การลา",
  OVERTIME: "OT",
  TIME_ADJUST: "ขอแก้เวลา",
  OFFSITE: "นอกสถานที่",
  DOCUMENT: "เอกสาร",
};

const typeIcon: Record<string, ReactNode> = {
  LEAVE: <CalendarDays className="h-3.5 w-3.5" />,
  OVERTIME: <Timer className="h-3.5 w-3.5" />,
  TIME_ADJUST: <Clock3 className="h-3.5 w-3.5" />,
  OFFSITE: <MapPin className="h-3.5 w-3.5" />,
  DOCUMENT: <FileText className="h-3.5 w-3.5" />,
};

/**
 * สีวงไอคอนต่อประเภทคำขอ — ผู้ใช้ขอเพิ่มสีเข้ามาเอง (ปกติคอลัมน์นี้ตั้งใจเป็นสีเดียว
 * ตามกฎ "หนึ่งบรรทัดให้สีได้ตัวเดียว" เพราะสงวนสีไว้ให้สถานะ) จึงใช้แค่วงไอคอนบาง ๆ
 * ไม่ทำให้ตัวหนังสือมีสี กันไม่ให้ไปแย่งความสนใจจาก badge สถานะ
 */
/** โทนฟ้าล้วน ไล่เฉดต่อประเภท แทนที่จะใช้คนละสีตระกูล (เขียว/ม่วง/เหลือง) แบบเดิม */
const typeIconColor: Record<string, string> = {
  LEAVE: "bg-brand-50 text-brand-600",
  OVERTIME: "bg-sky-50 text-sky-600",
  TIME_ADJUST: "bg-indigo-50 text-indigo-600",
  OFFSITE: "bg-cyan-50 text-cyan-600",
  DOCUMENT: "bg-blue-50 text-blue-600",
};

const dayTypeText: Record<string, string> = {
  FULL_DAY: "เต็มวัน",
  HALF_DAY_MORNING: "ครึ่งวันเช้า",
  HALF_DAY_AFTERNOON: "ครึ่งวันบ่าย",
  HOURLY: "รายชั่วโมง",
};

const adjustTypeText: Record<string, string> = {
  MISSING_CHECK_IN: "ลืมลงเวลาเข้า",
  MISSING_CHECK_OUT: "ลืมลงเวลาออก",
  WRONG_TIME: "เวลาผิด",
  DEVICE_ERROR: "เครื่องขัดข้อง",
  OUTSIDE_WORK: "ทำงานนอกสถานที่",
  OTHER: "อื่น ๆ",
};

/* ป้ายเดียวกับแท็บประวัติในโฟลเดอร์นี้ (history/*.tsx) เพื่อไม่ให้เรียกชื่อคนละอย่างกันสองหน้า */
const workTypeText: Record<string, string> = {
  WORKDAY: "วันทำงาน",
  HOLIDAY: "วันหยุด",
  SPECIAL_HOLIDAY: "วันหยุดพิเศษ",
};

const logTypeText: Record<string, string> = {
  CHECK_IN: "เวลาเข้า",
  CHECK_OUT: "เวลาออก",
  BREAK_START: "เริ่มพัก",
  BREAK_END: "กลับจากพัก",
};

function str(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

/**
 * เวลาของคำขอมาสองรูปแบบ ขึ้นกับตารางต้นทาง
 * - OT เก็บ startTime/endTime เป็น DateTime เต็ม จึงมาเป็น ISO string
 * - ใบลา/ทำงานนอกสถานที่เก็บเป็น "HH:mm" ตรง ๆ
 *
 * เดิมตัดด้วย slice(0, 5) แบบเดียว ค่าที่เป็น ISO เลยแสดงออกมาเป็น "2026-"
 * ทั้งเวลาเริ่มและเวลาสิ้นสุด เท่ากับใบ OT ไม่เคยเห็นเวลาจริงเลย
 */
function timeText(value: unknown) {
  if (typeof value !== "string") return "";

  const text = value.trim();
  if (!text) return "";
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5);

  const formatted = formatThaiTime(text);
  return formatted === "-" ? "" : formatted;
}

/** OT กะดึกเก็บเวลาเลิกงานเป็นวันถัดไป ถ้าโชว์แค่ HH:mm จะอ่านเป็นย้อนเวลา */
function crossesMidnight(from: unknown, to: unknown) {
  if (typeof from !== "string" || typeof to !== "string") return false;

  const start = formatDateInputValue(from);
  const end = formatDateInputValue(to);

  return Boolean(start && end && start !== end);
}

function timeRange(from: unknown, to: unknown) {
  const a = timeText(from);
  const b = timeText(to);
  if (!a && !b) return "-";

  return `${a || "?"} – ${b || "?"}${crossesMidnight(from, to) ? " (+1 วัน)" : ""}`;
}

/** นาทีดิบ → "1 ชม. 30 นาที" ใช้กับใบลารายชั่วโมงและส่วนต่างเวลาที่ขอแก้ */
function minutesText(value: unknown) {
  const total = Math.round(Number(value));
  if (!Number.isFinite(total) || total <= 0) return "-";

  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  return (
    [hours ? `${hours} ชม.` : "", minutes ? `${minutes} นาที` : ""]
      .filter(Boolean)
      .join(" ") || "-"
  );
}

/** ส่วนต่างระหว่างเวลาเดิมกับเวลาที่ขอแก้ — ตัวเลขที่ผู้อนุมัติต้องดูก่อนกดอนุมัติ */
function diffMinutes(from: unknown, to: unknown) {
  const start = typeof from === "string" ? new Date(from) : null;
  const end = typeof to === "string" ? new Date(to) : null;

  if (!start || !end) return null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/**
 * รูปโปรไฟล์เก็บที่ผู้ใช้ (User.avatarUrl) แต่บางเส้น API ยัดมาที่ตัวพนักงานเลย
 * เช็กทั้งสองที่ ถ้าไม่มีรูป Avatar จะวาดอักษรย่อให้เอง
 */
function employeeAvatarUrl(employee?: ApprovalItem["employee"]) {
  return getPublicFileUrl(employee?.user?.avatarUrl ?? employee?.avatarUrl ?? null);
}

function personName(employee?: ApprovalItem["employee"]) {
  if (!employee) return "-";
  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    "-"
  );
}

type DetailRow = { label: string; value: string; wide?: boolean };

function detailRows(item: ApprovalItem): DetailRow[] {
  const d = item.detail ?? {};

  if (item.type === "LEAVE") {
    const rows: DetailRow[] = [
      { label: "ประเภทการลา", value: str(d.leaveTypeName) },
      {
        label: "ช่วงวันที่",
        value: `${formatThaiDate(String(d.startDate ?? ""))} – ${formatThaiDate(String(d.endDate ?? ""))}`,
      },
      {
        label: "ลักษณะการลา",
        value: dayTypeText[String(d.dayType)] ?? str(d.dayType),
      },
      { label: "จำนวนวัน", value: `${str(d.totalDays)} วัน` },
    ];

    /* ใบลารายชั่วโมงเท่านั้นที่มีเวลา ใบเต็มวันจะว่าง ไม่ต้องขึ้นช่องเปล่าให้รก */
    if (d.startTime || d.endTime) {
      rows.push({ label: "ช่วงเวลา", value: timeRange(d.startTime, d.endTime) });
    }
    if (Number(d.totalMinutes) > 0) {
      rows.push({ label: "จำนวนชั่วโมง", value: minutesText(d.totalMinutes) });
    }

    rows.push({ label: "ผู้ติดต่อระหว่างลา", value: str(d.contactInfo) });

    return rows;
  }

  if (item.type === "OVERTIME") {
    return [
      { label: "วันที่ทำงาน", value: formatThaiDate(String(d.workDate ?? "")) },
      { label: "ช่วงเวลา", value: timeRange(d.startTime, d.endTime) },
      { label: "ชั่วโมงรวม", value: `${str(d.totalHours)} ชม.` },
      {
        label: "ประเภทวัน",
        value: workTypeText[String(d.workType)] ?? str(d.workType),
      },
    ];
  }

  if (item.type === "TIME_ADJUST") {
    const gap = diffMinutes(d.originalLogTime, d.requestedLogTime);

    const rows: DetailRow[] = [
      {
        label: "สาเหตุ",
        value: adjustTypeText[String(d.adjustType)] ?? str(d.adjustType),
      },
      {
        label: "รายการเวลาที่ขอแก้",
        value: logTypeText[String(d.targetLogType)] ?? str(d.targetLogType),
      },
      {
        label: "เวลาเดิม",
        value: d.originalLogTime
          ? formatThaiDateTime(String(d.originalLogTime))
          : "ไม่มีข้อมูลเดิม",
      },
      {
        label: "เวลาที่ขอแก้",
        value: d.requestedLogTime
          ? formatThaiDateTime(String(d.requestedLogTime))
          : "-",
      },
    ];

    if (gap !== null && gap !== 0) {
      rows.push({
        label: "ส่วนต่าง",
        value: `${gap > 0 ? "+" : "-"}${minutesText(Math.abs(gap))}`,
      });
    }

    return rows;
  }

  if (item.type === "OFFSITE") {
    const rows: DetailRow[] = [
      { label: "วันที่ทำงาน", value: formatThaiDate(String(d.workDate ?? "")) },
      { label: "ช่วงเวลา", value: timeRange(d.startTime, d.endTime) },
      { label: "สถานที่", value: str(d.locationName) },
    ];

    if (Number(d.radiusMeters) > 0) {
      rows.push({ label: "รัศมีลงเวลา", value: `${str(d.radiusMeters)} เมตร` });
    }

    rows.push({ label: "ที่อยู่", value: str(d.address), wide: true });

    return rows;
  }

  const levels = Number(d.approvalLevels);

  return [
    { label: "ประเภทเอกสาร", value: str(d.documentTypeName) },
    { label: "ชื่อเรื่อง", value: str(d.title ?? item.title) },
    ...(levels > 0
      ? [
          {
            label: "ขั้นอนุมัติ",
            value: `ขั้นที่ ${str(d.currentLevel)} จาก ${levels}`,
          },
        ]
      : []),
    { label: "วัตถุประสงค์", value: str(d.purpose), wide: true },
  ];
}

/* ------------------------------------------------------------------ */
/* Action dispatch (ตาม type)                                          */
/* ------------------------------------------------------------------ */

function approveItem(item: ApprovalItem, payload: ApprovalActionForm) {
  switch (item.type) {
    case "LEAVE":
      return approveApprovalLeaveRequest(item.id, payload);
    case "OVERTIME":
      return approveApprovalOvertimeRequest(item.id, payload);
    case "OFFSITE":
      return approveApprovalOffsiteRequest(item.id, payload);
    case "DOCUMENT":
      return approveApprovalDocumentRequest(item.id, payload);
    default:
      return approveApprovalTimeAdjustRequest(item.id, payload);
  }
}

function rejectItem(item: ApprovalItem, payload: ApprovalActionForm) {
  switch (item.type) {
    case "LEAVE":
      return rejectApprovalLeaveRequest(item.id, payload);
    case "OVERTIME":
      return rejectApprovalOvertimeRequest(item.id, payload);
    case "OFFSITE":
      return rejectApprovalOffsiteRequest(item.id, payload);
    case "DOCUMENT":
      return rejectApprovalDocumentRequest(item.id, payload);
    default:
      return rejectApprovalTimeAdjustRequest(item.id, payload);
  }
}

function returnItem(item: ApprovalItem, payload: ApprovalActionForm) {
  switch (item.type) {
    case "LEAVE":
      return returnApprovalLeaveRequest(item.id, payload);
    case "OVERTIME":
      return returnApprovalOvertimeRequest(item.id, payload);
    case "OFFSITE":
      return returnApprovalOffsiteRequest(item.id, payload);
    case "DOCUMENT":
      return returnApprovalDocumentRequest(item.id, payload);
    default:
      return returnApprovalTimeAdjustRequest(item.id, payload);
  }
}

const emptySummary: ApprovalListSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  returned: 0,
  leave: 0,
  overtime: 0,
  timeAdjust: 0,
  offsite: 0,
  document: 0,
  urgent: 0,
  today: 0,
  week: 0,
  overtimeTotalHours: 0,
  overtimeAverageHours: 0,
  overtimeNoAttachment: 0,
  timeAdjustNoAttachment: 0,
  oldestPending: null,
  leaveNextSevenDays: [],
  monthlyTrend: [],
  donutData: [],
};

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function QueuePanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: QueueSummary) => void;
}) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [summary, setSummary] = useState<ApprovalListSummary>(emptySummary);
  const [meta, setMeta] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const [type, setType] = useState<ApprovalRequestKind>("ALL");
  const [status, setStatus] =
    useState<ApprovalRequestStatusFilter>("SUBMITTED");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      const data = await getPendingApprovals({
        page,
        pageSize: PAGE_SIZE,
        type,
        status,
        q: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        urgentOnly: urgentOnly || undefined,
      });

      setItems(data.items ?? []);
      setSummary(data.summary ?? emptySummary);
      setMeta(
        data.meta ?? { page, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
      );
    } catch (error) {
      console.error(error);
      setErrorText(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, type, status, search, dateFrom, dateTo, urgentOnly]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 300);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    onSummaryChange?.({
      pending: summary.pending,
      urgent: summary.urgent,
      today: summary.today,
      week: summary.week,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.pending, summary.urgent, summary.today, summary.week]);

  function switchType(next: ApprovalRequestKind) {
    setType(next);
    setPage(1);
  }

  async function runAction(
    item: ApprovalItem,
    action: "approve" | "reject" | "return",
    reason: string,
  ) {
    setActingId(item.id);

    try {
      const payload: ApprovalActionForm =
        action === "approve"
          ? { reason: reason || "อนุมัติผ่านศูนย์อนุมัติ" }
          : action === "reject"
            ? { reason }
            : {
                reason,
                note: "ส่งกลับให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งขออนุมัติใหม่",
              };

      if (action === "approve") await approveItem(item, payload);
      else if (action === "reject") await rejectItem(item, payload);
      else await returnItem(item, payload);

      toast.success(
        action === "approve"
          ? "อนุมัติเรียบร้อย"
          : action === "reject"
            ? "บันทึกการไม่อนุมัติแล้ว"
            : "ตีกลับให้ผู้ยื่นแล้ว",
      );

      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setActingId(null);
    }
  }

  function confirmApprove(item: ApprovalItem) {
    setActionDialog({
      title: "อนุมัติคำขอ",
      description: `อนุมัติ ${typeText[item.type]} ของ ${personName(item.employee)} ใช่ไหม`,
      confirmLabel: "อนุมัติ",
      tone: "emerald",
      onConfirm: async () => {
        await runAction(item, "approve", "");
      },
    });
  }

  function confirmReject(item: ApprovalItem) {
    setActionDialog({
      title: "ไม่อนุมัติคำขอ",
      description: "ระบุเหตุผลที่ไม่อนุมัติ เพื่อให้ผู้ยื่นทราบ",
      reasonLabel: "เหตุผล",
      reasonPlaceholder: "เช่น ข้อมูลไม่ครบ / ไม่ตรงเงื่อนไข",
      requireReason: true,
      confirmLabel: "ไม่อนุมัติ",
      tone: "red",
      onConfirm: async (reason) => {
        await runAction(item, "reject", reason ?? "");
      },
    });
  }

  function confirmReturn(item: ApprovalItem) {
    setActionDialog({
      title: "ตีกลับให้แก้ไข",
      description: "ระบุสิ่งที่ต้องการให้ผู้ยื่นแก้ไข แล้วส่งขออนุมัติใหม่",
      reasonLabel: "หมายเหตุถึงผู้ยื่น",
      reasonPlaceholder: "เช่น แนบเอกสารเพิ่ม / แก้ช่วงเวลา",
      requireReason: true,
      confirmLabel: "ตีกลับ",
      tone: "orange",
      onConfirm: async (reason) => {
        await runAction(item, "return", reason ?? "");
      },
    });
  }

  const activeFilterCount = useMemo(
    () =>
      [search.trim(), dateFrom, dateTo, urgentOnly ? "urgent" : ""].filter(
        Boolean,
      ).length,
    [search, dateFrom, dateTo, urgentOnly],
  );

  const typeTabItems: Array<TabItem<ApprovalRequestKind>> = TYPE_TABS.map(
    (tab) => ({
      key: tab.key,
      label: tab.label,
      count: tab.count(summary),
    }),
  );

  return (
    <>
      {/* ประเภทคำขอเป็นแท็บแบบแคปซูล — โทนเดียวกับหน้า /hr/dashboard ที่ทำใหม่ */}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7 3xl:px-8">
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-slate-100 p-1">
          {typeTabItems.map((item) => {
            const active = item.key === type;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => switchType(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                  active
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {item.label}
                {typeof item.count === "number" && item.count > 0 ? (
                  <span
                    className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums ${
                      active
                        ? "bg-white/25 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {item.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 [&_input]:rounded-full [&_input]:bg-slate-50/80 [&_input:focus]:bg-white">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="เลขที่คำขอ ชื่อ รหัสพนักงาน เหตุผล"
            className="w-full sm:w-72"
            aria-label="ค้นหาคำขอ"
          />

          <IconButton
            title="โหลดข้อมูลใหม่"
            icon={
              loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )
            }
            onClick={() => void loadData()}
          />
        </div>
      </div>

      {/*
       * ตัวกรองอยู่แถวเดียว เรียงตามความกว้างที่แต่ละอันต้องใช้จริง (ไม่ใช่กริด 4 ช่องเท่ากัน)
       *
       * ความกว้างต้องกำหนดที่ div ที่ครอบ ห้ามส่งคลาสไปทับตัวคอนโทรล —
       * ทั้ง Select ของ kit และ ThaiDateInput ต่อคลาสด้วยการ join สตริงเฉย ๆ
       * ไม่ได้ merge แบบ tailwind-merge คลาสเดิมอย่าง `w-full` `rounded-lg` `bg-white`
       * จึงชนะคลาสที่ส่งไปทับ แล้วหน้าตาจะเพี้ยนแบบเดาไม่ถูก
       */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2.5 sm:px-6 3xl:px-7">
        <div className="min-w-[10rem] flex-1">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ApprovalRequestStatusFilter);
              setPage(1);
            }}
            aria-label="สถานะคำขอ"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {/* วันที่สองช่องคือตัวกรองเดียว จึงวางติดกันแล้วคั่นด้วยขีด */}
        <div className="flex min-w-[20rem] flex-[2] items-center gap-1.5">
          <div className="flex-1">
            <ThaiDateInput
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
              placeholder="ตั้งแต่วันที่"
              aria-label="ตั้งแต่วันที่"
            />
          </div>
          <span aria-hidden className="text-[13px] text-slate-300">
            –
          </span>
          <div className="flex-1">
            <ThaiDateInput
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
              placeholder="ถึงวันที่"
              aria-label="ถึงวันที่"
            />
          </div>
        </div>

        {/* ชิปสลับสถานะ ปิดอยู่เป็นเทา เปิดอยู่เป็นเหลืองทั้งใบ จะได้รู้ว่ากรองอยู่หรือเปล่า */}
        <button
          type="button"
          aria-pressed={urgentOnly}
          onClick={() => {
            setUrgentOnly((current) => !current);
            setPage(1);
          }}
          className={joinClassName(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition 3xl:h-10 3xl:text-[13px]",
            urgentOnly
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          เฉพาะเร่งด่วน
          {summary.urgent > 0 ? (
            <span
              className={joinClassName(
                "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 text-[11px] font-bold tabular-nums",
                urgentOnly
                  ? "bg-amber-500 text-white"
                  : "bg-amber-100 text-amber-700",
              )}
            >
              {count(summary.urgent)}
            </span>
          ) : null}
        </button>

        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setUrgentOnly(false);
              setPage(1);
            }}
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            <XCircle className="h-3.5 w-3.5" />
            ล้าง {count(activeFilterCount)}
          </button>
        ) : null}

        <p className="hidden shrink-0 truncate whitespace-nowrap text-[12px] text-slate-500 sm:block 3xl:text-[13px]">
          พบ {count(meta.total)} รายการ
        </p>
      </div>

      {errorText ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="critical">{errorText}</Notice>
        </div>
      ) : null}

      <div className="divide-y divide-slate-200">
        {loading && items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ไม่มีคำขอตามเงื่อนไขที่เลือก
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              ลองเปลี่ยนประเภท สถานะ หรือช่วงวันที่
            </p>
          </div>
        ) : (
          items.map((item) => (
            <RequestCard
              key={`${item.type}-${item.id}`}
              item={item}
              busy={actingId === item.id}
              onApprove={() => confirmApprove(item)}
              onReject={() => confirmReject(item)}
              onReturn={() => confirmReturn(item)}
            />
          ))
        )}
      </div>

      {!loading && items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[13px] text-slate-400">
            แสดง {items.length.toLocaleString("th-TH")} จาก{" "}
            {meta.total.toLocaleString("th-TH")} รายการ · หน้า{" "}
            {meta.page.toLocaleString("th-TH")} จาก{" "}
            {Math.max(1, meta.totalPages).toLocaleString("th-TH")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={page >= meta.totalPages || loading}
              onClick={() => {
                setPage((current) => current + 1);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}


      <ActionDialog
        state={actionDialog}
        loading={actingId !== null}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Detail modal                                                        */
/* ------------------------------------------------------------------ */

/**
 * ใบคำขอหนึ่งใบในรายการ
 * -------------------
 * กางรายละเอียดทั้งหมดไว้ตรงนี้เลย ไม่ต้องเปิดป๊อปอัพ ผู้อนุมัติจึงเห็นเหตุผล
 * ไฟล์หลักฐาน และสายอนุมัติครบก่อนกดปุ่ม — ซึ่งเป็นเหตุผลเดิมที่เคยห้ามไม่ให้มี
 * ปุ่มอนุมัติในแถวตาราง
 *
 * ไม่ใช้การ์ดลอยมีเงา เพราะทั้งหน้าคือผืนขาวผืนเดียว แบ่งใบด้วยเส้นคั่นแทน
 */
function RequestCard({
  item,
  busy,
  onApprove,
  onReject,
  onReturn,
}: {
  item: ApprovalItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReturn: () => void;
}) {
  const rows = detailRows(item);
  const pending = item.status === "SUBMITTED";
  const steps = item.approvalSteps ?? [];
  const logs = item.approvalLogs ?? [];
  const note = str(item.detail?.note);
  const reason = item.reason || str(item.detail?.reason);
  const days = daysPending(item);
  const overdue = pending && days >= URGENT_DAYS;

  /* สังกัดของผู้ยื่น — ผู้อนุมัติระดับ HR ดูใบข้ามแผนก ชื่อคนอย่างเดียวไม่พอ */
  const orgParts = [
    item.employee?.department?.nameTh,
    item.employee?.division?.nameTh,
    item.employee?.branch?.nameTh,
  ].filter(Boolean) as string[];

  /*
   * status = สถานะขั้นของผู้ใช้คนนี้ ส่วน requestStatus = สถานะของใบทั้งใบ
   * สองค่านี้ต่างกันได้ เช่นเราอนุมัติขั้นตัวเองไปแล้วแต่ใบยังรอขั้นถัดไป
   */
  const showRequestStatus =
    !!item.requestStatus && item.requestStatus !== item.status;

  return (
    <article className="px-5 pb-3 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7">
      {/*
       * หัวใบ: ใครยื่น เรื่องอะไร สถานะไหน
       * อยู่บนแถบพื้นฟ้าที่กินเต็มความกว้างของใบ (ระยะขอบติดลบเพื่อล้างระยะของ article)
       * ทำหน้าที่เป็นหัวเรื่องของใบ แยกออกจากเนื้อรายละเอียดด้านล่างชัดเจน
       */}
      <div className="-mx-5 flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-brand-200 bg-brand-100/70 px-5 py-2.5 sm:-mx-6 sm:px-6 3xl:-mx-7 3xl:px-7">
        <Avatar
          name={personName(item.employee)}
          src={employeeAvatarUrl(item.employee)}
          size="md"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="whitespace-nowrap text-[14.5px] font-bold text-slate-900 3xl:text-[15.5px]">
              {personName(item.employee)}
            </p>
            <span
              className={joinClassName(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-[11.5px] font-semibold",
                typeIconColor[item.type] ?? "bg-slate-100 text-slate-500",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                {typeIcon[item.type]}
              </span>
              {typeText[item.type] ?? item.type}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[12px] text-slate-500 3xl:text-[12.5px]">
            {[item.employee?.employeeCode, item.employee?.position, ...orgParts]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge vocabulary={REQUEST_STATUS} status={item.status} />
          {showRequestStatus ? (
            <span className="whitespace-nowrap text-[11px] text-slate-400 3xl:text-[11.5px]">
              สถานะใบ · {statusLabel(REQUEST_STATUS, item.requestStatus)}
            </span>
          ) : null}
          <span
            className={joinClassName(
              "whitespace-nowrap text-[11px] 3xl:text-[11.5px]",
              overdue ? "font-semibold text-amber-600" : "text-slate-400",
            )}
          >
            {overdue
              ? `ค้าง ${count(days)} วัน`
              : `ยื่น ${item.submittedAt ? formatThaiDateTime(item.submittedAt) : "-"}`}
            {item.requestNo ? (
              <span className="tabular-nums text-slate-300"> · {item.requestNo}</span>
            ) : null}
          </span>
        </div>
      </div>

      {/*
       * เนื้อใบสองคอลัมน์บนจอกว้าง — ของคำขออยู่ซ้าย สายอนุมัติกับปุ่มตัดสินใจอยู่ขวา
       * เรียงลงมาชั้นเดียวเมื่อจอแคบ
       *
       * ทุกอย่างฝั่งซ้าย (ช่องรายละเอียด เหตุผล หมายเหตุ หลักฐาน) อยู่ในกริดเดียวกัน
       * ไม่แยกเป็นหลายกริดซ้อนกัน ไม่งั้นแต่ละกริดจะขึ้นแถวใหม่เองแล้วเหลือช่องว่าง
       * ค้างเป็นหย่อม ๆ
       */}
      <div className="mt-3 grid gap-x-6 gap-y-2.5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/*
         * ทุกช่องมีขีดนำหน้า — ข้อความเปล่า ๆ วางลอยบนพื้นว่างอ่านยากว่าอะไรคู่กับอะไร
         * ใช้เส้นแทนการใส่กล่องครอบ เพราะทั้งหน้าต้องเป็นผืนขาวผืนเดียว ห้ามการ์ดซ้อนการ์ด
         */}
        <div className="grid min-w-0 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className={joinClassName(
                "min-w-0 border-l-2 border-slate-200 pl-2.5",
                row.wide ? "sm:col-span-2 xl:col-span-3" : "",
              )}
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {row.label}
              </p>
              <p className="break-words text-[12.5px] font-semibold leading-[18px] text-slate-800 3xl:text-[13px]">
                {row.value || "-"}
              </p>
            </div>
          ))}

          <div className="min-w-0 border-l-2 border-slate-200 pl-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              เหตุผล
            </p>
            <p className="whitespace-pre-line text-[12.5px] leading-[18px] text-slate-700 3xl:text-[13px]">
              {reason || "ไม่ได้ระบุ"}
            </p>
          </div>

          {note !== "-" ? (
            <div className="min-w-0 border-l-2 border-slate-200 pl-2.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                หมายเหตุจากผู้ยื่น
              </p>
              <p className="whitespace-pre-line text-[12.5px] leading-[18px] text-slate-700 3xl:text-[13px]">
                {note}
              </p>
            </div>
          ) : null}

          <div className="min-w-0 border-l-2 border-slate-200 pl-2.5">
            <ApprovalAttachments item={item} />
          </div>
        </div>

        <div className="min-w-0 space-y-2.5 border-t border-slate-100 pt-2.5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          {steps.length > 0 ? (
            <section className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                สายอนุมัติ
              </p>
              <ol className="mt-1 divide-y divide-slate-100">
                {steps.map((step) => (
                  <ApprovalStepRow key={step.id} step={step} />
                ))}
              </ol>
            </section>
          ) : null}

          {/*
           * ประวัติการดำเนินการมากับ API อยู่แล้ว (approvalLogs)
           * ใบที่เคยถูกตีกลับแล้วยื่นใหม่จะได้ดูออกว่ารอบก่อนติดอะไร
           */}
          {logs.length > 0 ? (
            <details className="min-w-0">
              <summary className="cursor-pointer list-none text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 transition hover:text-slate-600">
                ประวัติการดำเนินการ · {count(logs.length)}
              </summary>
              <ol className="mt-2 space-y-2.5">
                {logs.map((log) => (
                  <ApprovalLogRow key={log.id} log={log} />
                ))}
              </ol>
            </details>
          ) : null}

          {/*
           * ปุ่มตัดสินใจอยู่ท้ายคอลัมน์เดียวกับสายอนุมัติ ไม่ได้แยกเป็นแถบเต็มความกว้าง
           * ท้ายใบ — แถบนั้นมีปุ่มกระจุกอยู่ขวาสุดแล้วเหลือที่ว่างยาวทางซ้าย
           * และดันให้ใบสูงขึ้นอีกชั้นโดยไม่ได้ให้ข้อมูลอะไรเพิ่ม
           */}
          {pending ? (
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                onClick={onApprove}
                className="col-span-2 w-full"
              >
                อนุมัติ
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={onReturn}
                className="w-full"
              >
                ตีกลับ
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                icon={<XCircle className="h-3.5 w-3.5" />}
                onClick={onReject}
                className="w-full"
              >
                ไม่อนุมัติ
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

const stepStatusText: Record<string, string> = {
  WAITING: "รอถึงคิว",
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  SKIPPED: "ข้าม",
  CANCELLED: "ยกเลิก",
};

function stepTone(status: string): Tone {
  if (status === "APPROVED") return "positive";
  if (status === "REJECTED") return "critical";
  if (status === "PENDING") return "warning";
  return "neutral";
}

/* ป้ายสถานะของแต่ละขั้นยังต้องมี ใบที่มีผู้อนุมัติหลายขั้นจะได้เห็นว่าติดอยู่ขั้นไหน */
function ApprovalStepRow({ step }: { step: ApprovalStep }) {
  return (
    <li className="flex items-center gap-2.5 py-1">
      <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-slate-300">
        {step.stepNo}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
          {step.nameTh}
        </p>
        {/* ไม่แสดงชื่อผู้อนุมัติในรายการ — ผู้ใช้ต้องการเห็นแค่ขั้นกับสถานะ */}
        {step.actedAt ? (
          <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
            {formatThaiDateTime(step.actedAt)}
          </p>
        ) : null}
        {/* เหตุผลที่ขั้นก่อนหน้าเขียนไว้ คือสิ่งที่ผู้อนุมัติขั้นถัดไปต้องอ่าน */}
        {step.reason || step.note ? (
          <p className="mt-0.5 whitespace-pre-line text-[11px] leading-5 text-slate-500 3xl:text-[12px]">
            {step.reason || step.note}
          </p>
        ) : null}
      </div>
      <Badge tone={stepTone(step.status)}>
        {stepStatusText[step.status] ?? step.status}
      </Badge>
    </li>
  );
}

/** ตีกลับถูกบันทึกเป็น CANCEL ที่พาใบกลับไปเป็นร่าง ไม่ใช่การยกเลิกใบทิ้ง */
function logActionText(log: ApprovalLog) {
  const action = String(log.action ?? "").toUpperCase();

  if (action === "SUBMIT") return "ยื่นคำขอ";
  if (action.includes("APPROVE")) return "อนุมัติ";
  if (action.includes("REJECT")) return "ไม่อนุมัติ";
  if (action === "CANCEL") {
    return log.newStatus === "DRAFT" ? "ตีกลับให้แก้ไข" : "ยกเลิก";
  }

  return action || "-";
}

function ApprovalLogRow({ log }: { log: ApprovalLog }) {
  const actor = log.actedBy?.displayName || log.approvedBy?.displayName || "-";

  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-slate-700 3xl:text-[13px]">
          {logActionText(log)}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
          {formatThaiDateTime(log.createdAt)}
        </span>
      </div>
      <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
        {actor}
      </p>
      {log.reason || log.note ? (
        <p className="mt-0.5 whitespace-pre-line text-[11px] leading-5 text-slate-500 3xl:text-[12px]">
          {log.reason || log.note}
        </p>
      ) : null}
    </li>
  );
}
