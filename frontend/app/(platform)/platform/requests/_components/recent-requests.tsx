"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Paperclip, RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";

import {
  cancelLeaveRequest,
  cancelOffsiteWorkRequest,
  cancelOvertimeRequest,
  cancelTimeAdjustRequest,
  getLeaveRequests,
  getOffsiteWorkRequests,
  getOvertimeRequests,
  getTimeAdjustRequests,
  submitLeaveRequest,
  submitOffsiteWorkRequest,
  submitOvertimeRequest,
  submitTimeAdjustRequest,
  uploadLeaveAttachment,
  uploadOvertimeAttachment,
  uploadTimeAdjustAttachment,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { EmployeeListItem } from "@/types/employee";

import {
  buildAttachmentFormData,
  cn,
  formatClock,
  formatThaiDate,
  formatThaiDateTime,
  num,
  StatusBadge,
} from "./shared";
import { requestDomainQueryKey, type RequestKind } from "./request-kinds";

/*
 * รายการคำขอล่าสุดของพนักงานที่เลือก (เฉพาะประเภทที่เปิดแท็บอยู่)
 * -------------------------------------------------------------
 * ให้ผู้ดูแลเห็นทันทีว่าที่เพิ่งยื่นไปเข้าระบบแล้ว และเก็บตกร่างที่ค้าง —
 * ส่งเข้าคิว / แนบรูปเพิ่ม / ยกเลิก โดยไม่ต้องข้ามไปหน้าศูนย์คำขอ
 *
 * แต่ละประเภทมี API คนละชุด จึงแปลงเป็นแถวรูปแบบเดียวกันก่อนวาด
 */

type Row = {
  id: string;
  requestNo: string;
  status: string;
  title: string;
  detail: string;
  attachmentCount: number;
  createdAt: string;
};

const ADJUST_TYPE_LABEL: Record<string, string> = {
  MISSING_CHECK_IN: "ลืมลงเวลาเข้า",
  MISSING_CHECK_OUT: "ลืมลงเวลาออก",
  WRONG_TIME: "เวลาผิด",
  DEVICE_ERROR: "อุปกรณ์มีปัญหา",
  OUTSIDE_WORK: "ทำงานนอกสถานที่",
  OTHER: "อื่น ๆ",
};

const LOG_TYPE_LABEL: Record<string, string> = {
  CHECK_IN: "เข้างาน",
  CHECK_OUT: "ออกงาน",
  BREAK_START: "เริ่มพัก",
  BREAK_END: "กลับจากพัก",
};

async function fetchRows(kind: RequestKind, employeeId: string): Promise<Row[]> {
  const params = { employeeId, page: 1, pageSize: 8 };

  if (kind === "leave") {
    const response = await getLeaveRequests(params);
    return (response.items ?? []).map((item) => ({
      id: item.id,
      requestNo: item.requestNo ?? "-",
      status: item.status,
      title: item.leaveType?.nameTh ?? "ใบลา",
      detail:
        item.startDate === item.endDate
          ? `${formatThaiDate(item.startDate)} · ${num(item.totalDays)} วัน`
          : `${formatThaiDate(item.startDate)} – ${formatThaiDate(item.endDate)} · ${num(item.totalDays)} วัน`,
      attachmentCount: item.attachments?.length ?? 0,
      createdAt: item.createdAt,
    }));
  }

  if (kind === "overtime") {
    const response = await getOvertimeRequests(params);
    return (response.items ?? []).map((item) => ({
      id: item.id,
      requestNo: item.requestNo ?? "-",
      status: item.status,
      title: `OT ${formatClock(item.startTime)}–${formatClock(item.endTime)}`,
      detail: `${formatThaiDate(item.workDate)} · ${num(item.totalHours)} ชม.`,
      attachmentCount: item.attachments?.length ?? 0,
      createdAt: item.createdAt,
    }));
  }

  if (kind === "time-adjust") {
    const response = await getTimeAdjustRequests(params);
    return (response.items ?? []).map((item) => ({
      id: item.id,
      requestNo: item.requestNo ?? "-",
      status: item.status,
      title: `${ADJUST_TYPE_LABEL[item.adjustType] ?? item.adjustType} · ${LOG_TYPE_LABEL[item.targetLogType] ?? item.targetLogType}`,
      detail: `ขอบันทึกเป็น ${formatThaiDateTime(item.requestedLogTime)}`,
      attachmentCount: item.attachments?.length ?? 0,
      createdAt: item.createdAt,
    }));
  }

  const response = await getOffsiteWorkRequests(params);
  return (response.items ?? []).map((item) => ({
    id: item.id,
    requestNo: item.requestNo ?? "-",
    status: item.status,
    title: `นอกสถานที่ ${formatClock(item.startTime)}–${formatClock(item.endTime)}`,
    detail: `${formatThaiDate(item.workDate)} · ${item.reason}`,
    attachmentCount: item.attachmentUrl ? 1 : 0,
    createdAt: item.createdAt,
  }));
}

const SUBMIT_FN: Record<RequestKind, (id: string) => Promise<unknown>> = {
  leave: submitLeaveRequest,
  overtime: submitOvertimeRequest,
  "time-adjust": submitTimeAdjustRequest,
  offsite: submitOffsiteWorkRequest,
};

const CANCEL_FN: Record<RequestKind, (id: string, reason: string) => Promise<unknown>> = {
  leave: (id, reason) => cancelLeaveRequest(id, { reason }),
  overtime: (id, reason) => cancelOvertimeRequest(id, { reason }),
  "time-adjust": (id, reason) => cancelTimeAdjustRequest(id, { reason }),
  offsite: (id, reason) => cancelOffsiteWorkRequest(id, { reason }),
};

const UPLOAD_FN: Partial<Record<RequestKind, (id: string, form: FormData) => Promise<unknown>>> = {
  leave: uploadLeaveAttachment,
  overtime: uploadOvertimeAttachment,
  "time-adjust": uploadTimeAdjustAttachment,
};

/** สิทธิ์ที่ต้องมีจึงจะยกเลิกได้ ตาม @RequirePermissions ของแต่ละ route */
const CANCEL_PERMISSION: Record<RequestKind, string> = {
  leave: "LEAVE_DELETE",
  overtime: "OT_DELETE",
  "time-adjust": "TIME_ADJUST_CREATE",
  offsite: "OFFSITE_REQUEST_MANAGE",
};

const CANCELLABLE = new Set(["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "HR_APPROVED"]);

/** key ตามโดเมนของแต่ละประเภท — หน้าแม่ invalidate <domain>.all หลังบันทึก รายการนี้จะโหลดใหม่เอง */
export function recentRequestsQueryKey(kind: RequestKind, employeeId: string) {
  const params = { employeeId, picker: "platform-requests" };
  if (kind === "leave") return queryKeys.leave.requests(params);
  if (kind === "overtime") return queryKeys.overtime.requests(params);
  if (kind === "time-adjust") return queryKeys.timeAdjust.requests(params);
  return queryKeys.offsite.requests(params);
}

export function RecentRequests({
  kind,
  employee,
  permissions,
}: {
  kind: RequestKind;
  employee: EmployeeListItem;
  permissions: Set<string>;
}) {
  const queryClient = useQueryClient();
  const [workingId, setWorkingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadId = useRef<string | null>(null);

  const rowsQuery = useApiQuery(
    recentRequestsQueryKey(kind, employee.id),
    () => fetchRows(kind, employee.id),
  );
  const rows = rowsQuery.data ?? [];
  const loading = rowsQuery.isPending || rowsQuery.isFetching;
  const error = rowsQuery.isError
    ? getErrorMessage(rowsQuery.error, "โหลดรายการคำขอไม่สำเร็จ")
    : null;

  /* ส่ง/ยกเลิก/แนบรูป เปลี่ยนสถานะใบ → ล้างทั้งโดเมน ให้หน้าอื่นที่เปิดค้างเห็นตรงกัน */
  async function load() {
    await queryClient.invalidateQueries({ queryKey: requestDomainQueryKey(kind) });
  }

  const canCancel = permissions.has(CANCEL_PERMISSION[kind]);
  const canUpload = Boolean(UPLOAD_FN[kind]);

  async function handleSubmit(row: Row) {
    setWorkingId(row.id);
    try {
      await SUBMIT_FN[kind](row.id);
      toast.success(`ส่ง ${row.requestNo} เข้าคิวอนุมัติแล้ว`);
      await load();
    } catch (submitError) {
      toast.error(getErrorMessage(submitError, "ส่งคำขอไม่สำเร็จ"));
    } finally {
      setWorkingId(null);
    }
  }

  async function handleCancel(row: Row) {
    const reason = window.prompt(`เหตุผลที่ยกเลิก ${row.requestNo}`, "ยกเลิกโดยผู้ดูแลระบบ");
    if (reason === null) return;

    setWorkingId(row.id);
    try {
      await CANCEL_FN[kind](row.id, reason.trim() || "ยกเลิกโดยผู้ดูแลระบบ");
      toast.success(`ยกเลิก ${row.requestNo} แล้ว`);
      await load();
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, "ยกเลิกคำขอไม่สำเร็จ"));
    } finally {
      setWorkingId(null);
    }
  }

  function askForFile(row: Row) {
    pendingUploadId.current = row.id;
    fileInputRef.current?.click();
  }

  async function handleFileChosen(file: File | null) {
    const id = pendingUploadId.current;
    pendingUploadId.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !id) return;

    const upload = UPLOAD_FN[kind];
    if (!upload) return;

    setWorkingId(id);
    try {
      await upload(id, buildAttachmentFormData(file, "หลักฐานประกอบคำขอ", ""));
      toast.success("แนบรูปหลักฐานแล้ว");
      await load();
    } catch (uploadError) {
      toast.error(getErrorMessage(uploadError, "แนบรูปไม่สำเร็จ"));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-900">
          คำขอล่าสุดของพนักงานคนนี้
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          โหลดใหม่
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={kind === "leave" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
        className="hidden"
        onChange={(event) => void handleFileChosen(event.target.files?.[0] ?? null)}
      />

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
          กำลังโหลด...
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          ยังไม่มีคำขอประเภทนี้ของพนักงานคนนี้
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
          {rows.map((row) => {
            const working = workingId === row.id;
            const isDraft = row.status === "DRAFT";
            const cancellable = canCancel && CANCELLABLE.has(row.status);
            const attachable =
              canUpload && (row.status === "DRAFT" || row.status === "SUBMITTED");

            return (
              <li
                key={row.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3",
                  isDraft && "bg-amber-50/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{row.title}</span>
                    <StatusBadge status={row.status} />
                    {row.attachmentCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Paperclip className="h-3 w-3" />
                        {row.attachmentCount}
                      </span>
                    ) : isDraft && canUpload ? (
                      <span className="text-[11px] font-semibold text-amber-600">
                        ยังไม่มีรูปหลักฐาน
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {row.requestNo} · {row.detail}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {working ? (
                    <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  ) : (
                    <>
                      {attachable ? (
                        <button
                          type="button"
                          onClick={() => askForFile(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          แนบรูป
                        </button>
                      ) : null}
                      {isDraft ? (
                        <button
                          type="button"
                          onClick={() => void handleSubmit(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-[11px] font-bold text-white transition hover:bg-violet-700"
                        >
                          <Send className="h-3.5 w-3.5" />
                          ส่ง
                        </button>
                      ) : null}
                      {cancellable ? (
                        <button
                          type="button"
                          onClick={() => void handleCancel(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          ยกเลิก
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
