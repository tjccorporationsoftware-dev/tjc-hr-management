"use client";

import { Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { Notice, StatusBadge, joinClassName } from "@/components/kit";
import type { EmployeeDetail } from "@/types/employee";
import type { EmployeeCompensationItem } from "@/types/payroll-extensions";
import type { EmployeeCompensation } from "@/types/payroll";

import {
  compensationTotalOf,
  dateText,
  moneyText,
  onOffText,
  paymentMethodText,
  textOf,
} from "./employee-format";

/**
 * เงินเดือนและค่าตอบแทน
 * ---------------------
 * หน้านี้เป็นมุมมองอ่านอย่างเดียว การแก้ไขจริงอยู่ที่ /payroll/employees
 *
 * ไล่จากบนลงล่างตามที่คนเปิดแฟ้มถามจริง:
 *   1. ตอนนี้ได้เท่าไร และยอดนั้นมาจากอะไรบ้าง
 *   2. เงินเข้าทางไหน หักอะไรบ้าง เลขนำส่งครบหรือยัง
 *   3. เคยปรับมาแล้วกี่ครั้ง แต่ละครั้งขึ้นเท่าไร
 */

function toNumber(value?: string | number | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * เงินเพิ่มประจำแยกก้อน — อ่านจาก "รายการประจำ" ที่ใช้อยู่ ณ วันนี้
 *
 * เดิมอ่านจากช่องคงที่ 4 ช่องในใบเงินเดือน ซึ่งถูกยกเลิกไปแล้ว ถ้ายังอ่านที่เดิม
 * แฟ้มพนักงานจะขึ้นว่าไม่มีเงินเพิ่มสักบาททั้งที่จ่ายอยู่จริงทุกเดือน
 */
function allowanceBreakdown(items: EmployeeCompensationItem[]) {
  const today = new Date();

  return items
    .filter((item) => {
      if (item.type !== "EARNING") return false;
      if (item.status && item.status !== "ACTIVE") return false;
      if (new Date(item.effectiveDate) > today) return false;
      return !item.endDate || new Date(item.endDate) >= today;
    })
    .map((item) => ({ label: item.name, amount: toNumber(item.amount) }))
    .filter((entry) => entry.amount > 0);
}

export function PayrollTab({
  employee,
  compensations,
  compensationItems,
  current,
  loading,
  accessDenied,
}: {
  employee: EmployeeDetail;
  compensations: EmployeeCompensation[];
  /** รายการประจำของพนักงานคนนี้ — ที่อยู่ใหม่ของเบี้ยประจำทั้งหมด */
  compensationItems: EmployeeCompensationItem[];
  current: EmployeeCompensation | null;
  loading: boolean;
  accessDenied: boolean;
}) {
  if (accessDenied) {
    return (
      <div className="px-5 py-5 sm:px-6 3xl:px-7">
        <Notice tone="warning">
          บัญชีของคุณไม่มีสิทธิ์ดูข้อมูลค่าตอบแทนของพนักงานรายนี้
        </Notice>
      </div>
    );
  }

  const profile = employee.profile;
  const breakdown = allowanceBreakdown(compensationItems);

  /* เรียงจากใหม่ไปเก่า แล้วเทียบกับใบก่อนหน้าเพื่อบอกว่าปรับขึ้น/ลงเท่าไร */
  const history = [...compensations].sort((left, right) =>
    String(right.effectiveDate ?? "").localeCompare(
      String(left.effectiveDate ?? ""),
    ),
  );

  return (
    <div className="min-w-0">
      {/*
        1. ที่มาของค่าตอบแทนที่ใช้อยู่ — เดิมรวมเงินเพิ่มทุกก้อนเป็นตัวเลขเดียว
        เปิดดูแล้วไม่รู้ว่าเป็นค่าตำแหน่งหรือค่าเดินทาง ต้องข้ามไปหน้าค่าจ้าง
      */}
      <section className="border-b border-slate-200 px-5 py-4 sm:px-6 3xl:px-7">
        <p className="mb-3 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          ค่าตอบแทนประจำที่ใช้อยู่
          {current ? ` · มีผลตั้งแต่ ${dateText(current.effectiveDate)}` : ""}
        </p>

        {current ? (
          <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
            <PayFact
              label="ฐานเงินเดือน"
              value={moneyText(current.baseSalary)}
            />
            {breakdown.map((entry) => (
              <PayFact
                key={entry.label}
                label={entry.label}
                value={moneyText(entry.amount)}
              />
            ))}
            {breakdown.length === 0 ? (
              <PayFact label="เงินเพิ่มประจำ" value="0.00" muted />
            ) : null}
          </div>
        ) : (
          <p className="py-2 text-[13px] text-slate-400">
            ยังไม่มีรายการค่าตอบแทน
          </p>
        )}
      </section>

      {/* 2. เงินเข้าทางไหน หักอะไร */}
      <section className="border-b border-slate-200 px-5 py-4 sm:px-6 3xl:px-7">
        <p className="mb-3 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          การรับเงินและข้อมูลนำส่ง
        </p>

        <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
          <PayFact
            label="วิธีรับเงิน"
            value={paymentMethodText(
              current?.paymentMethod || profile?.payrollPaymentMethod,
            )}
            compact
          />
          <PayFact
            label="ธนาคาร"
            value={textOf(current?.bankName || profile?.bankName)}
            compact
          />
          <PayFact
            label="เลขบัญชี"
            value={textOf(current?.bankAccountNo || profile?.bankAccountNo)}
            compact
          />
          <PayFact
            label="ชื่อบัญชี"
            value={textOf(current?.bankAccountName || profile?.bankAccountName)}
            compact
          />
        </div>

        <div className="mt-3 flex flex-wrap items-stretch divide-x divide-brand-100 border-t border-brand-50 pt-3">
          <PayFact
            label="คำนวณภาษี"
            value={current ? onOffText(current.taxEnabled) : "-"}
            compact
          />
          <PayFact
            label="หักประกันสังคม"
            value={current ? onOffText(current.socialSecurityEnabled) : "-"}
            compact
          />
          <PayFact
            label="เลขผู้เสียภาษี"
            value={textOf(profile?.taxId)}
            compact
          />
          <PayFact
            label="เลขประกันสังคม"
            value={textOf(profile?.socialSecurityNo)}
            compact
          />
        </div>
      </section>

      {/* 3. ประวัติการปรับค่าตอบแทน */}
      <section className="px-5 py-4 sm:px-6 3xl:px-7">
        <p className="mb-2 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          ประวัติการปรับค่าตอบแทน
        </p>

        {loading ? (
          <p className="py-10 text-center text-[13px] font-semibold text-slate-600">
            กำลังโหลด…
          </p>
        ) : history.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีข้อมูลค่าตอบแทน
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              ตั้งค่าเงินเดือนได้ที่หน้าจัดการค่าตอบแทน
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-brand-50">
            {history.map((item, index) => {
              const total = compensationTotalOf(item);
              const previous = history[index + 1];
              const diff = previous ? total - compensationTotalOf(previous) : 0;
              const isCurrent = item.id === current?.id;

              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5"
                >
                  <span
                    className={joinClassName(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isCurrent
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-400",
                    )}
                  >
                    <Wallet className="h-4 w-4" />
                  </span>

                  <div className="min-w-[9rem] flex-1">
                    <p className="truncate text-[13px] font-bold tabular-nums text-slate-900 3xl:text-[13.5px]">
                      มีผล {dateText(item.effectiveDate)}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-500">
                      {[
                        isCurrent ? "ใช้อยู่ตอนนี้" : "รายการย้อนหลัง",
                        `ฐาน ${moneyText(item.baseSalary)}`,
                      ].join(" · ")}
                    </p>
                  </div>

                  {/* ปรับขึ้น/ลงเท่าไรจากใบก่อนหน้า — ตัวเลขที่คนดูประวัติอยากรู้จริง */}
                  <div className="w-28 shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      เปลี่ยนแปลง
                    </p>
                    <p
                      className={joinClassName(
                        "text-[13px] font-semibold tabular-nums",
                        diff > 0
                          ? "text-emerald-600"
                          : diff < 0
                            ? "text-rose-600"
                            : "text-slate-300",
                      )}
                    >
                      {previous
                        ? diff === 0
                          ? "เท่าเดิม"
                          : `${diff > 0 ? "+" : "−"}${moneyText(Math.abs(diff))}`
                        : "ครั้งแรก"}
                    </p>
                  </div>

                  <div className="w-32 shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      รวมค่าตอบแทน
                    </p>
                    <p className="text-[14px] font-bold tabular-nums text-slate-900 3xl:text-[15px]">
                      {moneyText(total)}
                    </p>
                  </div>

                  <div className="w-24 shrink-0">
                    <StatusBadge status={item.status} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

/** ตัวเลขหนึ่งช่องในแท็บเงินเดือน */
function PayFact({
  label,
  value,
  muted = false,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  muted?: boolean;
  compact?: boolean;
}) {
  const empty = value === "-" || value === "" || value == null;

  return (
    <div className="min-w-[8.5rem] flex-1 px-4 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={joinClassName(
          "truncate font-bold tabular-nums",
          compact
            ? "text-[13px] 3xl:text-[13.5px]"
            : "text-[15px] 3xl:text-[16px]",
          muted || empty ? "text-slate-300" : "text-slate-900",
        )}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}
