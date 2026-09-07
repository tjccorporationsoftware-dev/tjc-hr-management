"use client";

import { useMemo, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import {
  Button,
  ButtonLink,
  DataTable,
  Section,
  Select,
  StatTile,
  formatMoney,
  joinClassName,
  type Column,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { PAYROLL_STATUS } from "@/lib/status-labels";
import { getExecutiveInsights, getHrDashboardPayrollSummary } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type {
  ExecutiveInsightsResponse,
  HrPayrollMonthItem,
  HrPayrollSummaryResponse,
} from "@/types/dashboard";

import { DonutBreakdown, countText } from "@/components/common/insight-blocks";

/**
 * แท็บเงินเดือน
 * -------------
 * ไล่จากคำถามใหญ่ไปเล็ก: ปีนี้จ่ายไปเท่าไร -> แต่ละเดือนขึ้นลงยังไง ->
 * เงินก้อนนั้นเป็นอะไรบ้าง (รายได้ประจำ/ไม่ประจำ และรายการหัก) -> รายละเอียดรายงวด
 *
 * แยก "รายได้ประจำ" กับ "ไม่ประจำ" เป็นเรื่องหลักของแท็บนี้ เพราะสองก้อนนี้
 * บริหารคนละแบบ — ก้อนประจำคือภาระผูกพันที่ลดไม่ได้ในระยะสั้น
 * ส่วนก้อนไม่ประจำ (OT เบี้ยเลี้ยง โบนัส) คือส่วนที่กดได้ถ้าคุมงานดีขึ้น
 */

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[11.5px]";

const EARNING_COLORS: Record<string, string> = {
  BASE_SALARY: "#2563eb",
  ALLOWANCE: "#0ea5e9",
  OVERTIME: "#f59e0b",
  BONUS: "#8b5cf6",
  ATTENDANCE: "#10b981",
  ADJUSTMENT: "#94a3b8",
};

const DEDUCTION_COLORS: Record<string, string> = {
  TAX: "#e11d48",
  SOCIAL_SECURITY: "#f97316",
  ATTENDANCE: "#8b5cf6",
  LEAVE: "#f59e0b",
  ADJUSTMENT: "#94a3b8",
};

/** ย่อจำนวนเงินบนแกนกราฟ (ยอดเงินเดือนเป็นหลักล้าน) */
function moneyAxisText(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} ล.`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} พ.`;
  return String(value);
}

function percentText(value: number) {
  return `${Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 1,
  })}%`;
}

export function PayrollPanel() {
  const [year, setYear] = useState<number | undefined>(undefined);

  const query = useApiQuery<HrPayrollSummaryResponse>(
    queryKeys.executive.cost({ year: year ?? 0 }),
    () => getHrDashboardPayrollSummary(year),
  );

  // ต้นทุนต่อหัวและสัดส่วน OT มาจากชุดตัวชี้วัด ไม่ต้องคำนวณซ้ำที่หน้า
  const insightQuery = useApiQuery<ExecutiveInsightsResponse>(
    queryKeys.executive.overview(),
    () => getExecutiveInsights(),
  );

  const data = query.data ?? null;
  const months = data?.months ?? [];
  const totals = data?.totals ?? null;
  const composition = data?.composition ?? null;
  const cost = insightQuery.data?.cost ?? null;

  const hasData = months.some((month) => month.netPay > 0);

  /** เดือนที่ยังไม่คำนวณต้องเป็นช่องว่าง ไม่ใช่ศูนย์ ไม่งั้นกราฟดิ่งลงพื้น */
  const chartData = useMemo(
    () =>
      (data?.months ?? []).map((month) => ({
        label: month.label,
        baseSalary: month.netPay > 0 ? month.baseSalary : null,
        otherEarnings: month.netPay > 0 ? month.otherEarnings : null,
        netPay: month.netPay > 0 ? month.netPay : null,
      })),
    [data?.months],
  );

  const earningRows = (composition?.earnings ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    value: item.amount,
    color: EARNING_COLORS[item.key] ?? "#94a3b8",
    note: item.recurring ? "ประจำ" : "ไม่ประจำ",
  }));

  const deductionRows = (composition?.deductions ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    value: item.amount,
    color: DEDUCTION_COLORS[item.key] ?? "#94a3b8",
  }));

  const recurringAmount = (composition?.earnings ?? [])
    .filter((item) => item.recurring)
    .reduce((sum, item) => sum + item.amount, 0);
  const variableAmount = (composition?.earnings ?? [])
    .filter((item) => !item.recurring)
    .reduce((sum, item) => sum + item.amount, 0);
  const earningTotal = recurringAmount + variableAmount;

  const monthColumns: Array<Column<HrPayrollMonthItem>> = [
    {
      key: "label",
      header: "งวด",
      cell: (row) => (
        <span className="font-semibold text-slate-900">{row.label}</span>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (row) =>
        row.hasRun ? (
          <StatusBadge vocabulary={PAYROLL_STATUS} status={row.status} />
        ) : (
          <span className="text-[12px] text-slate-400">ยังไม่เปิดงวด</span>
        ),
    },
    {
      key: "employees",
      header: "พนักงาน",
      align: "right",
      cell: (row) => countText(row.employees),
    },
    {
      key: "base",
      header: "รายได้ประจำ",
      align: "right",
      hideBelow: "lg",
      cell: (row) => formatMoney(row.baseSalary),
    },
    {
      key: "other",
      header: "รายได้ไม่ประจำ",
      align: "right",
      hideBelow: "lg",
      cell: (row) => formatMoney(row.otherEarnings),
    },
    {
      key: "deductions",
      header: "รายการหัก",
      align: "right",
      cell: (row) => (
        <span className="text-rose-600">{formatMoney(row.deductions)}</span>
      ),
    },
    {
      key: "net",
      header: "จ่ายสุทธิ",
      align: "right",
      cell: (row) => (
        <span className="font-bold text-slate-950">
          {formatMoney(row.netPay)}
        </span>
      ),
    },
    {
      key: "tax",
      header: "ภาษี",
      align: "right",
      hideBelow: "xl",
      cell: (row) => formatMoney(row.tax),
    },
    {
      key: "sso",
      header: "ประกันสังคม",
      align: "right",
      hideBelow: "xl",
      cell: (row) => formatMoney(row.socialSecurityEmployee),
    },
  ];

  if (query.isPending) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <LoadingState
          title="กำลังโหลดข้อมูลเงินเดือน"
          description="ระบบกำลังรวมยอดของทุกงวดในปีที่เลือก"
        />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <ErrorState
          title="โหลดข้อมูลเงินเดือนไม่สำเร็จ"
          description={getErrorMessage(query.error, "ลองใหม่อีกครั้ง")}
          action={
            <Button variant="primary" onClick={() => void query.refetch()}>
              ลองใหม่
            </Button>
          }
        />
      </div>
    );
  }

  const buddhistYear = (data?.year ?? 0) + 543;

  return (
    <>
      <section className="border-b border-slate-200 px-5 py-4 3xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL_CLASS}>ค่าจ้างและเงินเดือน ปี {buddhistYear}</p>
            <p className="mt-1 text-[13px] text-slate-500 3xl:text-[14px]">
              รวมทุกงวดที่คำนวณแล้ว {countText(totals?.runCount ?? 0)} จาก{" "}
              {countText(totals?.periodCount ?? 0)} งวดของปีนี้
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="block w-24 shrink-0">
              <Select
                value={String(data?.year ?? "")}
                onChange={(event) =>
                  setYear(Number(event.target.value) || undefined)
                }
                className="border-slate-300 bg-white shadow-none"
                aria-label="ปีของข้อมูลเงินเดือน"
              >
                {(data?.availableYears ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item + 543}
                  </option>
                ))}
              </Select>
            </span>

            <Button
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              icon={
                <RefreshCw
                  className={joinClassName(
                    "h-3.5 w-3.5",
                    query.isFetching && "animate-spin",
                  )}
                />
              }
            >
              โหลดข้อมูลใหม่
            </Button>

            <ButtonLink
              href="/payroll"
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              ไปหน้าเงินเดือน
            </ButtonLink>
          </div>
        </div>

        <div className={joinClassName("mt-3", TILE_BOX)}>
          <StatTile
            label="จ่ายสุทธิทั้งปี"
            value={formatMoney(totals?.netPay ?? 0)}
            helper={`ค่าจ้างรวม ${formatMoney((totals?.baseSalary ?? 0) + (totals?.otherEarnings ?? 0))} บาท`}
          />
          <StatTile
            label="ต้นทุนต่อหัว/งวด"
            value={formatMoney(cost?.costPerHead || cost?.costPerHeadPrev || 0)}
            helper={
              cost?.costPerHead
                ? "งวดล่าสุดที่คำนวณแล้ว"
                : "งวดนี้ยังไม่คำนวณ — แสดงงวดก่อน"
            }
          />
          <StatTile
            label="ภาษีนำส่งทั้งปี"
            value={formatMoney(totals?.tax ?? 0)}
            helper="ภ.ง.ด.1 สะสม"
          />
          <StatTile
            label="ประกันสังคมนำส่ง"
            value={formatMoney(
              (totals?.socialSecurityEmployee ?? 0) +
                (totals?.socialSecurityEmployer ?? 0),
            )}
            helper="ลูกจ้าง + นายจ้าง"
          />
        </div>
      </section>

      <Section
        title="ค่าจ้างรายเดือน"
        description="แท่งคือค่าจ้างรวม แบ่งเป็นประจำกับไม่ประจำ · เส้นดำคือยอดที่โอนจริง"
      >
        {!hasData ? (
          <p className="py-10 text-center text-[13px] text-slate-400">
            ปี {buddhistYear} ยังไม่มีงวดที่คำนวณเงินเดือนแล้ว
          </p>
        ) : (
          <div className="h-64 3xl:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={moneyAxisText}
                />
                <RechartsTooltip
                  cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    `${formatMoney(Number(value))} บาท`,
                    String(name),
                  ]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                />
                <Bar
                  dataKey="baseSalary"
                  name="รายได้ประจำ"
                  stackId="pay"
                  fill="#93c5fd"
                  maxBarSize={30}
                />
                <Bar
                  dataKey="otherEarnings"
                  name="รายได้ไม่ประจำ"
                  stackId="pay"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={30}
                />
                <Line
                  type="monotone"
                  dataKey="netPay"
                  name="จ่ายสุทธิ"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <div className="grid border-b border-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <Section
          title="สัดส่วนรายได้"
          description={
            earningTotal > 0
              ? `ประจำ ${percentText((recurringAmount / earningTotal) * 100)} · ไม่ประจำ ${percentText((variableAmount / earningTotal) * 100)} ของงวดล่าสุด`
              : "ของงวดที่คำนวณแล้วล่าสุด"
          }
          className="lg:border-b-0"
        >
          <DonutBreakdown
            rows={earningRows}
            unit="บาท"
            emptyText="ยังไม่มีงวดที่คำนวณแล้ว"
          />

          {earningTotal > 0 ? (
            <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-brand-300"
                style={{ width: `${(recurringAmount / earningTotal) * 100}%` }}
                title="รายได้ประจำ"
              />
              <div
                className="bg-brand-600"
                style={{ width: `${(variableAmount / earningTotal) * 100}%` }}
                title="รายได้ไม่ประจำ"
              />
            </div>
          ) : null}

          {earningTotal > 0 ? (
            <p className="mt-2 text-[11.5px] text-slate-400 3xl:text-[12.5px]">
              ส่วนที่กดต้นทุนได้คือก้อนไม่ประจำ {formatMoney(variableAmount)} บาท
              — ก้อนประจำเป็นภาระผูกพันที่ลดไม่ได้ในระยะสั้น
            </p>
          ) : null}
        </Section>

        <Section
          title="รายการหักของพนักงาน"
          description="เงินที่ถูกหักออกจากค่าจ้างก่อนโอนเข้าบัญชี"
        >
          <DonutBreakdown
            rows={deductionRows}
            unit="บาท"
            emptyText="ยังไม่มีรายการหักในงวดล่าสุด"
          />
        </Section>
      </div>

      <Section
        title="รายละเอียดรายงวด"
        description={`ทุกงวดของปี ${buddhistYear} พร้อมภาษีและประกันสังคมของแต่ละงวด`}
        tight
      >
        <DataTable
          columns={monthColumns}
          rows={months}
          rowKey={(row) => String(row.month)}
          emptyTitle="ยังไม่มีงวดเงินเดือน"
          minWidth="min-w-[62rem]"
        />
      </Section>
    </>
  );
}
