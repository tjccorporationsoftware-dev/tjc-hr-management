"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { joinClassName } from "@/components/ui/class-name";
import { Button } from "./button";

/**
 * Modal ตัวเดียวของทั้งโซน
 * ------------------------
 * เดิมแต่ละหน้าเขียน overlay + กล่อง + ปุ่มปิดเอง (นับได้กว่า 10 ที่)
 * ค่าความสูงสูงสุด การเลื่อน และปุ่มท้ายกล่องจึงไม่ตรงกัน
 *
 * ตัวนี้ปิดด้วย Esc และคลิกฉากหลังได้ และล็อกการเลื่อนพื้นหลังให้อัตโนมัติ
 *
 * หน้าตาใช้ชุดเดียวกับ ActionDialog — ฉากหลังจางมีเบลอ เงานุ่ม แบ่งส่วนด้วยเส้นบาง
 * และไม่มีพื้นเทาเป็นก้อนที่ท้ายกล่อง
 */

export function Modal({
  open,
  title,
  description,
  size = "md",
  footer,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  /**
   * `md-wide` ใช้กับฟอร์มสองคอลัมน์ที่ `md` เริ่มอึดอัดแต่ยังไม่ถึงกับต้องใช้ `lg`
   * `xl` ใช้กับกล่องที่เป็นพื้นที่ทำงานจริง เช่น กระดานลากวางจัดผังองค์กร
   */
  size?: "sm" | "md" | "md-wide" | "lg" | "xl";
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = {
    sm: "max-w-lg",
    md: "max-w-2xl",
    "md-wide": "max-w-4xl",
    lg: "max-w-5xl",
    xl: "max-w-7xl",
  }[size];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="ปิด"
        tabIndex={-1}
        onClick={onClose}
        className="animate-overlay-in absolute inset-0 cursor-default bg-slate-900/25 backdrop-blur-[3px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={joinClassName(
          "animate-dialog-in relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5",
          widthClass,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-tight text-slate-900 3xl:text-[16.5px] 4xl:text-[17px]">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-[12.5px] leading-5 text-slate-500 3xl:text-[13px]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** ปุ่มท้าย modal ที่ใช้ซ้ำ ๆ — ยกเลิก + ยืนยัน */
export function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel = "บันทึก",
  cancelLabel = "ยกเลิก",
  loading = false,
  disabled = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <Button onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </Button>
      <Button
        variant="primary"
        onClick={onConfirm}
        loading={loading}
        disabled={disabled}
      >
        {confirmLabel}
      </Button>
    </>
  );
}
