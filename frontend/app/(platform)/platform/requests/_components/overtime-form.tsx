"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Loader2, Sun, Sunset } from "lucide-react";
import { toast } from "sonner";

import {
  createOvertimeRequest,
  getOvertimeDayType,
  submitOvertimeRequest,
  uploadOvertimeAttachment,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { EmployeeListItem } from "@/types/employee";

import {
  buildAttachmentFormData,
  cn,
  EvidencePicker,
  Field,
  FormActions,
  INPUT_CLASS,
  minutesFromTime,
  num,
  ON_BEHALF_NOTE,
  TEXTAREA_CLASS,
  todayISODate,
} from "./shared";

/*
 * ฟอร์มยื่นคำขอ OT แทนพนักงาน
 * ---------------------------
 * - ประเภทวัน (วันทำงาน/วันหยุด) ระบบตัดสินจากปฏิทินของพนักงานคนนั้น ไม่ให้เลือกเอง
 * - หลังบ้านบังคับว่าใบที่ส่งเข้าคิวต้องมีรูปหลักฐาน จึงต้อง สร้างร่าง → แนบรูป → ส่ง
 * - ส่งเวลาเป็น HH:mm ให้หลังบ้านจับคู่กับ workDate เอง (รองรับ OT ข้ามเที่ยงคืน)
 */

const PRESETS = [
  { label: "หลังเลิกงาน 17:30-19:30", startTime: "17:30", endTime: "19:30", breakMinutes: "0" },
  { label: "กะเย็น 18:00-20:00", startTime: "18:00", endTime: "20:00", breakMinutes: "0" },
  { label: "วันหยุดเต็มวัน 08:00-17:00", startTime: "08:00", endTime: "17:00", breakMinutes: "60" },
];

type OvertimeFormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  reason: string;
  note: string;
};

function defaultForm(): OvertimeFormState {
  return {
    workDate: todayISODate(),
    startTime: "17:30",
    endTime: "19:30",
    breakMinutes: "0",
    reason: "",
    note: ON_BEHALF_NOTE,
  };
}

/** นาทีสุทธิ — ถ้าเวลาจบน้อยกว่าเริ่ม ถือว่าข้ามเที่ยงคืน */
function computeDuration(form: OvertimeFormState) {
  const start = minutesFromTime(form.startTime);
  const end = minutesFromTime(form.endTime);
  if (start === null || end === null) {
    return { raw: 0, net: 0, crossesMidnight: false };
  }
  const crossesMidnight = end <= start;
  const raw = crossesMidnight ? end + 24 * 60 - start : end - start;
  const breakMinutes = Math.max(0, Number(form.breakMinutes || 0));
  return { raw, net: Math.max(0, raw - breakMinutes), crossesMidnight };
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} ชม. ${rest} นาที`;
  if (hours) return `${hours} ชม.`;
  return `${rest} นาที`;
}

export function OvertimeForm({
  employee,
  onSaved,
}: {
  employee: EmployeeListItem;
  onSaved: () => void;
}) {
  // mount ใหม่ด้วย key={employee.id} จากหน้าแม่ → เปลี่ยนคนแล้วฟอร์มว่างเสมอ
  const [form, setForm] = useState<OvertimeFormState>(defaultForm);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);

  /* ถามประเภทวันใหม่ทุกครั้งที่เปลี่ยนวันหรือเปลี่ยนคน */
  const dayTypeQuery = useApiQuery(
    queryKeys.overtime.dayType({ workDate: form.workDate, employeeId: employee.id }),
    () => getOvertimeDayType({ workDate: form.workDate, employeeId: employee.id }),
    { enabled: Boolean(form.workDate), staleTime: 60_000 },
  );
  const dayType = dayTypeQuery.data ?? null;
  const loadingDayType = Boolean(form.workDate) && dayTypeQuery.isPending;
  const dayTypeError = dayTypeQuery.isError
    ? getErrorMessage(dayTypeQuery.error, "ตรวจประเภทวันจากปฏิทินไม่สำเร็จ")
    : null;

  const duration = useMemo(() => computeDuration(form), [form]);
  const breakTooLong = Number(form.breakMinutes || 0) > duration.raw;

  function update<K extends keyof OvertimeFormState>(key: K, value: OvertimeFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(shouldSubmit: boolean) {
    if (!form.workDate) return "กรุณาเลือกวันที่ทำ OT";
    if (minutesFromTime(form.startTime) === null || minutesFromTime(form.endTime) === null) {
      return "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด";
    }
    if (duration.raw <= 0) return "ช่วงเวลาทำ OT ไม่ถูกต้อง";
    const breakMinutes = Number(form.breakMinutes || 0);
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480) {
      return "เวลาพักต้องเป็นจำนวนนาที 0-480";
    }
    if (breakTooLong) return "เวลาพักต้องไม่มากกว่าระยะเวลาทำ OT";
    if (!form.reason.trim()) return "กรุณาระบุเหตุผลในการทำ OT";
    if (shouldSubmit && !evidenceFile) {
      return "คำขอ OT ต้องแนบรูปหลักฐานก่อนส่งเข้าคิวอนุมัติ";
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
      const created = await createOvertimeRequest({
        employeeId: employee.id,
        workDate: form.workDate,
        startTime: form.startTime,
        endTime: form.endTime,
        breakMinutes: Number(form.breakMinutes || 0),
        reason: form.reason.trim(),
        note: form.note.trim() || undefined,
        submit: false,
      });

      if (evidenceFile) {
        await uploadOvertimeAttachment(
          created.id,
          buildAttachmentFormData(evidenceFile, "หลักฐานประกอบคำขอ OT", form.reason),
        );
      }

      if (shouldSubmit) {
        try {
          await submitOvertimeRequest(created.id);
        } catch (submitError) {
          toast.warning(
            `บันทึกร่างคำขอ OT ${created.requestNo ?? ""} แล้ว แต่ส่งเข้าคิวไม่สำเร็จ: ${getErrorMessage(
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
          ? `ส่งคำขอ OT ${created.requestNo ?? ""} เข้าคิวอนุมัติแล้ว`
          : `บันทึกร่างคำขอ OT ${created.requestNo ?? ""} แล้ว`,
      );
      setForm((current) => ({ ...defaultForm(), workDate: current.workDate }));
      setEvidenceFile(null);
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "บันทึกคำขอ OT ไม่สำเร็จ"));
    } finally {
      setSaving(null);
    }
  }

  const isHoliday = dayType && dayType.workType !== "WORKDAY";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <Field label="วันที่ทำ OT" required>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={form.workDate}
              onChange={(event) => update("workDate", event.target.value)}
              className={cn(INPUT_CLASS, "pl-9")}
            />
          </span>
        </Field>

        <div className="flex flex-col justify-end">
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-2.5",
              dayTypeError
                ? "border-rose-200 bg-rose-50/60"
                : isHoliday
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-slate-200 bg-slate-50/70",
            )}
          >
            {loadingDayType ? (
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            ) : isHoliday ? (
              <Sunset className="h-5 w-5 text-amber-600" />
            ) : (
              <Sun className="h-5 w-5 text-slate-500" />
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500">
                ประเภทวันตามปฏิทินของพนักงาน
              </div>
              {dayTypeError ? (
                <div className="text-sm text-rose-700">{dayTypeError}</div>
              ) : dayType ? (
                <div className="text-sm text-slate-800">
                  <span className="font-bold">{dayType.label}</span>
                  {dayType.holidayName ? ` · ${dayType.holidayName}` : ""}
                  <span className="ml-1 text-[11px] text-slate-400">{dayType.reason}</span>
                </div>
              ) : (
                <div className="text-sm text-slate-400">กำลังตรวจ...</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-slate-500">ช่วงเวลาที่ใช้บ่อย</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const active =
              form.startTime === preset.startTime &&
              form.endTime === preset.endTime &&
              form.breakMinutes === preset.breakMinutes;
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
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition",
                  active
                    ? "border-violet-500 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-violet-50/40",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="เวลาเริ่ม" required>
          <input
            type="time"
            value={form.startTime}
            onChange={(event) => update("startTime", event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="เวลาสิ้นสุด" required>
          <input
            type="time"
            value={form.endTime}
            onChange={(event) => update("endTime", event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="หักพัก (นาที)">
          <input
            type="number"
            min={0}
            max={480}
            step={5}
            value={form.breakMinutes}
            onChange={(event) => update("breakMinutes", event.target.value)}
            className={cn(INPUT_CLASS, breakTooLong && "border-rose-300")}
          />
        </Field>
        <div className="flex flex-col justify-end">
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-2.5 text-sm text-slate-600">
            สุทธิ{" "}
            <span className="font-bold text-slate-900">{durationLabel(duration.net)}</span>
            <span className="ml-1 text-[11px] text-slate-400">
              ({num(duration.net / 60)} ชม.)
            </span>
            {duration.crossesMidnight ? (
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                ข้ามเที่ยงคืน
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="เหตุผลการทำ OT" required className="md:col-span-2">
          <textarea
            rows={2}
            value={form.reason}
            onChange={(event) => update("reason", event.target.value)}
            placeholder="งานที่ทำ / ผู้สั่งงาน"
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
