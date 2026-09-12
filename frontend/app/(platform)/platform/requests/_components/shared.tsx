"use client";

import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, Loader2, Send, Save, X } from "lucide-react";

import type { EmployeeListItem } from "@/types/employee";

/*
 * ของใช้ร่วมของหน้า "ยื่นคำขอแทนพนักงาน"
 * ---------------------------------------
 * ฟอร์มทั้ง 4 ประเภท (ลา / OT / แก้เวลา / นอกสถานที่) ใช้ชิ้นส่วนชุดเดียวกัน
 * เพื่อให้หน้าตาและพฤติกรรมตรงกัน — ช่องกรอก ปุ่มบันทึก/ส่ง ตัวแนบรูป ป้ายสถานะ
 *
 * สีสันยึดตาม Platform Console: พื้นขาว ตัวอักษรเข้ม เน้นด้วยสีม่วง
 */

export const INPUT_CLASS =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export const TEXTAREA_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50";

export const LABEL_CLASS = "text-[11px] font-semibold text-slate-500";

export const CARD_CLASS =
  "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* วันที่ / เวลา                                                       */
/* ------------------------------------------------------------------ */

/** วันนี้ตามเวลาไทย เป็น YYYY-MM-DD */
export function todayISODate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

export function minutesFromTime(value: string) {
  const [hour, minute] = String(value ?? "").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

/** "2026-07-24" + "08:30" → ISO ที่ระบุ +07:00 ชัดเจน */
export function toBangkokISO(date: string, time: string) {
  return `${date}T${time}:00+07:00`;
}

export function formatThaiDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatThaiDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** เวลาอาจมาเป็น "08:30" หรือ ISO เต็ม → คืน HH:mm ตามเวลาไทยเสมอ */
export function formatClock(value?: string | null) {
  if (!value) return "-";
  const text = String(value);
  if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function num(value: unknown, digits = 2) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/* ------------------------------------------------------------------ */
/* พนักงาน                                                             */
/* ------------------------------------------------------------------ */

export function employeeName(employee: Pick<
  EmployeeListItem,
  "displayName" | "firstName" | "lastName" | "employeeCode"
>) {
  return (
    employee.displayName?.trim() ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() ||
    employee.employeeCode ||
    "-"
  );
}

/* ------------------------------------------------------------------ */
/* สถานะคำขอ                                                           */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-slate-100 text-slate-600" },
  SUBMITTED: { label: "รออนุมัติ", className: "bg-amber-100 text-amber-700" },
  MANAGER_APPROVED: {
    label: "หัวหน้าอนุมัติแล้ว",
    className: "bg-sky-100 text-sky-700",
  },
  HR_APPROVED: {
    label: "HR อนุมัติแล้ว",
    className: "bg-sky-100 text-sky-700",
  },
  APPROVED: { label: "อนุมัติ", className: "bg-emerald-100 text-emerald-700" },
  MANAGER_REJECTED: {
    label: "หัวหน้าไม่อนุมัติ",
    className: "bg-rose-100 text-rose-700",
  },
  HR_REJECTED: {
    label: "HR ไม่อนุมัติ",
    className: "bg-rose-100 text-rose-700",
  },
  REJECTED: { label: "ไม่อนุมัติ", className: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-slate-100 text-slate-500" },
};

export function StatusBadge({ status }: { status?: string | null }) {
  const key = String(status ?? "").toUpperCase();
  const style = STATUS_STYLE[key] ?? {
    label: key || "-",
    className: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ช่องฟอร์ม                                                           */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className={LABEL_CLASS}>
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** ปุ่มเลือกแบบ pill — ใช้กับรูปแบบวันลา / ประเภทการแก้เวลา */
export function PillOption({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-[13px] font-semibold transition",
        active
          ? "border-violet-500 bg-violet-50 text-violet-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/40",
        disabled && "cursor-not-allowed opacity-40 hover:border-slate-200 hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* แนบรูปหลักฐาน                                                       */
/* ------------------------------------------------------------------ */

export function EvidencePicker({
  file,
  onChange,
  accept = "image/jpeg,image/png",
  required,
  hint,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // object URL ผูกกับไฟล์ตัวนั้น ๆ เปลี่ยนไฟล์แล้วคืนของเก่าให้เบราว์เซอร์
  const previewUrl = useMemo(
    () => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : ""),
    [file],
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={LABEL_CLASS}>
          รูปหลักฐาน
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </span>
        {file ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline"
          >
            <X className="h-3 w-3" />
            เอาออก
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="hidden"
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="ตัวอย่างรูปหลักฐาน"
              className="h-16 w-16 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-[11px] font-bold text-slate-400">
              PDF
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">
              {file.name}
            </div>
            <div className="text-[11px] text-slate-500">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-sm font-semibold text-slate-500 transition hover:border-violet-300 hover:bg-violet-50/40 hover:text-violet-700 disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" />
          เลือกไฟล์รูปหลักฐาน
        </button>
      )}

      {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ปุ่มบันทึกร่าง / ส่งเข้าคิว                                          */
/* ------------------------------------------------------------------ */

export function FormActions({
  saving,
  disabled,
  onSaveDraft,
  onSubmit,
  submitLabel = "ส่งเข้าคิวอนุมัติ",
}: {
  saving: "draft" | "submit" | null;
  disabled?: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
  submitLabel?: string;
}) {
  const busy = saving !== null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={busy || disabled}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {saving === "draft" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        บันทึกร่าง
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || disabled}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
      >
        {saving === "submit" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {submitLabel}
      </button>
    </div>
  );
}

/** ข้อความหมายเหตุตั้งต้น ให้ผู้อนุมัติรู้ว่าใบนี้ HR/ผู้ดูแลยื่นแทน */
export const ON_BEHALF_NOTE = "ยื่นแทนพนักงานโดยผู้ดูแลระบบ (Platform Console)";

export function buildAttachmentFormData(file: File, title: string, description: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  if (description.trim()) formData.append("description", description.trim());
  return formData;
}
