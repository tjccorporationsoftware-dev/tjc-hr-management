import type { Tone } from "@/components/kit";
import type {
  ManagerTeamMemberSummary,
  ManagerTodayStatus,
} from "@/types/manager";

/**
 * ของที่ทุกแท็บของหน้า "ทีมของฉัน" ใช้ร่วมกัน
 * -------------------------------------------
 * สีสถานะต้องเป็นชุดเดียวทั้งหน้า ไม่งั้นสลับแท็บแล้วสีเดียวกันความหมายเปลี่ยน
 *
 * หลักการให้สี: ให้เฉพาะเรื่องที่ต้องลงมือทำ
 *   เทา = ยังไม่ถึงเวลา / ไม่ต้องทำอะไร · เขียว = เรียบร้อย
 *   เหลือง = ต้องดู · แดง = ต้องจัดการ · น้ำเงิน = วางแผนไว้แล้ว (ลา)
 */

export const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0";

export const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[11.5px]";

export const STATUS_META: Record<
  ManagerTodayStatus,
  { label: string; tone: Tone; color: string; edge: string; order: number }
> = {
  NOT_CHECKED_IN: {
    label: "ยังไม่มา",
    tone: "neutral",
    color: "#cbd5e1",
    edge: "border-l-slate-300",
    order: 0,
  },
  LATE: {
    label: "มาสาย",
    tone: "warning",
    color: "#f59e0b",
    edge: "border-l-amber-500",
    order: 1,
  },
  ABSENT: {
    label: "ขาดงาน",
    tone: "critical",
    color: "#ef4444",
    edge: "border-l-rose-500",
    order: 2,
  },
  LEAVE: {
    label: "ลา",
    tone: "brand",
    color: "#60a5fa",
    edge: "border-l-brand-300",
    order: 3,
  },
  OFFSITE: {
    label: "นอกสถานที่",
    tone: "neutral",
    color: "#94a3b8",
    edge: "border-l-slate-400",
    order: 4,
  },
  PRESENT: {
    label: "มาทำงาน",
    tone: "positive",
    color: "#10b981",
    edge: "border-l-emerald-500",
    order: 5,
  },
  HOLIDAY: {
    label: "วันหยุด",
    tone: "neutral",
    color: "#e2e8f0",
    edge: "border-l-slate-200",
    order: 6,
  },
};

/** หาสิทธิ์วันลาของประเภทที่ต้องการจากชื่อไทย (พักร้อน / ป่วย / กิจ) */
export function balanceOf(member: ManagerTeamMemberSummary, keyword: string) {
  return member.leaveBalances.find((balance) =>
    (balance.nameTh ?? "").includes(keyword),
  );
}

/** ส่วนต่างเทียบเดือนก่อน — คืน null เมื่อเท่ากัน จะได้ไม่ต้องโชว์ลูกศร */
export function diffText(current: number, previous: number) {
  const gap = Math.round((current - previous) * 10) / 10;

  if (gap === 0) return null;

  return {
    gap,
    /** ตัวเลขพวกนี้ "น้อยลง = ดีขึ้น" ทั้งหมด (สาย ขาด ลงเวลาไม่ครบ) */
    improved: gap < 0,
    text: `${gap > 0 ? "+" : ""}${gap.toLocaleString("th-TH")}`,
  };
}
