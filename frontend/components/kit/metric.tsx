import type { ReactNode } from "react";

import { joinClassName } from "@/components/ui/class-name";
import { HAIRLINE, TONE_TEXT, type Tone } from "./tokens";

/**
 * แถบตัวเลขสรุป
 * -------------
 * เป็นแถบในผืนเดียวกับเนื้อหา ไม่ใช่การ์ดแยก จึงไม่กินความสูงและไม่มีขอบซ้ำ
 * ตัวที่ตั้ง `emphasis` ได้พื้นฟ้าและตัวเลขใหญ่กว่า — ตั้งได้ตัวเดียวต่อแถว
 */

export function MetricRow({
  columns = 4,
  className,
  children,
}: {
  columns?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const columnClass = {
    2: "grid-cols-2",
    3: "grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <div
      className={joinClassName(
        "grid divide-x divide-y sm:divide-y-0",
        "divide-slate-200",
        columnClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  helper,
  tone = "neutral",
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: Tone;
  emphasis?: boolean;
}) {
  return (
    <div
      className={joinClassName(
        "min-w-0 px-5 py-3.5",
        emphasis && "bg-brand-50/70",
      )}
    >
      <p
        className={joinClassName(
          "truncate text-[11px] font-bold uppercase tracking-wider",
          emphasis ? "text-brand-600" : "text-slate-400",
        )}
      >
        {label}
      </p>

      <p
        className={joinClassName(
          "mt-1 truncate font-bold tabular-nums tracking-tight",
          emphasis
            ? "text-[26px] leading-8 text-brand-700"
            : joinClassName("text-[21px] leading-7", TONE_TEXT[tone]),
        )}
      >
        {value}
      </p>

      {helper ? (
        <p
          className={joinClassName(
            "truncate text-[11px]",
            emphasis ? "text-brand-500" : "text-slate-400",
          )}
        >
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/**
 * ช่องตัวเลขบนหัวหน้า — เล็กและแบน ป้ายเล็กสีจาง ตัวเลขคือพระเอก
 * ใช้สีที่ตัวเลขอย่างเดียวเป็นสัญญาณ (เหลือง = ยังค้าง, เขียว = เรียบร้อย)
 *
 * วางเรียงในกล่อง `grid ... divide-x rounded-lg border` ข้างหัวเรื่องของหน้า
 */
export function StatTile({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  /**
   * ไม่ได้ใช้กำหนดสีแล้ว — แผงตัวเลขทุกหน้าต้องเป็นชุดเดียวกันคือไอคอนวงฟ้า
   * ตัวเลขสีดำ สีที่ต่างกันไปตามค่าทำให้แผงหัวหน้าลายตาและแย่งความสนใจ
   * จากเนื้อหาในหน้า ยังรับพร็อพนี้ไว้เพราะหน้าที่เรียกใช้ส่งมากันหลายสิบที่
   */
  tone?: "neutral" | "warning" | "positive";
  /** ไอคอนในวงกลมฟ้าด้านหน้า */
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2 3xl:px-3.5 3xl:py-2.5">
      {icon ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          {icon}
        </span>
      ) : null}

      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 3xl:text-[10.5px]">
          {label}
        </p>
        <p className="truncate text-[16px] font-bold leading-5 tabular-nums tracking-tight text-slate-900 3xl:text-[17px]">
          {value}
        </p>
        {helper ? (
          <p className="truncate text-[10px] leading-4 text-slate-400 3xl:text-[10.5px]">
            {helper}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** คู่ป้าย-ค่า แนวตั้ง ใช้แสดงรายละเอียดในแถวเดียวกันหลาย ๆ ตัว */
export function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-slate-800">
        {value}
      </div>
    </div>
  );
}

export { HAIRLINE };
