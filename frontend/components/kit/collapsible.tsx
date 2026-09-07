"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { joinClassName } from "@/components/ui/class-name";
import { HAIRLINE } from "./tokens";

/**
 * หัวข้อแบบกดกางออก
 * -----------------
 * ใช้กับส่วนที่ข้อมูลยาวมากจนดันหน้าให้ยืด เช่น ตารางตั้งค่าที่มีหลายสิบแถว
 * ปิดไว้ก่อนแล้วให้ผู้ใช้กดเปิดเฉพาะตอนจะแก้ — หน้าหลักจึงสั้นและกวาดตาจบเร็ว
 *
 * หน้าตาเหมือน `Section` ทุกอย่าง ต่างแค่มีลูกศรและกดพับได้
 */
export function CollapsibleSection({
  title,
  description,
  count,
  actions,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  /** จำนวนรายการข้างใน — เห็นได้ตั้งแต่ยังไม่กางออก */
  count?: number;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={joinClassName("border-b last:border-b-0", HAIRLINE)}>
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <ChevronRight
            className={joinClassName(
              "h-4 w-4 shrink-0 text-slate-400 transition-transform",
              open && "rotate-90",
            )}
          />

          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                {title}
              </span>
              {typeof count === "number" ? (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-50 px-1.5 text-[10.5px] font-bold tabular-nums text-brand-700">
                  {count}
                </span>
              ) : null}
            </span>
            {description ? (
              <span className="mt-0.5 block truncate text-[11.5px] leading-5 text-slate-400">
                {description}
              </span>
            ) : null}
          </span>
        </button>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>

      {open ? <div className="pb-1">{children}</div> : null}
    </section>
  );
}
