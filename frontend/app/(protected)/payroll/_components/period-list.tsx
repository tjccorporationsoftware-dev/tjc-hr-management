"use client";

import { ChevronRight, Trash2 } from "lucide-react";

import { IconButton, StatusBadge, joinClassName } from "@/components/kit";
import { count, dateText, money } from "@/lib/payroll-format";
import type { PayrollPeriod, PayrollRun } from "@/types/payroll";

import { periodLabel } from "./period-format";

/**
 * รายการงวดเงินเดือน
 * -----------------
 * หน้าแรกของโซนเงินเดือนคือ "งวดไหนถึงไหนแล้ว" ไม่ใช่ยอดของงวดใดงวดหนึ่ง
 * แต่ละใบสรุปความคืบหน้ากับยอดของรอบที่ยังใช้งานอยู่ กดแล้วค่อยเข้าไปทำงานในงวดนั้น
 *
 * เดิมเป็นตาราง 8 คอลัมน์กว้าง 58rem ที่ซ่อนพนักงาน/รายได้/หักรวมตามความกว้างจอ
 * จอปกติจึงเห็นแค่ครึ่งเดียวของสิ่งที่ระบบมีอยู่จริง
 */

/** วันที่จ่ายบอกอย่างเดียวไม่พอ ต้องรู้ว่าเลยกำหนดหรือใกล้ถึงกำหนดแล้ว */
function paymentHint(period: PayrollPeriod, run?: PayrollRun) {
  if (run?.status === "PAID") return null;

  const payment = new Date(period.paymentDate);
  if (Number.isNaN(payment.getTime())) return null;

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const days = Math.round(
    (payment.getTime() - startOfToday.getTime()) / 86_400_000,
  );

  if (days < 0) {
    return { text: `เลยกำหนด ${Math.abs(days)} วัน`, tone: "late" as const };
  }
  if (days === 0) return { text: "ครบกำหนดวันนี้", tone: "soon" as const };
  if (days <= 7) return { text: `อีก ${days} วัน`, tone: "soon" as const };
  return null;
}

/**
 * ลบงวดได้เฉพาะงวดที่ยัง "ว่าง" จริง ๆ
 *
 * รอบคำนวณถูกสร้างตั้งแต่ตอนเปิดหน้างวด แค่มีรอบจึงไม่ใช่เหตุผลที่จะห้ามลบ
 * ที่ห้ามจริงคือรอบที่เริ่มทำไปแล้ว (มีพนักงานในรอบ หรือเดินเลยสถานะร่าง)
 * และงวดที่ถูกล็อก/ปิด — ตรงกับกติกาที่หลังบ้านบังคับ ถ้าไม่เช็คให้ตรงกัน
 * ปุ่มจะโผล่ให้กดแล้วไปเด้ง error เอาตอนกด
 */
export function canDeletePeriod(period: PayrollPeriod, run?: PayrollRun) {
  if (period.status === "LOCKED" || period.status === "CLOSED") return false;

  if (!run) return true;

  const started = run.status !== "DRAFT" && run.status !== "CANCELLED";

  return !started && Number(run.totalEmployees ?? 0) === 0;
}

export function PeriodList({
  periods,
  runByPeriodId,
  loading,
  onOpen,
  onDelete,
  deletingId,
}: {
  periods: PayrollPeriod[];
  runByPeriodId: Map<string, PayrollRun>;
  loading: boolean;
  onOpen: (period: PayrollPeriod) => void;
  onDelete?: (period: PayrollPeriod) => void;
  deletingId?: string | null;
}) {
  /** ยอดรวมรายปี ใช้แสดงบนหัวกลุ่ม — งวดเรียงตามปีมาแล้วจากหลังบ้าน */
  const yearTotals = new Map<
    number,
    { periods: number; net: number; employees: number }
  >();

  for (const period of periods) {
    const current = yearTotals.get(period.year) ?? {
      periods: 0,
      net: 0,
      employees: 0,
    };
    const run = runByPeriodId.get(period.id);

    current.periods += 1;
    current.net += Number(run?.totalNetPay ?? 0);
    current.employees = Math.max(current.employees, run?.totalEmployees ?? 0);
    yearTotals.set(period.year, current);
  }

  if (loading && periods.length === 0) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-[13px] font-semibold text-slate-600">กำลังโหลด…</p>
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-[13px] font-semibold text-slate-600">
          ยังไม่มีงวดเงินเดือน
        </p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
          กดปุ่มสร้างงวดใหม่เพื่อเริ่มทำเงินเดือนงวดแรกของบริษัทนี้
        </p>
      </div>
    );
  }

  return (
    <div>
      {periods.map((period, index) => {
        const isFirstOfYear =
          index === 0 || periods[index - 1]?.year !== period.year;
        const totals = yearTotals.get(period.year);

        return (
          <div key={period.id}>
            {isFirstOfYear ? (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-y border-brand-200 bg-brand-100/70 px-6 py-2 sm:px-7 3xl:px-8">
                <span className="flex items-center gap-2 text-[13px] font-bold text-brand-900 3xl:text-[13.5px]">
                  <span className="h-4 w-1.5 shrink-0 rounded-full bg-brand-600" />
                  ปี {period.year + 543}
                  {totals ? (
                    <span className="font-semibold text-brand-500">
                      {totals.periods} งวด
                    </span>
                  ) : null}
                </span>
                {totals ? (
                  <span className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-500">
                      จ่ายรวมทั้งปี
                    </span>
                    <span className="text-[13.5px] font-bold text-brand-900 3xl:text-[14px]">
                      {money(totals.net)}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}

            <PeriodRow
              period={period}
              run={runByPeriodId.get(period.id)}
              onOpen={() => onOpen(period)}
              onDelete={onDelete ? () => onDelete(period) : undefined}
              deleting={deletingId === period.id}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * งวดหนึ่งงวดในรายการ — บรรทัดเดียว
 * ซ้ายบอกว่างวดไหนช่วงไหน ขวาเป็นตัวเลขของงวดนั้นเรียงติดกันคั่นด้วยเส้น
 * ปิดท้ายด้วยเงินสุทธิตัวใหญ่ ซึ่งเป็นตัวเลขที่คนเปิดหน้านี้มองหาก่อนเพื่อน
 */
function PeriodRow({
  period,
  run,
  onOpen,
  onDelete,
  deleting,
}: {
  period: PayrollPeriod;
  run?: PayrollRun;
  onOpen: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const hint = paymentHint(period, run);
  const deletable = Boolean(onDelete) && canDeletePeriod(period, run);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8"
    >
      <div className="min-w-[13rem] flex-1">
        <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
          {periodLabel(period)}
        </p>
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {dateText(period.startDate)} – {dateText(period.endDate)}
          {run ? (
            <>
              <span className="mx-1.5 text-slate-300">·</span>
              <span className="tabular-nums">{run.runNo}</span>
            </>
          ) : null}
        </p>
      </div>

      {/* วันที่จ่าย พร้อมคำเตือนว่าเลยกำหนดหรือใกล้ถึงกำหนด */}
      <div className="w-32 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          วันที่จ่าย
        </p>
        <p className="truncate text-[12.5px] tabular-nums text-slate-800 3xl:text-[13px]">
          {dateText(period.paymentDate)}
        </p>
        {hint ? (
          <p
            className={joinClassName(
              "truncate text-[11px] font-semibold 3xl:text-[11.5px]",
              hint.tone === "late" ? "text-rose-600" : "text-amber-600",
            )}
          >
            {hint.text}
          </p>
        ) : null}
      </div>

      {/* ตัวเลขของงวดนี้ เรียงติดกันคั่นด้วยเส้น */}
      <div className="flex shrink-0 items-center divide-x divide-brand-100">
        <PeriodFact
          label="พนักงาน"
          value={run ? `${count(run.totalEmployees)} คน` : "-"}
          muted={!run}
        />
        <PeriodFact
          label="รายได้รวม"
          value={run ? money(run.totalEarnings) : "-"}
          muted={!run}
        />
        <PeriodFact
          label="หักรวม"
          value={run ? money(run.totalDeductions) : "-"}
          muted={!run}
          tone={run ? "deduct" : undefined}
        />
      </div>

      {/* เงินสุทธิ — ตัวเลขหลักของงวด */}
      <div className="w-36 shrink-0 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          เงินสุทธิ
        </p>
        <p
          className={joinClassName(
            "truncate tabular-nums",
            run
              ? "text-[15px] font-bold text-slate-900 3xl:text-[16px]"
              : "text-[13px] text-slate-300",
          )}
        >
          {run ? money(run.totalNetPay) : "-"}
        </p>
      </div>

      <div className="w-28 shrink-0">
        {run ? (
          <StatusBadge status={run.status} />
        ) : (
          <span className="text-[12px] text-slate-400 3xl:text-[12.5px]">
            ยังไม่เริ่มทำ
          </span>
        )}
      </div>

      {/*
        ลบได้เฉพาะงวดที่ยังไม่มีรอบคำนวณและยังไม่ล็อก
        ต้องหยุด event ไม่ให้ทะลุไปโดนทั้งแถว ไม่งั้นกดลบแล้วเด้งเข้าหน้างวดแทน
      */}
      <div className="w-9 shrink-0">
        {deletable ? (
          <IconButton
            title="ลบงวดนี้"
            tone="danger"
            disabled={deleting}
            icon={<Trash2 className="h-4 w-4" />}
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.();
            }}
          />
        ) : null}
      </div>

      {/* ทั้งแถวกดได้อยู่แล้ว ลูกศรบอกว่ากดแล้วไปต่อได้ ไม่ต้องมีปุ่มเป็นกล่อง */}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
    </article>
  );
}

/** ตัวเลขหนึ่งช่องในแถวงวด */
function PeriodFact({
  label,
  value,
  tone,
  muted = false,
}: {
  label: string;
  value: string;
  tone?: "deduct";
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={joinClassName(
          "whitespace-nowrap text-[12.5px] font-semibold tabular-nums 3xl:text-[13px]",
          muted
            ? "text-slate-300"
            : tone === "deduct"
              ? "text-rose-600"
              : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
