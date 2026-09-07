import type { ReactNode } from "react";

import { joinClassName } from "@/components/ui/class-name";
import { FOCUS_RING, HAIRLINE } from "./tokens";

/**
 * แท็บแบบขีดเส้นใต้
 * -----------------
 * เลือกแบบขีดเส้นเพราะเป็น 2D จริง ๆ — ไม่ต้องมีกล่องซ้อนกล่อง
 * และวางต่อจากแถบเครื่องมือในผืนเดียวกันได้โดยไม่เพิ่มขอบใหม่
 *
 * `trailing` ใช้วางช่องค้นหาหรือปุ่มไว้ท้ายแถวเดียวกับแท็บ
 */

export type TabItem<K extends string> = {
  key: K;
  label: string;
  count?: number;
};

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  trailing,
  className,
}: {
  items: Array<TabItem<K>>;
  value: K;
  onChange: (key: K) => void;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={joinClassName(
        "flex flex-col gap-2 border-b px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between 3xl:px-6 4xl:px-7",
        HAIRLINE,
        className,
      )}
    >
      {/* แคปซูลเดียวแบ่งเป็นช่อง ๆ — ช่องที่เลือกเป็นปุ่มทึบฟ้า อ่านออกทันทีว่าอยู่ตรงไหน */}
      <div
        role="tablist"
        className="flex flex-wrap items-center gap-1 rounded-full bg-slate-100 p-1"
      >
        {items.map((item) => {
          const active = item.key === value;

          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.key)}
              className={joinClassName(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition 3xl:text-[13px]",
                FOCUS_RING,
                active
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              {item.label}

              {typeof item.count === "number" && item.count > 0 ? (
                <span
                  className={joinClassName(
                    "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums",
                    active
                      ? "bg-white/25 text-white"
                      : "bg-slate-200 text-slate-600",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {trailing ? (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      ) : null}
    </div>
  );
}
