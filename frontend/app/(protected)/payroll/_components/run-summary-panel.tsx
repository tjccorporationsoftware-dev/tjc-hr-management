"use client";

import { joinClassName } from "@/components/kit";
import { count, money } from "@/lib/payroll-format";
import {
  payrollLineLabel,
  sortLinesByAmountKeepingFamilies,
} from "@/lib/payroll-lines";
import type { PayrollRunDetail } from "@/types/payroll";

/**
 * สรุปยอดของงวด (ทั้งบริษัท)
 * -------------------------
 * ซ้ายคือเงินที่จ่ายออก ขวาคือเงินที่หักกลับ อ่านเทียบกันได้ในสายตาเดียว
 * แล้วปิดท้ายด้วยแถวเดียวที่บอกว่ารวมแล้วต้องโอนเท่าไหร่
 *
 * ตัวเลขทุกตัวมาจาก summary ที่ backend คิดจาก PayrollLine ของรอบนี้
 * ไม่ได้บวกใหม่ในหน้า ยอดจึงตรงกับสลิปและไฟล์นำส่งเสมอ
 */

type Row = {
  /* รหัสรายการ ใช้เป็น key ของ React — ชื่อซ้ำกันได้ รหัสซ้ำไม่ได้ */
  key: string;
  /* รหัสจริงของรายการ ใช้จับกลุ่มตอนเรียง (ค่าล่วงเวลาทุกประเภทเป็นกลุ่มเดียวกัน) */
  code: string;
  label: string;
  amount: number;
};

function AmountRow({ row, tone }: { row: Row; tone: "earning" | "deduction" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 3xl:px-6 4xl:px-7 py-2.5 sm:px-6">
      <p className="min-w-0 truncate text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-600">{row.label}</p>
      <p
        className={joinClassName(
          "shrink-0 text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] font-semibold tabular-nums",
          row.amount === 0
            ? "text-slate-300"
            : tone === "earning"
              ? "text-slate-900"
              : "text-rose-700",
        )}
      >
        {money(row.amount)}
      </p>
    </div>
  );
}

/**
 * หัวคอลัมน์บอก "กี่รายการ" ไม่ใช่ยอดเงิน
 * ยอดรวมของทั้งสองฝั่งอยู่ที่แถวปิดท้ายด้านล่างอยู่แล้ว วางซ้ำอีกที่ทำให้สายตา
 * ไม่รู้ว่าต้องอ่านตัวไหน — ใช้รูปแบบเดียวกับหัวข้อในป๊อปอัพรายคน
 */
function ColumnHeader({ title, itemCount }: { title: string; itemCount: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-brand-100 bg-brand-50/50 px-5 3xl:px-6 4xl:px-7 py-3 sm:px-6">
      <p className="flex items-center gap-2 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] font-bold uppercase tracking-wider text-brand-700">
        {/* แท่งฟ้าหน้าหัวข้อ ชุดเดียวกับหัวกลุ่มสาขาในตารางรายคน */}
        <span className="h-4 w-1.5 shrink-0 rounded-full bg-brand-600" />
        {title}
      </p>
      <p className="shrink-0 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold tabular-nums text-brand-500">
        {count(itemCount)} รายการ
      </p>
    </div>
  );
}

/**
 * รวมยอดจาก PayrollLine จริงของทุกคน แยกตามรายการ (code เดียวกันคือรายการเดียวกัน)
 * ทำแบบนี้เพื่อให้เห็นชื่อรายการครบตามที่คำนวณไว้จริง ไม่ต้องยุบเป็น "อื่น ๆ"
 */
function sumLinesByComponent(run: PayrollRunDetail, type: string): Row[] {
  const buckets = new Map<string, Row>();

  for (const item of run.items ?? []) {
    for (const line of item.lines ?? []) {
      if (line.type !== type) continue;

      const key = line.code || line.name;
      /* ชื่อรายการใช้ชุดเดียวกับป๊อปอัพรายคน จะได้ไม่เรียกคนละชื่อในสองแผง */
      const current = buckets.get(key) ?? {
        key,
        code: line.code,
        label: payrollLineLabel(line),
        amount: 0,
      };
      current.amount += Number(line.amount ?? 0);
      buckets.set(key, current);
    }
  }

  return sortLinesByAmountKeepingFamilies(Array.from(buckets.values()));
}

/** ถ้ายอดรวมของรายการย่อยไม่ครบเท่ายอดของงวด ให้โชว์ส่วนต่างไว้ ไม่ซ่อน */
function withRemainder(rows: Row[], total: number): Row[] {
  const listed = rows.reduce((sum, row) => sum + row.amount, 0);
  const remainder = Math.round((total - listed) * 100) / 100;
  if (Math.abs(remainder) < 0.01) return rows;

  return [
    ...rows,
    {
      key: "__remainder__",
      code: "__remainder__",
      label: "รายการอื่นที่ยังไม่ระบุประเภท",
      amount: remainder,
    },
  ];
}

export function RunSummaryPanel({ run }: { run: PayrollRunDetail }) {
  const easy = run.summary?.easy;

  const totalEarningsValue = easy ? easy.totalEarnings : Number(run.totalEarnings);
  const totalDeductionsValue = easy
    ? easy.totalDeductions
    : Number(run.totalDeductions);

  const earningRows = withRemainder(
    sumLinesByComponent(run, "EARNING"),
    totalEarningsValue,
  );
  const deductionRows = withRemainder(
    sumLinesByComponent(run, "DEDUCTION"),
    totalDeductionsValue,
  );
  const employerRows = sumLinesByComponent(run, "EMPLOYER_CONTRIBUTION");

  const totalEarnings = easy ? easy.totalEarnings : Number(run.totalEarnings);
  const totalDeductions = easy
    ? easy.totalDeductions
    : Number(run.totalDeductions);
  const totalNetPay = easy ? easy.totalNetPay : Number(run.totalNetPay);
  const employerContribution = easy?.employerContributionTotal ?? 0;

  return (
    <div>
      {earningRows.length || deductionRows.length ? (
        <div className="grid border-b border-slate-200 xl:grid-cols-2">
          <section className="border-b border-slate-200 xl:border-b-0 xl:border-r">
            <ColumnHeader title="รายรับ" itemCount={earningRows.length} />
            <div className="divide-y divide-slate-100">
              {earningRows.map((row) => (
                <AmountRow key={row.key} row={row} tone="earning" />
              ))}
            </div>
          </section>

          <section>
            <ColumnHeader
              title="รายการหัก"
              itemCount={deductionRows.length}
            />
            <div className="divide-y divide-slate-100">
              {deductionRows.map((row) => (
                <AmountRow key={row.key} row={row} tone="deduction" />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* แถวเดียวปิดท้าย: รวมรับ − รวมหัก = ที่ต้องโอนจริงของทั้งบริษัท */}
      <div className="flex flex-col gap-4 border-b border-slate-300 bg-brand-50/50 px-5 3xl:px-6 4xl:px-7 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500">รายรับรวม</span>
            <span className="text-[18px] 3xl:text-[19.5px] 4xl:text-[20.5px] font-bold tabular-nums text-slate-900">
              {money(totalEarnings)}
            </span>
            <span className="text-slate-400">−</span>
            <span className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500">รายการหักรวม</span>
            <span className="text-[18px] 3xl:text-[19.5px] 4xl:text-[20.5px] font-bold tabular-nums text-rose-700">
              {money(totalDeductions)}
            </span>
          </div>

          <p className="mt-1.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] text-slate-500">
            พนักงาน {count(run.totalEmployees)} คน
            {easy ? ` · ${easy.paymentMethodSummary.label}` : ""}
          </p>

          {employerContribution ? (
            <p className="mt-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] text-slate-500">
              สมทบส่วนนายจ้างอีก {money(employerContribution)} (ไม่หักจากพนักงาน)
              {employerRows.length
                ? ` — ${employerRows
                    .map((row) => `${row.label} ${money(row.amount)}`)
                    .join(" · ")}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-l-4 border-brand-600 pl-4 lg:text-right">
          <p className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold text-brand-700">
            เงินสุทธิที่ต้องโอน
          </p>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-brand-800">
            {money(totalNetPay)}
          </p>
        </div>
      </div>
    </div>
  );
}
