import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Search } from "lucide-react";

import { joinClassName } from "@/components/ui/class-name";
import { CONTROL_BASE, FOCUS_RING, RADIUS_CONTROL } from "./tokens";

/**
 * ฟอร์ม
 * -----
 * เดิมมี TextField / SelectField / InputBox / SelectBox / CompactInputBox กระจาย
 * อยู่หลายไฟล์ ค่าความสูงและระยะไม่ตรงกัน ตอนนี้ทุกตัวใช้ CONTROL_BASE ร่วมกัน
 */

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={joinClassName("block min-w-0", className)}>
      {label ? (
        <span className="mb-1 block text-[13px] font-medium text-slate-600 3xl:text-[14px]">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-rose-600">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={joinClassName(CONTROL_BASE, className)} {...rest} />;
}

/** ช่องเงิน — ชิดขวาและใช้ตัวเลขความกว้างคงที่ ให้อ่านคอลัมน์เงินง่าย */
/**
 * ช่องกรอกเงิน
 * ค่าเริ่มต้นชิดขวาเพราะส่วนใหญ่อยู่ในตารางที่ต้องอ่านหลักเลขให้ตรงกัน
 * ช่องเดี่ยว ๆ ในฟอร์มใช้ `align="left"` ได้ — ต้องเป็น prop ไม่ใช่ className
 * เพราะ text-right/text-left มี specificity เท่ากัน การใส่ทับผ่าน class ไม่ชนะเสมอไป
 */
export function MoneyInput({
  className,
  align = "right",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  align?: "left" | "right";
}) {
  return (
    <input
      inputMode="decimal"
      className={joinClassName(
        CONTROL_BASE,
        align === "left" ? "text-left" : "text-right",
        "tabular-nums",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={joinClassName(CONTROL_BASE, className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={joinClassName(
        CONTROL_BASE,
        "h-auto py-2 leading-6",
        className,
      )}
      {...rest}
    />
  );
}

export function SearchInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative block min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 3xl:left-3.5" />
      <input
        type="search"
        // ต้องไล่ระยะซ้ายตามจอด้วย ไม่งั้น `3xl:px-*` ของ CONTROL_BASE
        // จะไปทับ pl-9 (variant ชนะเสมอ) แล้วข้อความจะซ้อนไอคอนค้นหา
        className={joinClassName(CONTROL_BASE, "pl-9 3xl:pl-10", className)}
        {...rest}
      />
    </span>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label
      className={joinClassName(
        "flex cursor-pointer items-start gap-2.5 text-sm text-slate-700",
        className,
      )}
    >
      <input
        type="checkbox"
        className={joinClassName(
          "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600",
          FOCUS_RING,
        )}
        {...rest}
      />
      <span className="min-w-0">
        <span className="font-medium text-slate-800">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** สลับค่า on/off แบบเห็นสถานะชัด ใช้กับการตั้งค่าที่เปิด/ปิดได้ */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={joinClassName(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50",
          FOCUS_RING,
          checked
            ? "border-brand-600 bg-brand-600"
            : "border-slate-300 bg-slate-200",
        )}
      >
        <span
          className={joinClassName(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-5.5" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

/** กลุ่มฟิลด์ในฟอร์ม — คุมจำนวนคอลัมน์ที่เดียว */
export function FieldGrid({
  columns = 2,
  className,
  children,
}: {
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const columnClass = {
    1: "",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 xl:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
  }[columns];

  return (
    <div className={joinClassName("grid gap-4", columnClass, className)}>
      {children}
    </div>
  );
}

export { RADIUS_CONTROL };
