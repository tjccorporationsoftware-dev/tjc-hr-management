"use client";

import { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createTimeAdjustRequest,
  getTimeAdjustAttendanceLogs,
  submitTimeAdjustRequest,
  uploadTimeAdjustAttachment,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { EmployeeListItem } from "@/types/employee";
import type { AttendanceLogType, TimeAdjustType } from "@/types/time-adjust";

import {
  buildAttachmentFormData,
  cn,
  EvidencePicker,
  Field,
  FormActions,
  formatClock,
  INPUT_CLASS,
  ON_BEHALF_NOTE,
  PillOption,
  TEXTAREA_CLASS,
  toBangkokISO,
  todayISODate,
} from "./shared";

/*
 * ฟอร์มยื่นคำขอแก้เวลาแทนพนักงาน
 * ------------------------------
 * - "ทำงานนอกสถานที่" ไม่อยู่ในนี้ เพราะเป็นคนละใบ (ดูแท็บ นอกสถานที่)
 * - แบบ "เวลาผิด" หลังบ้านจะไปหารอยสแกนเดิมของวันนั้นให้เอง ไม่ต้องเลือกจากหน้านี้
 *   แต่โชว์รอยสแกนของวันนั้นให้ผู้ดูแลเห็นก่อนกรอก จะได้ไม่ยื่นเวลาที่มีอยู่แล้ว
 * - หลังบ้านบังคับแนบรูปก่อนส่ง จึง สร้างร่าง → แนบรูป → ส่ง
 */

const ADJUST_TYPES: Array<{ value: Exclude<TimeAdjustType, "OUTSIDE_WORK">; label: string; helper: string }> = [
  { value: "MISSING_CHECK_IN", label: "ลืมลงเวลาเข้า", helper: "ไม่มีรอยสแกนเข้างาน" },
  { value: "MISSING_CHECK_OUT", label: "ลืมลงเวลาออก", helper: "ไม่มีรอยสแกนออกงาน" },
  { value: "WRONG_TIME", label: "เวลาผิด", helper: "มีรอยสแกนแต่เวลาคลาดเคลื่อน" },
  { value: "DEVICE_ERROR", label: "อุปกรณ์มีปัญหา", helper: "เครื่องสแกนหรือระบบขัดข้อง" },
  { value: "OTHER", label: "อื่น ๆ", helper: "ระบุในเหตุผล" },
];

const TARGETS: Array<{ value: AttendanceLogType; label: string; defaultTime: string }> = [
  { value: "CHECK_IN", label: "เวลาเข้างาน", defaultTime: "08:00" },
  { value: "CHECK_OUT", label: "เวลาออกงาน", defaultTime: "17:00" },
  { value: "BREAK_START", label: "เริ่มพัก", defaultTime: "12:00" },
  { value: "BREAK_END", label: "กลับจากพัก", defaultTime: "13:00" },
];

const LOG_TYPE_LABEL: Record<string, string> = {
  CHECK_IN: "เข้างาน",
  CHECK_OUT: "ออกงาน",
  BREAK_START: "เริ่มพัก",
  BREAK_END: "กลับจากพัก",
};

type TimeAdjustFormState = {
  adjustType: Exclude<TimeAdjustType, "OUTSIDE_WORK">;
  targetLogType: AttendanceLogType;
  date: string;
  time: string;
  reason: string;
  note: string;
};

function defaultForm(): TimeAdjustFormState {
  return {
    adjustType: "MISSING_CHECK_IN",
    targetLogType: "CHECK_IN",
    date: todayISODate(),
    time: "08:00",
    reason: "",
    note: ON_BEHALF_NOTE,
  };
}

/** เลือกประเภทแล้วเดาช่องเป้าหมายให้ (ลืมเข้า → เข้างาน, ลืมออก → ออกงาน) */
function inferTarget(adjustType: TimeAdjustFormState["adjustType"]): AttendanceLogType | null {
  if (adjustType === "MISSING_CHECK_IN") return "CHECK_IN";
  if (adjustType === "MISSING_CHECK_OUT") return "CHECK_OUT";
  return null;
}

export function TimeAdjustForm({
  employee,
  onSaved,
}: {
  employee: EmployeeListItem;
  onSaved: () => void;
}) {
  // mount ใหม่ด้วย key={employee.id} จากหน้าแม่ → เปลี่ยนคนแล้วฟอร์มว่างเสมอ
  const [form, setForm] = useState<TimeAdjustFormState>(defaultForm);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);

  /* รอยสแกนของวันนั้น — ให้เห็นก่อนว่าระบบมีอะไรอยู่แล้ว (โหลดไม่ได้ก็แค่ไม่โชว์) */
  const logsQuery = useApiQuery(
    queryKeys.attendance.logs({
      employeeId: employee.id,
      dateFrom: form.date,
      dateTo: form.date,
      picker: "platform-requests",
    }),
    () =>
      getTimeAdjustAttendanceLogs({
        employeeId: employee.id,
        dateFrom: form.date,
        dateTo: form.date,
        pageSize: 50,
      }),
    { enabled: Boolean(form.date), retry: false },
  );
  const logs = logsQuery.data?.items ?? [];
  const loadingLogs = Boolean(form.date) && logsQuery.isPending;

  function update<K extends keyof TimeAdjustFormState>(key: K, value: TimeAdjustFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseAdjustType(adjustType: TimeAdjustFormState["adjustType"]) {
    setForm((current) => {
      const inferred = inferTarget(adjustType);
      const targetLogType = inferred ?? current.targetLogType;
      const target = TARGETS.find((item) => item.value === targetLogType);
      return {
        ...current,
        adjustType,
        targetLogType,
        time: inferred && target ? target.defaultTime : current.time,
      };
    });
  }

  function validate(shouldSubmit: boolean) {
    if (!form.date) return "กรุณาเลือกวันที่";
    if (!/^\d{2}:\d{2}$/.test(form.time)) return "กรุณาระบุเวลาที่ต้องการให้บันทึก";
    if (!form.reason.trim()) return "กรุณาระบุเหตุผล";
    if (shouldSubmit && !evidenceFile) {
      return "คำขอแก้เวลาต้องแนบรูปหลักฐานก่อนส่งเข้าคิวอนุมัติ";
    }
    return "";
  }

  async function save(shouldSubmit: boolean) {
    const message = validate(shouldSubmit);
    if (message) {
      toast.error(message);
      return;
    }

    setSaving(shouldSubmit ? "submit" : "draft");
    try {
      const created = await createTimeAdjustRequest({
        employeeId: employee.id,
        adjustType: form.adjustType,
        targetLogType: form.targetLogType,
        requestedLogTime: toBangkokISO(form.date, form.time),
        reason: form.reason.trim(),
        note: form.note.trim() || undefined,
        submit: false,
      });

      if (evidenceFile) {
        await uploadTimeAdjustAttachment(
          created.id,
          buildAttachmentFormData(evidenceFile, "หลักฐานคำขอแก้เวลา", form.reason),
        );
      }

      if (shouldSubmit) {
        try {
          await submitTimeAdjustRequest(created.id);
        } catch (submitError) {
          toast.warning(
            `บันทึกร่างคำขอแก้เวลา ${created.requestNo ?? ""} แล้ว แต่ส่งเข้าคิวไม่สำเร็จ: ${getErrorMessage(
              submitError,
              "ส่งไม่สำเร็จ",
            )}`,
          );
          onSaved();
          return;
        }
      }

      toast.success(
        shouldSubmit
          ? `ส่งคำขอแก้เวลา ${created.requestNo ?? ""} เข้าคิวอนุมัติแล้ว`
          : `บันทึกร่างคำขอแก้เวลา ${created.requestNo ?? ""} แล้ว`,
      );
      setForm((current) => ({ ...defaultForm(), date: current.date }));
      setEvidenceFile(null);
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "บันทึกคำขอแก้เวลาไม่สำเร็จ"));
    } finally {
      setSaving(null);
    }
  }

  const selectedAdjust = ADJUST_TYPES.find((item) => item.value === form.adjustType);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-slate-500">ประเภทการแก้ไข</span>
        <div className="flex flex-wrap gap-2">
          {ADJUST_TYPES.map((option) => (
            <PillOption
              key={option.value}
              active={form.adjustType === option.value}
              onClick={() => chooseAdjustType(option.value)}
              title={option.helper}
            >
              {option.label}
            </PillOption>
          ))}
        </div>
        {selectedAdjust ? (
          <p className="text-[11px] text-slate-400">{selectedAdjust.helper}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-slate-500">ช่องเวลาที่ต้องการแก้</span>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((option) => (
            <PillOption
              key={option.value}
              active={form.targetLogType === option.value}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  targetLogType: option.value,
                  time: option.defaultTime,
                }))
              }
            >
              {option.label}
            </PillOption>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.6fr]">
        <Field label="วันที่" required>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={form.date}
              max={todayISODate()}
              onChange={(event) => update("date", event.target.value)}
              className={cn(INPUT_CLASS, "pl-9")}
            />
          </span>
        </Field>
        <Field label="เวลาที่ต้องการให้บันทึก" required>
          <input
            type="time"
            value={form.time}
            onChange={(event) => update("time", event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">
            รอยสแกนที่มีอยู่ในระบบวันนั้น
          </span>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-2xl border border-dashed border-slate-200 px-3 py-2">
            {loadingLogs ? (
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            ) : logsQuery.isError ? (
              <span className="text-xs text-rose-500">ดูรอยสแกนไม่ได้ (ยังยื่นคำขอได้ตามปกติ)</span>
            ) : logs.length === 0 ? (
              <span className="text-xs text-slate-400">ไม่มีรอยสแกน</span>
            ) : (
              logs.map((log) => (
                <span
                  key={log.id}
                  className={cn(
                    "rounded-lg px-2 py-0.5 text-[11px] font-semibold",
                    log.logType === form.targetLogType
                      ? "bg-violet-100 text-violet-700"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {LOG_TYPE_LABEL[log.logType] ?? log.logType} {formatClock(log.logTime)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="เหตุผล" required className="md:col-span-2">
          <textarea
            rows={2}
            value={form.reason}
            onChange={(event) => update("reason", event.target.value)}
            placeholder="เช่น เครื่องสแกนเสีย พนักงานแจ้งหัวหน้าแล้วตอน 08:05"
            className={TEXTAREA_CLASS}
          />
        </Field>
        <Field label="หมายเหตุถึงผู้อนุมัติ" className="md:col-span-2">
          <input
            type="text"
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <EvidencePicker
        file={evidenceFile}
        onChange={setEvidenceFile}
        accept="image/jpeg,image/png,application/pdf"
        required
        hint="บังคับแนบก่อนส่งเข้าคิว (ร่างยังบันทึกได้โดยไม่มีรูป) รองรับ JPG / PNG / PDF ไม่เกิน 10 MB"
      />

      <FormActions
        saving={saving}
        onSaveDraft={() => void save(false)}
        onSubmit={() => void save(true)}
      />
    </div>
  );
}
