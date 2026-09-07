"use client";

import { getTimeAdjustRequests } from "@/lib/api";
import type {
  TimeAdjustRequest,
  TimeAdjustRequestListSummary,
} from "@/types/time-adjust";

import {
  RequestView,
  formatThaiDateTime,
  timeText,
  type HistoryTabProps,
  type RequestViewConfig,
  type StatusTone,
} from "./request-view";

const statusText: Record<string, string> = {
  DRAFT: "ร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิก",
};

const adjustTypeText: Record<string, string> = {
  MISSING_CHECK_IN: "ลืมลงเวลาเข้า",
  MISSING_CHECK_OUT: "ลืมลงเวลาออก",
  WRONG_TIME: "เวลาผิด",
  DEVICE_ERROR: "เครื่องขัดข้อง",
  OUTSIDE_WORK: "ทำงานนอกสถานที่",
  OTHER: "อื่น ๆ",
};

const logTypeText: Record<string, string> = {
  CHECK_IN: "เวลาเข้า",
  CHECK_OUT: "เวลาออก",
  BREAK_START: "เริ่มพัก",
  BREAK_END: "กลับจากพัก",
};

function statusTone(status: string): StatusTone {
  if (status === "APPROVED") return "emerald";
  if (status === "REJECTED") return "rose";
  if (status === "SUBMITTED") return "amber";
  return "slate";
}

const config: RequestViewConfig<
  TimeAdjustRequest,
  TimeAdjustRequestListSummary
> = {
  chip: "ประวัติคำขอ / ขอแก้เวลา",
  title: "ประวัติคำขอแก้เวลาทั้งองค์กร",
  description:
    "ตรวจคำขอแก้เวลาเข้า-ออกงาน เทียบเวลาเดิมกับเวลาที่ขอแก้ พร้อมเหตุผลและขั้นตอนอนุมัติ",
  csvName: "time-adjust-requests",
  emptyText: "ไม่พบคำขอแก้เวลา",
  emptySummary: {
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    missingCheckIn: 0,
    missingCheckOut: 0,
    missingPunch: 0,
    wrongTime: 0,
    deviceError: 0,
    outsideWork: 0,
    other: 0,
    checkIn: 0,
  } as TimeAdjustRequestListSummary,
  /* ไม่ให้เลือก "ร่าง" — ศูนย์คำขอไม่แสดงใบที่ยังไม่ได้ยื่น เลือกได้ก็จะไม่เจออะไร */
  statusOptions: Object.entries(statusText)
    .filter(([value]) => value !== "DRAFT")
    .map(([value, label]) => ({
      value,
      label,
    })),
  statusText,
  statusTone,
  metrics: [
    {
      label: "คำขอทั้งหมด",
      helper: "ตามตัวกรองปัจจุบัน",
      tone: "sky",
      value: (s) => s.total,
    },
    {
      label: "รออนุมัติ",
      helper: "ต้องติดตาม",
      tone: "amber",
      value: (s) => s.submitted,
    },
    {
      label: "อนุมัติแล้ว",
      helper: "แก้เวลาเรียบร้อย",
      tone: "emerald",
      value: (s) => s.approved,
    },
    {
      label: "ลืมลงเวลา",
      helper: "เข้า + ออก",
      tone: "violet",
      value: (s) => (s.missingCheckIn ?? 0) + (s.missingCheckOut ?? 0),
    },
  ],
  extraFilters: [
    {
      key: "adjustType",
      label: "สาเหตุที่ขอแก้",
      allLabel: "ทุกสาเหตุที่ขอแก้",
      options: Object.entries(adjustTypeText).map(([value, label]) => ({
        value,
        label,
      })),
    },
  ],
  fetchList: (params) => getTimeAdjustRequests(params as never),
  columns: [
    {
      header: "สาเหตุ",
      render: (item) => adjustTypeText[item.adjustType] ?? item.adjustType,
      csvValue: (item) => adjustTypeText[item.adjustType] ?? item.adjustType,
    },
    {
      header: "ช่วงเวลา",
      render: (item) => logTypeText[item.targetLogType] ?? item.targetLogType,
      csvValue: (item) => logTypeText[item.targetLogType] ?? item.targetLogType,
    },
    {
      header: "เวลาเดิม → เวลาที่ขอ",
      render: (item) => (
        <>
          <span className="text-slate-400 line-through">
            {item.originalLogTime ? timeText(item.originalLogTime) : "ไม่มี"}
          </span>
          <span className="mx-1.5 text-slate-400">→</span>
          <span className="font-semibold text-sky-700">
            {timeText(item.requestedLogTime)}
          </span>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatThaiDateTime(item.requestedLogTime)}
          </p>
        </>
      ),
      csvValue: (item) =>
        `${item.originalLogTime ? timeText(item.originalLogTime) : "ไม่มี"} -> ${timeText(item.requestedLogTime)}`,
    },
    {
      header: "เหตุผล",
      render: (item) => (
        <span className="line-clamp-2 max-w-xs">{item.reason || "-"}</span>
      ),
      csvValue: (item) => item.reason ?? "",
    },
  ],
  detailRows: (item) => [
    {
      label: "สาเหตุที่ขอแก้",
      value: adjustTypeText[item.adjustType] ?? item.adjustType,
    },
    {
      label: "แก้เวลาช่วง",
      value: logTypeText[item.targetLogType] ?? item.targetLogType,
    },
    {
      label: "เวลาเดิม",
      value: item.originalLogTime
        ? formatThaiDateTime(item.originalLogTime)
        : "ไม่มีข้อมูลเดิม",
    },
    {
      label: "เวลาที่ขอแก้",
      value: formatThaiDateTime(item.requestedLogTime),
    },
  ],
  getAttachmentSource: (item) =>
    item.attachments?.length
      ? {
          id: item.id,
          type: "TIME_ADJUST" as const,
          detail: { attachments: item.attachments },
        }
      : null,
  getId: (item) => item.id,
  getRequestNo: (item) => item.requestNo ?? item.id.slice(0, 8),
  getEmployee: (item) => item.employee as never,
  getStatus: (item) => item.status,
  getReason: (item) => item.reason,
  getSubmittedAt: (item) => item.submittedAt,
  getApprover: (item) => item.approvedBy?.displayName ?? null,
};

export function TimeAdjustTab({ override, ...props }: HistoryTabProps & {
  /** ทับค่าบางส่วนของ config เช่นเปลี่ยน endpoint เป็นฝั่ง /manager/* */
  override?: Partial<RequestViewConfig<TimeAdjustRequest, TimeAdjustRequestListSummary>>;
}) {
  const merged = override ? { ...config, ...override } : config;

  return <RequestView config={merged} {...props} />;
}
