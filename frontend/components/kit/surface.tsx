import type { ReactNode } from "react";

import { joinClassName } from "@/components/ui/class-name";
import { HAIRLINE } from "./tokens";

/**
 * ตัวแบ่งส่วนภายในผืนหน้า
 * ----------------------
 * `Section` คือหัวข้อหนึ่งก้อนใน `PageSurface` คั่นกันด้วยเส้นบาง
 * ไม่มีการ์ดลอยซ้อนการ์ด จึงไม่มีขอบซ้ำและไม่เสียพื้นที่ไปกับช่องว่างระหว่างการ์ด
 */

/**
 * ส่วนย่อยใน Panel
 * `tight` ใช้กับเนื้อหาที่เต็มความกว้างอยู่แล้ว เช่น ตาราง
 */
export function Section({
  title,
  description,
  actions,
  tight = false,
  className,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  tight?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const hasHeader = Boolean(title || actions);

  return (
    <section
      className={joinClassName("border-b last:border-b-0", HAIRLINE, className)}
    >
      {hasHeader ? (
        <div
          className={joinClassName(
            /* ป้ายฟ้าคั่นด้วยเส้นบาง ชุดเดียวกับหัวข้อย่อยทั้งระบบ */
            "mx-5 flex flex-col gap-2 border-b border-brand-100 sm:flex-row sm:items-end sm:justify-between 3xl:mx-6 4xl:mx-7",
            tight ? "pb-1.5 pt-3" : "pb-1.5 pt-4",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h2 className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}

      {children ? (
        <div
          className={tight ? "" : "px-5 pb-5 pt-3 3xl:px-6 4xl:px-7 3xl:pb-6"}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** แถบเครื่องมือแนวนอนใน Panel เช่น ตัวกรอง — พื้นเทาจางเพื่อแยกจากเนื้อหา */
export function Toolbar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={joinClassName(
        // โทนเดียวกับแถบเครื่องมือของทุกหน้า: พื้นเทาอ่อน เส้นล่างเข้มกว่าเส้นทั่วไป
        "flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 3xl:px-7",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** ข้อความเตือน — แถบสีด้านซ้ายบอกระดับความสำคัญตั้งแต่ยังไม่อ่าน */
export function Notice({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warning" | "critical" | "positive";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const toneClass = {
    info: "bg-brand-50 text-brand-900 before:bg-brand-600",
    warning: "bg-amber-50 text-amber-900 before:bg-amber-500",
    critical: "bg-rose-50 text-rose-900 before:bg-rose-500",
    positive: "bg-emerald-50 text-emerald-900 before:bg-emerald-500",
  }[tone];

  return (
    <div
      className={joinClassName(
        "relative flex items-start gap-2 rounded-lg py-2.5 pl-4 pr-3.5 text-[13px] leading-6",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-lg",
        toneClass,
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
