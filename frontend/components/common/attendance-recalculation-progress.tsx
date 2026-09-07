"use client";

import { Check, Clock3, Loader2, X } from "lucide-react";

import { joinClassName } from "@/components/kit";
import { formatThaiDate } from "@/lib/date-format";
import type { AttendanceRecalculationProgressResponse } from "@/types/attendance";

/**
 * ป๊อปอัพระหว่างคำนวณเวลาทำงาน
 * ---------------------------
 * โครงเดียวกับป๊อปอัพคำนวณเงินเดือน (`payroll/_components/calculating-overlay`)
 * เพราะเป็นงานแบบเดียวกัน — กินเวลานาน ปิดไปก็ไม่ได้ยกเลิกงานฝั่ง backend
 * ต่างกันแค่ตรงนี้รู้ผลลัพธ์ท้ายงาน (สำเร็จ/ไม่สำเร็จ) จึงปิดได้เมื่อจบแล้ว
 *
 * ใช้ร่วมกันระหว่างหน้า /attendance กับ /hr-review — เดิมก๊อปโค้ดชุดเดียวกันไว้ทั้งสองหน้า
 * แล้วแก้ไม่ตรงกันจนหน้าตาเริ่มเพี้ยนออกจากกัน
 */

/** ยุบ step ย่อยของ backend ให้เหลือ 4 ขั้นที่คนอ่านเข้าใจ */
const STEPS: Array<{ label: string; keys: string[] }> = [
  { label: "เตรียมงานและตรวจช่วงวันที่", keys: ["PREPARE", "VALIDATE_RANGE"] },
  {
    label: "โหลดพนักงานและข้อมูลต้นทาง",
    keys: [
      "LOAD_EMPLOYEES",
      "PREPARE_DATA",
      "LOAD_LOCKED_SUMMARIES",
      "LOAD_SOURCE_DATA",
    ],
  },
  { label: "คำนวณเวลาทำงานรายวัน", keys: ["BUILD_CONTEXT", "CALCULATE"] },
  { label: "สรุปผลและบันทึก", keys: ["FINALIZE", "COMPLETED"] },
];

const STEP_LABELS: Record<string, string> = {
  PREPARE: "เตรียมงาน",
  VALIDATE_RANGE: "ตรวจช่วงวันที่",
  LOAD_EMPLOYEES: "โหลดพนักงาน",
  PREPARE_DATA: "เตรียมข้อมูล",
  LOAD_LOCKED_SUMMARIES: "ตรวจรายการล็อก",
  LOAD_SOURCE_DATA: "โหลดข้อมูลต้นทาง",
  BUILD_CONTEXT: "เตรียมกติกาคำนวณ",
  CALCULATE: "คำนวณรายวัน",
  FINALIZE: "สรุปผล",
  COMPLETED: "เสร็จสิ้น",
  FAILED: "ไม่สำเร็จ",
};

function countText(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("th-TH") : "0";
}

function clampPercent(value: unknown) {
  const percent = Number(value ?? 0);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(Math.max(Math.round(percent), 0), 100);
}

function elapsedText(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** ขั้นนี้ผ่านไปแล้ว / กำลังทำ / ยังไม่ถึง */
function stepState(
  keys: string[],
  currentStep: string | null | undefined,
  { isCompleted, isFailed }: { isCompleted: boolean; isFailed: boolean },
): "done" | "current" | "todo" {
  if (isCompleted) return "done";

  const order = STEPS.findIndex((step) => step.keys.includes(currentStep ?? ""));
  const index = STEPS.findIndex((step) => step.keys === keys);

  // ยังไม่รู้ว่าอยู่ขั้นไหน (หรือพังตั้งแต่ยังไม่รายงาน) ให้ถือว่าอยู่ขั้นแรก
  const activeIndex = order >= 0 ? order : 0;

  if (index < activeIndex) return "done";
  if (index === activeIndex) return isFailed ? "todo" : "current";
  return "todo";
}

export function AttendanceRecalculationProgressModal({
  progress,
  elapsedMs,
  visible,
  dateFrom,
  dateTo,
  onClose,
  onCancel,
  cancelling,
}: {
  progress: AttendanceRecalculationProgressResponse | null;
  elapsedMs: number;
  visible: boolean;
  /** ช่วงวันที่ที่กำลังคำนวณ — ใส่ก็ได้ ไม่ใส่ก็ได้ */
  dateFrom?: string;
  dateTo?: string;
  onClose: () => void;
  /** ไม่ส่งมา = ไม่แสดงปุ่มหยุด (เช่นหน้าที่ยังไม่ได้ต่อ) */
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  if (!visible) return null;

  const percent = clampPercent(progress?.percent ?? 2);
  const isFailed = progress?.status === "FAILED";
  const isCompleted = progress?.status === "COMPLETED";
  const isCancelled = progress?.status === "CANCELLED";
  /* กดหยุดแล้วแต่ยังไม่จบ — ปุ่มต้องจางและบอกว่ากำลังรอ */
  const isCancelling = progress?.status === "CANCELLING" || Boolean(cancelling);
  const canClose = isFailed || isCompleted || isCancelled;

  const title = isFailed
    ? "คำนวณเวลาทำงานไม่สำเร็จ"
    : isCancelled
      ? "หยุดการคำนวณแล้ว"
      : isCompleted
        ? "คำนวณเวลาทำงานเสร็จแล้ว"
        : isCancelling
          ? "กำลังหยุดการคำนวณ"
          : "กำลังคำนวณเวลาทำงาน";

  const message =
    progress?.errorMessage ||
    progress?.message ||
    (progress?.step
      ? STEP_LABELS[progress.step] || progress.step
      : "กำลังเตรียมข้อมูล…");

  const processedText =
    progress?.totalItems && progress.totalItems > 0
      ? `ประมวลผลแล้ว ${countText(progress.processedItems)} / ${countText(progress.totalItems)} รายการ`
      : "กำลังเตรียมข้อมูล…";

  const scopeText = progress?.employeeCount
    ? `${countText(progress.employeeCount)} คน · ${countText(progress.dayCount)} วัน`
    : null;

  const rangeText =
    dateFrom && dateTo
      ? `${formatThaiDate(dateFrom)} – ${formatThaiDate(dateTo)}`
      : null;

  const barWidth = `${Math.max(percent, isFailed || isCompleted ? 100 : 4)}%`;

  return (
    <div className="animate-overlay-in fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[3px]">
      <div
        role="status"
        aria-live="polite"
        className="animate-dialog-in w-full max-w-[24rem] overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5"
      >
        {/*
         * หัวกล่องไม่มีแถบไล่สีแล้ว — บอกน้ำเสียงด้วยสีไอคอนกับสีแถบความคืบหน้าเท่านั้น
         * ชุดเดียวกับ ActionDialog และ Modal ที่ทำใหม่
         */}
        <div className="flex items-start gap-3 px-5 pb-3.5 pt-4">
          <span
            className={joinClassName(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              isFailed
                ? "bg-rose-100 text-rose-600 ring-[5px] ring-rose-50/80"
                : isCancelled
                  ? "bg-amber-100 text-amber-600 ring-[5px] ring-amber-50/80"
                  : isCompleted
                    ? "bg-emerald-100 text-emerald-600 ring-[5px] ring-emerald-50/80"
                    : "bg-brand-100 text-brand-600 ring-[5px] ring-brand-50/80",
            )}
          >
            {canClose ? (
              <Clock3 className="h-[18px] w-[18px]" />
            ) : (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            )}
          </span>

          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[14.5px] font-bold tracking-tight text-slate-900">
              {title}
            </p>
            <p className="truncate text-[12.5px] leading-5 text-slate-500">
              {message}
            </p>
          </div>

          {canClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="border-t border-brand-100 px-5 py-3.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[12px] text-slate-500">{processedText}</span>
            <span
              className={joinClassName(
                "text-[17px] font-extrabold tabular-nums",
                isFailed
                  ? "text-rose-600"
                  : isCancelled
                    ? "text-amber-600"
                    : isCompleted
                      ? "text-emerald-600"
                      : "text-brand-600",
              )}
            >
              {countText(percent)}%
            </span>
          </div>

          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-50">
            <div
              className={joinClassName(
                "h-full rounded-full transition-[width] duration-500",
                isFailed
                  ? "bg-rose-500"
                  : isCancelled
                    ? "bg-amber-500"
                    : isCompleted
                      ? "bg-emerald-500"
                      : "bg-brand-600",
              )}
              style={{ width: barWidth }}
            />
          </div>

          {/*
           * ขั้นตอนเป็นเส้นไทม์ไลน์ มีเส้นตั้งเชื่อมจุดแต่ละขั้น อ่านออกว่าเดินมาถึงไหน
           * เดิมเป็นจุดกลมเล็ก ๆ ลอยหน้าข้อความ ดูเป็นแค่ bullet ไม่ใช่ความคืบหน้า
           */}
          <ol className="relative mt-3.5 space-y-2.5">
            <span
              aria-hidden
              className="absolute bottom-2 left-[7px] top-2 w-px bg-brand-100"
            />

            {STEPS.map((step) => {
              const state = stepState(step.keys, progress?.step, {
                isCompleted,
                isFailed,
              });

              return (
                <li
                  key={step.label}
                  className={joinClassName(
                    "relative flex items-center gap-2.5 text-[12.5px]",
                    state === "done"
                      ? "text-slate-400"
                      : state === "current"
                        ? "font-semibold text-slate-900"
                        : "text-slate-300",
                  )}
                >
                  <span
                    className={joinClassName(
                      "relative z-10 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full",
                      state === "done"
                        ? "bg-brand-500 text-white"
                        : state === "current"
                          ? "bg-white text-brand-600 ring-2 ring-brand-500"
                          : "bg-white text-transparent ring-1 ring-brand-100",
                    )}
                  >
                    {state === "done" ? (
                      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                    ) : state === "current" ? (
                      <span className="h-[5px] w-[5px] rounded-full bg-brand-600" />
                    ) : null}
                  </span>
                  {step.label}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex items-center gap-3 border-t border-brand-100 px-5 py-2.5">
          <p className="min-w-0 flex-1 text-[11px] leading-4 text-slate-400">
            ใช้เวลาไปแล้ว {elapsedText(elapsedMs)}
            {rangeText ? ` · งวด ${rangeText}` : ""}
            {scopeText ? ` · ${scopeText}` : ""}
            {canClose ? "" : " · อย่าปิดหน้านี้จนกว่าจะคำนวณเสร็จ"}
          </p>

          {onCancel && !canClose ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className={joinClassName(
                "shrink-0 rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition",
                isCancelling
                  ? "cursor-not-allowed border-slate-200 text-slate-400"
                  : "border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700",
              )}
            >
              {isCancelling ? "กำลังหยุด…" : "หยุดการคำนวณ"}
            </button>
          ) : null}
        </div>

        {isCancelled ? (
          <p className="border-t border-amber-100 bg-amber-50/60 px-5 py-2.5 text-[11.5px] leading-5 text-amber-900">
            รายการที่คำนวณไปแล้วถูกต้องและบันทึกไว้เรียบร้อย
            ส่วนที่เหลือยังเป็นตัวเลขเดิม กดคำนวณใหม่เมื่อไหร่ก็ได้
          </p>
        ) : null}
      </div>
    </div>
  );
}
