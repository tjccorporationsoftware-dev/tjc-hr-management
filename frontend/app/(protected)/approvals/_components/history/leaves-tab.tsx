"use client";

import { getLeaveRequests } from "@/lib/api";
import type { LeaveRequest, LeaveRequestListSummary } from "@/types/leave";

import {
  RequestView,
  decimalText,
  formatThaiDate,
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

const dayTypeText: Record<string, string> = {
  FULL_DAY: "เต็มวัน",
  HALF_DAY_MORNING: "ครึ่งวันเช้า",
  HALF_DAY_AFTERNOON: "ครึ่งวันบ่าย",
  HOURLY: "รายชั่วโมง",
};

function statusTone(status: string): StatusTone {
  if (status === "APPROVED") return "emerald";
  if (status === "REJECTED") return "rose";
  if (status === "SUBMITTED") return "amber";
  return "slate";
}

function dateRange(item: LeaveRequest) {
  const from = formatThaiDate(item.startDate);
  const to = formatThaiDate(item.endDate);

  return from === to ? from : `${from} – ${to}`;
}

export const config: RequestViewConfig<LeaveRequest, LeaveRequestListSummary> = {
  chip: "ประวัติคำขอ / การลา",
  title: "ประวัติการลาทั้งองค์กร",
  description:
    "ตรวจรายการใบลาจากทุกบริษัท แยกสถานะ ติดตามผู้อนุมัติ และดูผลกระทบต่อการลงเวลาและเงินเดือน",
  csvName: "leave-requests",
  emptyText: "ไม่พบรายการใบลา",
  emptySummary: {
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    totalDays: 0,
    onLeaveToday: 0,
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
      label: "ใบลาทั้งหมด",
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
      helper: "ผ่านการอนุมัติ",
      tone: "emerald",
      value: (s) => s.approved,
    },
    {
      label: "ลาวันนี้",
      helper: "อยู่ในช่วงลา",
      tone: "violet",
      value: (s) => s.onLeaveToday,
    },
  ],
  extraFilters: [
    {
      key: "attachmentStatus",
      label: "เอกสารแนบ",
      allLabel: "ทุกสถานะเอกสารแนบ",
      options: [
        { value: "HAS_ATTACHMENT", label: "มีเอกสารแนบ" },
        { value: "NO_ATTACHMENT", label: "ไม่มีเอกสารแนบ" },
        { value: "MISSING_REQUIRED", label: "ขาดเอกสารที่บังคับ" },
      ],
    },
  ],
  fetchList: (params) => getLeaveRequests(params as never),
  columns: [
    {
      header: "ประเภทการลา",
      render: (item) => item.leaveType?.nameTh ?? "-",
      csvValue: (item) => item.leaveType?.nameTh ?? "",
    },
    {
      header: "ช่วงวันที่ลา",
      render: (item) => (
        <>
          {dateRange(item)}
          <p className="mt-0.5 text-xs text-slate-500">
            {dayTypeText[item.dayType] ?? item.dayType}
          </p>
        </>
      ),
      csvValue: (item) => dateRange(item),
    },
    {
      header: "จำนวน",
      render: (item) => (
        <span className="font-semibold text-slate-800">
          {decimalText(item.totalDays)} วัน
        </span>
      ),
      csvValue: (item) => `${decimalText(item.totalDays)} วัน`,
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
    { label: "ประเภทการลา", value: item.leaveType?.nameTh ?? "-" },
    { label: "ช่วงวันที่", value: dateRange(item) },
    { label: "ลักษณะการลา", value: dayTypeText[item.dayType] ?? item.dayType },
    { label: "จำนวนวัน", value: `${decimalText(item.totalDays)} วัน` },
    { label: "ลาย้อนหลัง", value: item.isRetroactive ? "ใช่" : "ไม่ใช่" },
    {
      label: "ต้องแก้เงินเดือน",
      value: item.requiresPayrollCorrection ? "ต้องแก้" : "ไม่ต้อง",
    },
    { label: "ผู้ติดต่อระหว่างลา", value: item.contactInfo || "-" },
  ],
  getAttachmentSource: (item) =>
    item.attachments?.length
      ? {
          id: item.id,
          type: "LEAVE" as const,
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

export function LeavesTab({ override, ...props }: HistoryTabProps & {
  /** ทับค่าบางส่วนของ config เช่นเปลี่ยน endpoint เป็นฝั่ง /manager/* */
  override?: Partial<RequestViewConfig<LeaveRequest, LeaveRequestListSummary>>;
}) {
  const merged = override ? { ...config, ...override } : config;

  return <RequestView config={merged} {...props} />;
}
