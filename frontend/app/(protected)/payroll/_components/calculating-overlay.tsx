"use client";

import { useEffect, useState } from "react";
import { Calculator, Loader2 } from "lucide-react";

import { joinClassName } from "@/components/kit";
import { count } from "@/lib/payroll-format";
import type { PayrollRunProgressResponse } from "@/types/payroll";

/**
 * ป๊อปอัพระหว่างคำนวณเงินเดือน
 * ---------------------------
 * การคำนวณกินเวลาหลายวินาทีถึงหลายนาทีขึ้นกับจำนวนคน ถ้าไม่มีอะไรขึ้นเลย
 * ผู้ใช้จะกดซ้ำหรือปิดหน้าไปกลางคัน จึงต้องบอกว่ากำลังทำอะไรอยู่และไปถึงไหนแล้ว
 *
 * ตั้งใจปิดไม่ได้ระหว่างทำงาน — ปิดไปก็ไม่ได้ยกเลิกงานฝั่ง backend อยู่ดี
 */

const STEPS = [
  "เตรียมข้อมูลพนักงานและค่าจ้าง",
  "ดึงเวลาทำงาน การลา และล่วงเวลา",
  "คิดรายได้ รายการหัก ประกันสังคม และภาษี",
  "สรุปยอดของงวด",
];

export function CalculatingOverlay({
  open,
  progress,
  employeeCount,
}: {
  open: boolean;
  progress: PayrollRunProgressResponse | null;
  employeeCount: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(timer);
      setElapsed(0);
    };
  }, [open]);

  if (!open) return null;

  const total = progress?.totalEmployees || employeeCount || 0;
  const processed = progress?.processedEmployees ?? 0;

  /** ถ้า backend ยังไม่รายงาน percent ให้เดาจากจำนวนคนที่ทำไปแล้ว */
  const percent = Math.min(
    99,
    Math.max(
      progress?.percent ?? 0,
      total ? Math.round((processed / total) * 100) : 0,
    ),
  );

  const activeStep = Math.min(
    STEPS.length - 1,
    Math.floor((percent / 100) * STEPS.length),
  );

  return (
    <div className="animate-overlay-in fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="status"
        aria-live="polite"
        className="animate-dialog-in w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/25 ring-1 ring-slate-900/5"
      >
        <div className="flex items-center gap-3.5 border-b border-brand-100 bg-gradient-to-r from-brand-50 to-white px-5 3xl:px-6 4xl:px-7 py-4">
          <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Calculator className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
            </span>
          </span>

          <div className="min-w-0">
            <p className="text-[15px] 3xl:text-[16px] 4xl:text-[17px] font-bold text-slate-900">
              กำลังคำนวณเงินเดือน
            </p>
            <p className="truncate text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500">
              {progress?.message || STEPS[activeStep]}
            </p>
          </div>
        </div>

        <div className="px-5 3xl:px-6 4xl:px-7 py-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500">
              {total
                ? `ประมวลผลแล้ว ${count(processed)} / ${count(total)} คน`
                : "กำลังเตรียมข้อมูล…"}
            </span>
            <span className="text-[18px] 3xl:text-[19.5px] 4xl:text-[20.5px] font-bold tabular-nums text-brand-700">
              {percent}%
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-[width] duration-500"
              style={{ width: `${Math.max(percent, 4)}%` }}
            />
          </div>

          <ul className="mt-4 space-y-2">
            {STEPS.map((step, index) => {
              const done = index < activeStep;
              const current = index === activeStep;

              return (
                <li
                  key={step}
                  className={joinClassName(
                    "flex items-center gap-2.5 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px]",
                    done
                      ? "text-slate-400"
                      : current
                        ? "font-semibold text-slate-800"
                        : "text-slate-300",
                  )}
                >
                  <span
                    className={joinClassName(
                      "inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
                      done
                        ? "bg-emerald-500"
                        : current
                          ? "bg-brand-600"
                          : "bg-slate-200",
                    )}
                  />
                  {step}
                </li>
              );
            })}
          </ul>

          <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] text-slate-400">
            ใช้เวลาไปแล้ว {elapsed} วินาที · อย่าปิดหน้านี้จนกว่าจะคำนวณเสร็จ
          </p>
        </div>
      </div>
    </div>
  );
}
