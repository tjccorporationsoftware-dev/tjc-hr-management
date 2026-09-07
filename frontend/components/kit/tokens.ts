/**
 * ค่าพื้นฐานของหน้าจอโซนเงินเดือน
 * ------------------------------
 * แนวทาง 2D: ไม่มีเงา ไม่มีไล่สี ใช้ "ผืนขาวผืนเดียวต่อหน้า" แล้วแบ่งส่วนด้วย
 * เส้นบาง ๆ แทนการวางการ์ดลอยซ้อนกัน
 *
 * เหตุผล: การ์ดหลายใบทำให้แต่ละใบมีเนื้อหานิดเดียวและมีขอบเยอะ หน้าเลยดูโล่ง
 * ผืนเดียวที่แบ่งด้วยเส้นใส่ข้อมูลได้แน่นกว่าและอ่านเป็นลำดับได้ง่ายกว่า
 */

export const CONTROL_HEIGHT = "h-9 3xl:h-10 4xl:h-10";

export const RADIUS_CONTROL = "rounded-lg";
export const RADIUS_SURFACE = "rounded-xl";

/** พื้นหลังฟ้าอ่อนแบน ๆ ไม่ไล่สี เพื่อให้ผืนขาวตัดขึ้นมาชัด */
export const PAGE_BACKGROUND = "bg-brand-50";

export const HAIRLINE = "border-slate-200";

export const PAGE_MAX_WIDTH = "max-w-[1600px]";

export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white";

export const CONTROL_BASE = `${CONTROL_HEIGHT} ${RADIUS_CONTROL} w-full border ${HAIRLINE} bg-white px-3 text-[13px] 3xl:px-3.5 3xl:text-[13.5px] 4xl:text-[14px] text-slate-800 transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 ${FOCUS_RING} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`;

/** ผืนขาวของหน้า — ขอบบาง ไม่มีเงา */
export const SURFACE_BASE = `${RADIUS_SURFACE} border ${HAIRLINE} bg-white`;

export type Tone = "neutral" | "brand" | "positive" | "warning" | "critical";

export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-100 text-brand-700",
  positive: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-rose-100 text-rose-700",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-slate-900",
  brand: "text-brand-700",
  positive: "text-emerald-700",
  warning: "text-amber-700",
  critical: "text-rose-700",
};
