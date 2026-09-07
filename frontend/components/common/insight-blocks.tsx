"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

/**
 * บล็อกกราฟที่ใช้ซ้ำในหลายแท็บของห้องผู้บริหาร
 * -------------------------------------------
 * ทั้งสามตัวเป็นแค่วิธี "เทียบขนาด" คนละแบบ เลือกตามคำถามที่ต้องตอบ
 *   SegmentMeter    — ของทั้งก้อนถูกแบ่งเป็นกี่ส่วน (รวมกันได้ 100%)
 *   BarList         — อันไหนมากกว่าอันไหน เทียบตัวต่อตัว
 *   DonutBreakdown  — สัดส่วน พร้อมยอดรวมกลางวง
 */

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

export function countText(value: number) {
  return Number(value || 0).toLocaleString("th-TH");
}

function percentOf(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export type MeterSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/** แถบเดียวแบ่งสี + ตัวเลขใต้แถบ ใช้กับ "วันนี้ทุกคนอยู่สถานะไหน" */
export function SegmentMeter({
  segments,
  unit,
  emptyText,
}: {
  segments: MeterSegment[];
  unit: string;
  emptyText: string;
}) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-slate-400">{emptyText}</p>
    );
  }

  return (
    <>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 3xl:h-3.5">
        {segments
          .filter((item) => item.value > 0)
          .map((item) => (
            <div
              key={item.key}
              title={`${item.label} ${countText(item.value)} ${unit}`}
              style={{
                width: `${(item.value / total) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          ))}
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {segments.map((item) => (
          <div key={item.key} className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-[12px] text-slate-500 3xl:text-[13px]">
                {item.label}
              </span>
            </span>
            <span className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[19px] font-bold leading-7 tabular-nums tracking-tight text-slate-950 3xl:text-[21px]">
                {countText(item.value)}
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-400 3xl:text-[12px]">
                {percentOf(item.value, total)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export type BarRow = {
  key: string;
  label: string;
  value: number;
  note?: string;
  color?: string;
};

/** รายการแท่งแนวนอน — ความยาวเทียบกับค่ามากสุดในชุด */
export function BarList({
  rows,
  unit = "คน",
  color = "#2563eb",
  emptyText,
  showPercent = true,
}: {
  rows: BarRow[];
  unit?: string;
  color?: string;
  emptyText: string;
  showPercent?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-slate-400">{emptyText}</p>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[12.5px] text-slate-600 3xl:text-[13.5px]">
              {row.label}
            </p>
            <p className="shrink-0 text-[12.5px] tabular-nums 3xl:text-[13.5px]">
              <span className="font-bold text-slate-900">
                {countText(row.value)}
              </span>
              <span className="ml-1 text-[11px] font-semibold text-slate-400">
                {unit}
                {row.note
                  ? ` · ${row.note}`
                  : showPercent && total > 0
                    ? ` · ${percentOf(row.value, total)}%`
                    : ""}
              </span>
            </p>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.value / max) * 100}%`,
                backgroundColor: row.color ?? color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export type DonutRow = {
  key: string;
  label: string;
  value: number;
  color: string;
  note?: string;
};

/** โดนัท + รายการข้าง ๆ พร้อมยอดรวมกลางวง */
export function DonutBreakdown({
  rows,
  unit,
  emptyText,
}: {
  rows: DonutRow[];
  unit: string;
  emptyText: string;
}) {
  const total = rows.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-slate-400">{emptyText}</p>
    );
  }

  const visible = rows.filter((item) => item.value > 0);

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,160px)_1fr] sm:items-center">
      <div className="relative mx-auto h-36 w-full max-w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="label"
              innerRadius={40}
              outerRadius={62}
              paddingAngle={2}
              strokeWidth={0}
            >
              {visible.map((item) => (
                <Cell key={item.key} fill={item.color} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [
                `${countText(Number(value))} ${unit}`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[17px] font-bold leading-6 tabular-nums text-slate-950 3xl:text-[19px]">
            {countText(total)}
          </span>
          <span className="text-[10.5px] text-slate-400">{unit}</span>
        </div>
      </div>

      <div className="grid gap-1.5">
        {rows.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-2 text-[12.5px] 3xl:text-[13.5px]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-slate-600">{item.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              {item.note ? (
                <span className="text-[10.5px] text-slate-400">{item.note}</span>
              ) : null}
              <span
                className={`font-bold tabular-nums ${
                  item.value === 0 ? "text-slate-300" : "text-slate-900"
                }`}
              >
                {countText(item.value)}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {percentOf(item.value, total)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
