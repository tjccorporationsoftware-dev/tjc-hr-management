"use client";

import type { ReactNode } from "react";

import { joinClassName } from "@/components/kit";
import type { StatCount, StatDayCount } from "@/types/reports";

/**
 * ชิ้นส่วนที่ใช้ซ้ำในแท็บสถิติและแท็บการใช้งานระบบ
 * -----------------------------------------------------------------------------
 * ทั้งสองแท็บแสดงของแบบเดียวกันซ้ำ ๆ อยู่ไม่กี่แบบ: แถวตัวเลขสรุป,
 * รายการแจกแจงพร้อมแถบสัดส่วน และกราฟแท่งรายวัน จึงแยกมาไว้ที่เดียว
 *
 * ไม่ใช้ไลบรารีกราฟ — ที่ต้องการคือแท่งกับแถบสัดส่วนล้วน ๆ ซึ่ง div + ความกว้าง
 * เป็นเปอร์เซ็นต์ทำได้ครบ และไม่ต้องแบกน้ำหนักไลบรารีเข้ามาในหน้าที่เปิดไม่บ่อย
 */

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[12px]";

export function StatSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 px-5 py-5 last:border-b-0 sm:px-6 3xl:px-7">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-900 3xl:text-[16px]">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12px] leading-5 text-slate-500 3xl:text-[13px]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {children}
    </section>
  );
}

/** แถวตัวเลขสรุป — กล่องเดียวแบ่งช่องด้วยเส้น ไม่ใช่การ์ดลอยหลายใบ */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-4">
      {children}
    </div>
  );
}

export function StatCell({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "brand" | "warning" | "positive" | "critical";
}) {
  const valueTone = {
    neutral: "text-slate-900",
    brand: "text-brand-700",
    warning: "text-amber-700",
    positive: "text-emerald-700",
    critical: "text-rose-700",
  }[tone];

  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className={LABEL_CLASS}>{label}</p>
      <p
        className={joinClassName(
          "mt-1 truncate text-[20px] font-bold tabular-nums 3xl:text-[22px]",
          valueTone,
        )}
      >
        {value}
      </p>
      {helper ? (
        <p className="mt-0.5 truncate text-[11px] text-slate-400 3xl:text-[12px]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/**
 * รายการแจกแจงพร้อมแถบสัดส่วน
 * แถบยาวเทียบกับค่าสูงสุดในชุด ไม่ใช่เทียบกับผลรวม — อ่านง่ายกว่าเมื่อมีตัวนำโด่ง
 */
export function StatBreakdown({
  items,
  labelOf,
  unit,
  emptyText = "ยังไม่มีข้อมูลในช่วงนี้",
  max = 8,
}: {
  items: Array<StatCount & { days?: number; hours?: number }>;
  labelOf?: (key: string) => string;
  unit?: (item: StatCount & { days?: number; hours?: number }) => string;
  emptyText?: string;
  max?: number;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-slate-400">{emptyText}</p>
    );
  }

  const shown = items.slice(0, max);
  const peak = Math.max(...shown.map((item) => item.count), 1);

  return (
    <ul className="space-y-2">
      {shown.map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-[13px] text-slate-700 3xl:w-52 3xl:text-[14px]">
            {labelOf ? labelOf(item.key) : item.key}
          </span>

          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max((item.count / peak) * 100, 2)}%` }}
            />
          </span>

          <span className="w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-900 3xl:text-[14px]">
            {unit ? unit(item) : item.count.toLocaleString("th-TH")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * กราฟแท่งรายวัน
 * ช่วงกว้างมากแท่งจะบางจนกดไม่ติด จึงให้เลื่อนแนวนอนแทนการบีบให้พอดีจอ
 */
export function StatDayChart({ items }: { items: StatDayCount[] }) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-slate-400">
        ยังไม่มีกิจกรรมในช่วงนี้
      </p>
    );
  }

  const peak = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="flex min-w-full items-end gap-[3px]"
        style={{ height: 132 }}
      >
        {/*
          คอลัมน์ต้องสูงเต็มกล่อง ไม่งั้นแท่งที่คิดความสูงเป็น % จะอ้างอิงกับ
          ความสูงอัตโนมัติ (= 0) แล้วกราฟจะว่างเปล่าทั้งแถบ
        */}
        {items.map((item) => (
          <div
            key={item.key}
            className="group relative flex h-full min-w-[6px] flex-1 flex-col justify-end"
            title={`${formatDayLabel(item.key)} · ${item.count.toLocaleString("th-TH")} ครั้ง`}
          >
            <span
              className={joinClassName(
                "w-full rounded-t-sm transition-colors",
                item.count > 0
                  ? "bg-brand-500 group-hover:bg-brand-600"
                  : "bg-slate-100",
              )}
              style={{
                height: `${Math.max((item.count / peak) * 100, item.count > 0 ? 3 : 1.5)}%`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-slate-400 3xl:text-[12px]">
        <span>{formatDayLabel(items[0]?.key)}</span>
        <span>สูงสุด {peak.toLocaleString("th-TH")} ครั้ง/วัน</span>
        <span>{formatDayLabel(items[items.length - 1]?.key)}</span>
      </div>
    </div>
  );
}

/** วันที่แบบสั้นพร้อมปี พ.ศ. — ใช้บนแกนกราฟที่พื้นที่จำกัด */
function formatDayLabel(key?: string) {
  if (!key) return "-";

  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}
