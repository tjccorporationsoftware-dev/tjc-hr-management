"use client";

import { getOffsiteWorkRequests } from "@/lib/api";
import type {
  OffsiteWorkRequest,
  OffsiteWorkRequestListSummary,
} from "@/types/offsite-work";

import {
  RequestView,
  formatThaiDate,
  timeText,
  type HistoryTabProps,
  type RequestViewConfig,
  type StatusTone,
} from "./request-view";

const statusText: Record<string, string> = {
  DRAFT: "ร่าง",
  SUBMITTED: "รออนุมัติ",
  MANAGER_APPROVED: "หัวหน้าอนุมัติแล้ว",
  HR_APPROVED: "HR อนุมัติแล้ว",
  APPROVED: "อนุมัติแล้ว",
  MANAGER_REJECTED: "หัวหน้าไม่อนุมัติ",
  HR_REJECTED: "HR ไม่อนุมัติ",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิก",
};

const locationTypeText: Record<string, string> = {
  OFFICE: "สำนักงาน",
  BRANCH: "สาขา",
  SITE: "ไซต์งาน",
  CUSTOMER_SITE: "สถานที่ลูกค้า",
  WFH: "ทำงานที่บ้าน",
  REMOTE: "ทำงานทางไกล",
  TEMPORARY_SITE: "สถานที่ชั่วคราว",
  OTHER: "อื่น ๆ",
};

function statusTone(status: string): StatusTone {
  if (status === "APPROVED" || status === "HR_APPROVED") return "emerald";
  if (status.includes("REJECTED")) return "rose";
  if (status === "SUBMITTED" || status === "MANAGER_APPROVED") return "amber";
  return "slate";
}

const config: RequestViewConfig<
  OffsiteWorkRequest,
  OffsiteWorkRequestListSummary
> = {
  chip: "ประวัติคำขอ / นอกสถานที่",
  title: "ประวัติคำขอทำงานนอกสถานที่",
  description:
    "ตรวจวันที่ ช่วงเวลา สถานที่ เหตุผล หลักฐาน และขั้นตอนอนุมัติของคำขอทำงานนอกสถานที่ทั้งองค์กร",
  csvName: "offsite-requests",
  emptyText: "ไม่พบคำขอทำงานนอกสถานที่",
  emptySummary: {
    total: 0,
    draft: 0,
    submitted: 0,
    managerApproved: 0,
    hrApproved: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  } as OffsiteWorkRequestListSummary,
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
      helper: "ยังไม่ครบขั้นตอน",
      tone: "amber",
      value: (s) => s.pending ?? s.submitted,
    },
    {
      label: "อนุมัติแล้ว",
      helper: "ผ่านครบทุกขั้น",
      tone: "emerald",
      value: (s) => s.approved,
    },
    {
      label: "ไม่อนุมัติ",
      helper: "ถูกปฏิเสธ",
      tone: "violet",
      value: (s) => s.rejected,
    },
  ],
  extraFilters: [
    {
      key: "locationType",
      label: "ประเภทสถานที่",
      allLabel: "ทุกประเภทสถานที่",
      options: Object.entries(locationTypeText).map(([value, label]) => ({
        value,
        label,
      })),
    },
  ],
  fetchList: (params) => getOffsiteWorkRequests(params as never),
  columns: [
    {
      header: "วันที่ทำงาน",
      render: (item) => formatThaiDate(item.workDate),
      csvValue: (item) => formatThaiDate(item.workDate),
    },
    {
      header: "ช่วงเวลา",
      render: (item) => `${timeText(item.startTime)} – ${timeText(item.endTime)}`,
      csvValue: (item) =>
        `${timeText(item.startTime)}-${timeText(item.endTime)}`,
    },
    {
      header: "สถานที่",
      render: (item) => (
        <>
          {item.locationName || "-"}
          <p className="mt-0.5 text-xs text-slate-500">
            {item.locationType
              ? (locationTypeText[item.locationType] ?? item.locationType)
              : "ไม่ระบุประเภท"}
          </p>
        </>
      ),
      csvValue: (item) => item.locationName ?? "",
    },
    {
      header: "หลักฐาน",
      render: (item) =>
        item.attachmentUrl ? (
          <span className="font-semibold text-emerald-700">มีหลักฐาน</span>
        ) : (
          <span className="text-slate-400">ไม่มี</span>
        ),
      csvValue: (item) => (item.attachmentUrl ? "มีหลักฐาน" : "ไม่มี"),
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
    { label: "สถานที่", value: item.locationName || "-" },
    {
      label: "ประเภทสถานที่",
      value: item.locationType
        ? (locationTypeText[item.locationType] ?? item.locationType)
        : "-",
    },
    { label: "ที่อยู่", value: item.address || "-" },
  ],
  getAttachmentSource: (item) =>
    item.attachmentUrl
      ? {
          id: item.id,
          type: "OFFSITE",
          detail: { attachmentUrl: item.attachmentUrl },
        }
      : null,
  getId: (item) => item.id,
  getRequestNo: (item) => item.requestNo ?? item.id.slice(0, 8),
  getEmployee: (item) => (item.employee ?? null) as never,
  getStatus: (item) => item.status,
  getReason: (item) => item.reason,
  getSubmittedAt: (item) => item.submittedAt,
  getApprover: (item) => item.approvedBy?.displayName ?? null,
};

export function OffsiteTab({ override, ...props }: HistoryTabProps & {
  /** ทับค่าบางส่วนของ config เช่นเปลี่ยน endpoint เป็นฝั่ง /manager/* */
  override?: Partial<RequestViewConfig<OffsiteWorkRequest, OffsiteWorkRequestListSummary>>;
}) {
  const merged = override ? { ...config, ...override } : config;

  return <RequestView config={merged} {...props} />;
}
