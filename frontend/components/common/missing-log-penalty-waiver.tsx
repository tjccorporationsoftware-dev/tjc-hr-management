"use client";

import { useState } from "react";
import { CircleSlash, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { setAttendanceMissingLogPenaltyWaiver } from "@/lib/api";
import { money, toNumber } from "@/lib/payroll-format";
import type { AttendanceDailySummary } from "@/types/attendance";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/*
 * ปุ่มตัดสินใจรายวันว่า "ค่าปรับลืมสแกน" ของวันนั้นจะหักหรือไม่หัก
 * ------------------------------------------------------------
 * ยกเว้นเฉพาะค่าปรับลืมสแกน ไม่แตะมาสาย/กลับก่อน/ขาดงาน
 * นาทีและสถานะขาดสแกนยังคงตามจริงทุกอย่าง เปลี่ยนแค่ยอดเงิน
 */

type WaivableSummary = Pick<
  AttendanceDailySummary,
  | "id"
  | "missingLogPenaltyAmount"
  | "missingLogPenaltyWaived"
  | "penaltyWaivedAmount"
  | "penaltyWaivedReason"
  | "lockedAt"
  | "sentToPayrollAt"
  | "payrollRunId"
>;

export function hasMissingLogPenaltyDecision(summary: WaivableSummary) {
  return (
    Boolean(summary.missingLogPenaltyWaived) ||
    toNumber(summary.missingLogPenaltyAmount) > 0
  );
}

export function MissingLogPenaltyWaiverControl({
  summary,
  disabled,
  className,
  /**
   * `row` — ป้ายยอด + ปุ่ม วางเรียงกัน ใช้ในแถบกว้างของป๊อปอัพ /attendance
   * `stacked` — ปุ่มเดียวเต็มความกว้าง มียอดอยู่ในปุ่ม ใช้ในคอลัมน์แคบของ /hr-review
   */
  layout = "row",
  onChanged,
}: {
  summary: WaivableSummary;
  disabled?: boolean;
  className?: string;
  layout?: "row" | "stacked";
  onChanged?: (updated: AttendanceDailySummary) => void;
}) {
  const [saving, setSaving] = useState(false);

  const waived = Boolean(summary.missingLogPenaltyWaived);
  const amount = waived
    ? toNumber(summary.penaltyWaivedAmount)
    : toNumber(summary.missingLogPenaltyAmount);

  if (!hasMissingLogPenaltyDecision(summary)) return null;

  /* วันที่ล็อกหรือส่งเข้างวดแล้ว แก้ยอดหักไม่ได้ */
  const locked = Boolean(
    summary.lockedAt || summary.sentToPayrollAt || summary.payrollRunId,
  );

  const handleToggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await setAttendanceMissingLogPenaltyWaiver(summary.id, {
        waived: !waived,
      });
      toast.success(
        waived
          ? `กลับมาหักค่าปรับลืมสแกน ${money(amount)} บ. แล้ว`
          : `ยกเว้นค่าปรับลืมสแกน ${money(amount)} บ. แล้ว`,
      );
      onChanged?.(updated);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ปรับการหักไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  };

  const stacked = layout === "stacked";

  const button = (
    <button
      type="button"
      onClick={handleToggle}
      disabled={disabled || locked || saving}
      title={
        locked
          ? "วันนี้ถูกล็อกหรือส่งเข้างวดเงินเดือนแล้ว"
          : waived
            ? "กลับไปหักค่าปรับตามที่ระบบคำนวณ"
            : "ไม่หักค่าปรับลืมสแกนของวันนี้"
      }
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border text-[12px] font-semibold transition",
        "disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300",
        stacked ? "w-full px-2" : "h-7 px-2.5",
        waived
          ? "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
      )}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : waived ? (
        <RotateCcw className="h-3.5 w-3.5" />
      ) : (
        <CircleSlash className="h-3.5 w-3.5" />
      )}
      {stacked
        ? waived
          ? `กลับมาหัก ${money(amount)} บ.`
          : `ไม่หัก ${money(amount)} บ.`
        : waived
          ? "กลับมาหัก"
          : "ไม่หัก"}
    </button>
  );

  /* คอลัมน์แคบ — ยอดอยู่ในปุ่มแล้ว ไม่ต้องมีป้ายซ้ำอีกชิ้น */
  if (stacked) {
    return <div className={cn("w-full", className)}>{button}</div>;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
          waived
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-600",
        )}
      >
        {waived ? `ยกเว้นแล้ว ${money(amount)} บ.` : `หัก ${money(amount)} บ.`}
      </span>
      {button}
    </div>
  );
}
