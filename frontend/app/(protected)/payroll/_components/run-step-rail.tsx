import { Check } from "lucide-react";

import { joinClassName } from "@/components/kit";
import type { PayrollRun } from "@/types/payroll";

/**
 * แถบ 4 ขั้นของการทำเงินเดือนหนึ่งงวด
 * เป็นตัวบอกสถานะอย่างเดียว กดไม่ได้ — การเลื่อนขั้นทำผ่านปุ่มหลักด้านบน
 *
 * ขั้นที่ทำแล้วเป็นเขียว ขั้นปัจจุบันเป็นฟ้าและมีวงแหวนรอบ ๆ ให้สะดุดตา
 */

const STEPS = ["คำนวณ", "ตรวจ", "อนุมัติ", "จ่าย"];

/** สถานะของ run แปลงเป็น "ผ่านมาแล้วกี่ขั้น" */
function stepsDone(status: PayrollRun["status"]) {
  if (status === "PAID") return 4;
  if (status === "APPROVED") return 3;
  if (status === "REVIEWED") return 2;
  if (status === "CALCULATED") return 1;
  return 0;
}

export function RunStepRail({ status }: { status: PayrollRun["status"] }) {
  const done = stepsDone(status);
  const stopped = status === "CANCELLED" || status === "FAILED";

  return (
    <ol className="flex shrink-0 items-center">
      {STEPS.map((label, index) => {
        const isDone = !stopped && index < done;
        const isCurrent = !stopped && index === done;

        return (
          <li key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={joinClassName(
                  // shrink-0 กันวงกลมถูกบีบจนเป็นวงรีเวลาแถบแคบ
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold transition",
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                      ? "bg-brand-600 text-white ring-4 ring-brand-100"
                      : "bg-slate-100 text-slate-400",
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={joinClassName(
                  "text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold",
                  isDone
                    ? "text-emerald-600"
                    : isCurrent
                      ? "text-brand-700"
                      : "text-slate-400",
                )}
              >
                {label}
              </span>
            </div>

            {index < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={joinClassName(
                  "mx-2 mb-5 h-0.5 w-8 rounded-full transition sm:w-12",
                  index < done ? "bg-emerald-300" : "bg-slate-200",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
