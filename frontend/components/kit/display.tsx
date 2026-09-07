import type { ReactNode } from "react";

import { joinClassName } from "@/components/ui/class-name";
import { StatusBadge as BaseStatusBadge } from "@/components/ui/status-badge";
import { PAYROLL_STATUS } from "@/lib/status-labels";

import type { Tone } from "./tokens";

/**
 * การแสดงค่าที่ใช้ซ้ำทั้งโซน
 * เงินต้องเป็น tabular-nums เสมอ ไม่งั้นคอลัมน์ตัวเลขในตารางจะเต้น
 */

export function formatMoney(value?: string | number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0.00";

  return amount.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function Money({ value }: { value?: string | number | null }) {
  return <span className="tabular-nums">{formatMoney(value)}</span>;
}

export function StatusBadge({ status }: { status?: string | null }) {
  return (
    <BaseStatusBadge vocabulary={PAYROLL_STATUS} status={status || "DRAFT"} />
  );
}

const BADGE_TONE: Record<Tone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
};

/**
 * ป้ายสั้น ๆ ที่ "ไม่ใช่" สถานะกลางของระบบ เช่น ประเภทของรายการ
 * ถ้าเป็นสถานะที่มีคำเรียกกลางอยู่แล้วให้ใช้ StatusBadge เพื่อให้คำและสีตรงกันทั้งระบบ
 * รูปทรงเท่ากับ StatusBadge เป๊ะ ป้ายสองแบบจึงวางในตารางเดียวกันได้โดยไม่เตะตา
 */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={joinClassName(
        /* ห้ามหักคำเหมือนกับ StatusBadge — สองตัวนี้ต้องรูปทรงเท่ากันเป๊ะ */
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold 3xl:text-[12.5px] 4xl:text-[13px]",
        BADGE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}
