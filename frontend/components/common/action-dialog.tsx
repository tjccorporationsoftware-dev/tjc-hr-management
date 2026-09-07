"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

export type ActionDialogState = {
  title: string;
  description: string;
  /**
   * รายละเอียดของสิ่งที่กำลังจะทำ เช่น ช่วงวันที่ ขอบเขตที่กระทบ
   * แยกเป็นคู่ป้าย-ค่า อ่านง่ายกว่ายัดรวมเป็นย่อหน้ายาวใน `description`
   */
  details?: Array<{ label: string; value: string }>;
  /** ข้อควรรู้ก่อนกดยืนยัน — แสดงเป็นบรรทัดเล็กใต้รายละเอียด */
  note?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "blue" | "red" | "emerald" | "orange";
  reasonLabel?: string;
  reasonPlaceholder?: string;
  requireReason?: boolean;
  defaultReason?: string;
  onConfirm: (reason?: string) => Promise<void> | void;
};

type ActionDialogProps = {
  state: ActionDialogState | null;
  loading?: boolean;
  onClose: () => void;
};

/**
 * กล่องยืนยันการกระทำของทั้งระบบ
 * ------------------------------
 * ใช้ภาษาเดียวกับหน้าที่ทำใหม่: แบ่งส่วนด้วยเส้นบาง ไม่ใช้แถบสีทึบหรือพื้นเทาเป็นก้อน
 * ไอคอนวงกลมมีวงแสงรอบ วางข้างหัวเรื่อง — กล่องยืนยันส่วนใหญ่มีข้อความสองบรรทัด
 * วางไอคอนแยกบรรทัดจะได้กล่องสูงและกว้างเกินเนื้อหาจริง
 * น้ำเสียงของงานบอกด้วยสีไอคอนกับสีปุ่มยืนยันเท่านั้น ไม่มีแถบสีหรือขีดสีที่ขอบกล่อง
 *
 * ปิดด้วย Esc ได้เหมือน Modal และล็อกการเลื่อนพื้นหลังระหว่างเปิด
 */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const TONE = {
  blue: {
    chip: "bg-brand-100 text-brand-600 ring-[5px] ring-brand-50/80",
    button: "bg-brand-600 hover:bg-brand-700 active:bg-brand-800",
    focus: "focus:border-brand-400 focus:ring-brand-100",
  },
  red: {
    chip: "bg-rose-100 text-rose-600 ring-[5px] ring-rose-50/80",
    button: "bg-rose-600 hover:bg-rose-700 active:bg-rose-800",
    focus: "focus:border-rose-300 focus:ring-rose-100",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-600 ring-[5px] ring-emerald-50/80",
    button: "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800",
    focus: "focus:border-emerald-300 focus:ring-emerald-100",
  },
  orange: {
    chip: "bg-amber-100 text-amber-600 ring-[5px] ring-amber-50/80",
    button: "bg-amber-500 hover:bg-amber-600 active:bg-amber-700",
    focus: "focus:border-amber-300 focus:ring-amber-100",
  },
} as const;

const CONTROL_CLASS =
  "w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[12.5px] text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:bg-white focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export function ActionDialog({
  state,
  loading = false,
  onClose,
}: ActionDialogProps) {
  const [reason, setReason] = useState("");
  const [errorText, setErrorText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openedState, setOpenedState] = useState(state);

  // เปิดกล่องใหม่ = ล้างค่าที่ค้างจากครั้งก่อน ทำตอน render ตามแนวทางของ React
  // (ถ้าใช้ effect จะเกิด render ซ้อนรอบโดยไม่จำเป็น)
  if (state !== openedState) {
    setOpenedState(state);
    setReason(state?.defaultReason ?? "");
    setErrorText("");
    setSubmitting(false);
  }

  useEffect(() => {
    if (!state) return;

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
  }, [state, onClose]);

  if (!state) return null;

  const dialog = state;
  const isBusy = loading || submitting;
  const tone = TONE[dialog.tone ?? "blue"];

  async function confirm() {
    if (dialog.requireReason && !reason.trim()) {
      setErrorText("กรุณาระบุเหตุผลก่อนดำเนินการ");
      return;
    }

    setSubmitting(true);
    setErrorText("");

    try {
      await dialog.onConfirm(reason.trim());
      onClose();
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="ปิด"
        tabIndex={-1}
        onClick={isBusy ? undefined : onClose}
        className="animate-overlay-in absolute inset-0 cursor-default bg-slate-900/25 backdrop-blur-[3px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="animate-dialog-in relative w-full max-w-[21.5rem] overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5"
      >
        <div className="px-4 pb-4 pt-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                tone.chip,
              )}
            >
              {dialog.tone === "red" ? (
                <XCircle className="h-4 w-4" />
              ) : dialog.tone === "orange" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </span>

            <div className="min-w-0">
              <h2 className="text-[14.5px] font-bold tracking-tight text-slate-900">
                {dialog.title}
              </h2>
              <p className="mt-0.5 text-[12.5px] leading-5 text-slate-500">
                {dialog.description}
              </p>
            </div>
          </div>

          {/* คู่ป้าย-ค่า อ่านเป็นตารางย่อ ไม่ใช่ย่อหน้ายาว */}
          {dialog.details?.length ? (
            <dl className="mt-3 space-y-1 rounded-lg bg-slate-50 px-3 py-2">
              {dialog.details.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-3 text-[12px]"
                >
                  <dt className="shrink-0 text-slate-400">{row.label}</dt>
                  <dd className="min-w-0 text-right font-semibold text-slate-700">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {dialog.note ? (
            <p className="mt-2 border-l-2 border-slate-200 pl-2.5 text-[11.5px] leading-5 text-slate-400">
              {dialog.note}
            </p>
          ) : null}

          {dialog.reasonLabel ? (
            <label className="mt-3 block">
              <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {dialog.reasonLabel}
                {dialog.requireReason ? (
                  <span className="ml-0.5 text-rose-500">*</span>
                ) : null}
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={cn(CONTROL_CLASS, tone.focus, "min-h-20 leading-5")}
                placeholder={dialog.reasonPlaceholder}
                disabled={isBusy}
              />
            </label>
          ) : null}

          {/* ข้อความผิดพลาดใช้ขีดนำหน้าแบบเดียวกับ Notice ในชุด kit */}
          {errorText ? (
            <p
              className={cn(
                "relative mt-2.5 flex items-start gap-2 rounded-lg bg-rose-50 py-1.5 pl-3 pr-2.5 text-[12px] leading-5 text-rose-700",
                "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-lg before:bg-rose-500",
              )}
            >
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {errorText}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-1 border-t border-slate-100 px-3.5 py-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-50"
          >
            {dialog.cancelLabel ?? "ยกเลิก"}
          </button>

          <button
            type="button"
            onClick={confirm}
            disabled={isBusy}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white transition disabled:pointer-events-none disabled:opacity-50",
              tone.button,
            )}
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
