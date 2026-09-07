"use client";

import { getOvertimeRequests } from "@/lib/api";
import type {
  OvertimeRequest,
  OvertimeRequestListSummary,
} from "@/types/overtime";

import {
  RequestView,
  decimalText,
  formatThaiDate,
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

const workTypeText: Record<string, string> = {
  WORKDAY: "วันทำงาน",
  HOLIDAY: "วันหยุด",
  SPECIAL_HOLIDAY: "วันหยุดพิเศษ",
};

function statusTone(status: string): StatusTone {
  if (status === "APPROVED") return "emerald";
  if (status === "REJECTED") return "rose";
  if (status === "SUBMITTED") return "amber";
  return "slate";
}

export const config: RequestViewConfig<OvertimeRequest, OvertimeRequestListSummary> = {
  chip: "ประวัติคำขอ / OT",
  title: "ประวัติคำขอ OT ทั้งองค์กร",
  description:
    "ตรวจรายการ OT จากทุกบริษัท แยกสถานะ ติดตามขั้นอนุมัติ และตรวจชั่วโมงรวมก่อนเข้าเงินเดือน",
  csvName: "overtime-requests",
  emptyText: "ไม่พบรายการ OT",
  emptySummary: {
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    totalHours: 0,
    approvedHours: 0,
  },
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
      label: "ชั่วโมงที่อนุมัติ",
      helper: "เข้าเงินเดือนได้",
      tone: "emerald",
      value: (s) => `${decimalText(s.approvedHours)} ชม.`,
    },
    {
      label: "ชั่วโมงรวม",
      helper: "รวมทุกสถานะ",
      tone: "violet",
      value: (s) => `${decimalText(s.totalHours)} ชม.`,
    },
  ],
  extraFilters: [
    {
      key: "workType",
      label: "ประเภทวันทำงาน",
      allLabel: "ทุกประเภทวันทำงาน",
      options: Object.entries(workTypeText).map(([value, label]) => ({
        value,
        label,
      })),
    },
  ],
  fetchList: (params) => getOvertimeRequests(params as never),
  columns: [
    {
      header: "วันที่ทำงาน",
      render: (item) => formatThaiDate(item.workDate),
      csvValue: (item) => formatThaiDate(item.workDate),
    },
    {
      header: "ช่วงเวลา",
      render: (item) => (
        <>
          {timeText(item.startTime)} – {timeText(item.endTime)}
          {item.breakMinutes ? (
            <p className="mt-0.5 text-xs text-slate-500">
              พัก {item.breakMinutes} นาที
            </p>
          ) : null}
        </>
      ),
      csvValue: (item) => `${timeText(item.startTime)}-${timeText(item.endTime)}`,
    },
    {
      header: "ชั่วโมง",
      render: (item) => (
        <span className="font-semibold text-slate-800">
          {decimalText(item.totalHours)} ชม.
        </span>
      ),
      csvValue: (item) => `${decimalText(item.totalHours)} ชม.`,
    },
    {
      header: "ประเภทวัน",
      render: (item) => workTypeText[item.workType] ?? item.workType,
      csvValue: (item) => workTypeText[item.workType] ?? item.workType,
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
    { label: "วันที่ทำงาน", value: formatThaiDate(item.workDate) },
    {
      label: "ช่วงเวลา",
      value: `${timeText(item.startTime)} – ${timeText(item.endTime)}`,
    },
    { label: "เวลาพัก", value: `${item.breakMinutes ?? 0} นาที` },
    { label: "ชั่วโมงรวม", value: `${decimalText(item.totalHours)} ชม.` },
    {
      label: "ประเภทวันทำงาน",
      value: workTypeText[item.workType] ?? item.workType,
    },
  ],
  getAttachmentSource: (item) =>
    item.attachments?.length
      ? {
          id: item.id,
          type: "OVERTIME" as const,
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

export function OvertimeTab({ override, ...props }: HistoryTabProps & {
  /** ทับค่าบางส่วนของ config เช่นเปลี่ยน endpoint เป็นฝั่ง /manager/* */
  override?: Partial<RequestViewConfig<OvertimeRequest, OvertimeRequestListSummary>>;
}) {
  const merged = override ? { ...config, ...override } : config;

  return <RequestView config={merged} {...props} />;
}
