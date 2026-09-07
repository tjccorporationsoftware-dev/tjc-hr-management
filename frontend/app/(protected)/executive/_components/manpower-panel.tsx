"use client";

import { useMemo, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import {
  Button,
  Section,
  Select,
  StatTile,
  joinClassName,
} from "@/components/kit";
import { getExecutiveInsights, getManpowerOverview } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import { BarList, countText } from "@/components/common/insight-blocks";
import { DataTable, type Column } from "@/components/kit";
import { formatMoney } from "@/components/kit";
import type { ExecutiveDepartmentInsight, ExecutiveInsightsResponse } from "@/types/dashboard";
import type {
  ManpowerFilterOption,
  ManpowerOverview,
  ManpowerQueryParams,
} from "@/types/manpower";

/**
 * แท็บกำลังคนของผู้บริหาร
 * ----------------------
 * รวมของเดิมสองที่: หน้า Executive Manpower ทั้งหน้า และการ์ด
 * "กำลังคนตามแผนก"/"สถานะพนักงาน" ที่เคยซ้ำอยู่บน Executive Dashboard
 *
 * ตัวกรองเดิมมีเจ็ดช่อง (ค้นหา บริษัท สาขา ฝ่าย แผนก ประเภท ตำแหน่ง สถานะ)
 * ซึ่งเป็นมุมของ HR ที่ต้องหาคนรายตัว ระดับผู้บริหารดูแค่ว่า "ตัดตามหน่วยไหน"
 * จึงเหลือสี่ช่องที่ใช้จริง ที่เหลือไปใช้ที่หน้ากำลังคนฝั่ง HR ได้
 */

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[11.5px]";

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "ACTIVE", label: "ปฏิบัติงาน" },
  { value: "PROBATION", label: "ทดลองงาน" },
  { value: "SUSPENDED", label: "พักงาน" },
  { value: "RESIGNED", label: "ลาออก" },
  { value: "TERMINATED", label: "เลิกจ้าง" },
  { value: "INACTIVE", label: "ไม่ใช้งาน" },
];

type Filters = {
  companyId: string;
  branchId: string;
  departmentId: string;
  status: string;
};

const emptyFilters: Filters = {
  companyId: "",
  branchId: "",
  departmentId: "",
  status: "",
};

/** +3 / -2 / เท่าเดิม — ใช้กับตัวเลขที่เทียบกับเดือนก่อน */
function deltaText(value: number, unit: string) {
  if (value === 0) return `เท่าเดิมจากเดือนก่อน`;
  const sign = value > 0 ? "+" : "-";
  return `${sign}${countText(Math.abs(value))} ${unit} จากเดือนก่อน`;
}

/** "3 ปี 8 เดือน" — อ่านง่ายกว่าจำนวนเดือนดิบ */
function tenureText(months: number) {
  if (!months) return "-";

  const years = Math.floor(months / 12);
  const rest = Math.round(months % 12);

  if (years && rest) return `${years} ปี ${rest} เดือน`;
  if (years) return `${years} ปี`;
  return `${rest} เดือน`;
}

function RetentionLine({
  label,
  value,
  helper,
  alert = false,
}: {
  label: string;
  value: string;
  helper: string;
  alert?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
          {label}
        </p>
        <p className="truncate text-[11.5px] text-slate-400 3xl:text-[12.5px]">
          {helper}
        </p>
      </div>
      <p
        className={`shrink-0 text-[15px] font-bold tabular-nums 3xl:text-[16px] ${
          alert ? "text-rose-600" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium text-slate-600 3xl:text-[12px]">
        {label}
      </span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-slate-300 bg-white shadow-none"
        aria-label={label}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

function toOptions(items?: ManpowerFilterOption[]) {
  return (items ?? []).map((item) => ({
    value: item.id,
    label: item.name || item.code,
  }));
}

export function ManpowerPanel() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const params: ManpowerQueryParams = useMemo(
    () => ({
      companyId: filters.companyId || undefined,
      branchId: filters.branchId || undefined,
      departmentId: filters.departmentId || undefined,
      status: (filters.status || undefined) as ManpowerQueryParams["status"],
    }),
    [filters],
  );

  const query = useApiQuery<ManpowerOverview>(
    queryKeys.executive.manpower(params as Record<string, unknown>),
    () => getManpowerOverview(params),
  );

  // ตัวชี้วัดการเข้า-ออกและตารางเทียบรายหน่วยงาน (ไม่ขึ้นกับตัวกรองด้านบน)
  const insightQuery = useApiQuery<ExecutiveInsightsResponse>(
    queryKeys.executive.overview(),
    () => getExecutiveInsights(),
  );

  const insights = insightQuery.data ?? null;

  const departmentColumns: Array<Column<ExecutiveDepartmentInsight>> = [
    {
      key: "label",
      header: "หน่วยงาน",
      cell: (row) => (
        <span className="font-semibold text-slate-900">{row.label}</span>
      ),
    },
    {
      key: "headcount",
      header: "คน",
      align: "right",
      cell: (row) => countText(row.headcount),
    },
    {
      key: "costPerHead",
      header: "ต้นทุน/หัว",
      align: "right",
      hideBelow: "lg",
      cell: (row) =>
        row.costPerHead ? (
          formatMoney(row.costPerHead)
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
    {
      key: "ot",
      header: "OT/หัว (ชม.)",
      align: "right",
      cell: (row) => row.otHoursPerHead.toLocaleString("th-TH"),
    },
    {
      key: "late",
      header: "สาย/หัว (นาที)",
      align: "right",
      hideBelow: "xl",
      cell: (row) => row.lateMinutesPerHead.toLocaleString("th-TH"),
    },
    {
      key: "absence",
      header: "ขาดงาน",
      align: "right",
      cell: (row) => (
        <span
          className={
            insights && row.absenceRate > insights.discipline.absenceRate * 2
              ? "font-bold text-rose-600"
              : ""
          }
        >
          {row.absenceRate.toLocaleString("th-TH")}%
        </span>
      ),
    },
    {
      key: "turnover",
      header: "ลาออก",
      align: "right",
      cell: (row) => (
        <span className={row.turnoverRate > 0 ? "font-bold text-rose-600" : ""}>
          {row.turnoverRate.toLocaleString("th-TH")}%
        </span>
      ),
    },
  ];

  const data = query.data ?? null;
  const metrics = data?.metrics;
  const charts = data?.charts;

  const companyOptions = toOptions(data?.filters?.companies);
  const branchOptions = toOptions(data?.filters?.branches);
  const departmentOptions = toOptions(data?.filters?.departments);

  const hasFilter = Object.values(filters).some(Boolean);

  if (query.isPending) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <LoadingState
          title="กำลังโหลดข้อมูลกำลังคน"
          description="ระบบกำลังรวบรวมอัตรากำลังและโครงสร้างองค์กรล่าสุด"
        />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <ErrorState
          title="โหลดข้อมูลกำลังคนไม่สำเร็จ"
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

  return (
    <>
      <section className="border-b border-slate-200 px-5 py-4 3xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL_CLASS}>โครงสร้างกำลังคน</p>
            <p className="mt-1 text-[13px] text-slate-500 3xl:text-[14px]">
              ตัวเลขทั้งหมดเปลี่ยนตามตัวกรองด้านล่าง
            </p>
          </div>

          <div className="flex items-center gap-2">
            {hasFilter ? (
              <Button
                onClick={() => setFilters(emptyFilters)}
                icon={<RotateCcw className="h-3.5 w-3.5" />}
              >
                ล้างตัวกรอง
              </Button>
            ) : null}
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
          </div>
        </div>

        <div className={joinClassName("mt-3", TILE_BOX)}>
          <StatTile
            label="พนักงานทั้งหมด"
            value={countText(metrics?.totalEmployees ?? 0)}
            helper={`${countText(metrics?.departmentCount ?? 0)} แผนก · ${countText(metrics?.branchCount ?? 0)} สาขา`}
          />
          <StatTile
            label="ปฏิบัติงานอยู่"
            value={countText(metrics?.activeEmployees ?? 0)}
            helper={`${metrics?.activeRate ?? 0}% ของทั้งหมด`}
          />
          <StatTile
            label="ทดลองงาน"
            value={countText(metrics?.probationEmployees ?? 0)}
            tone={(metrics?.probationEmployees ?? 0) > 0 ? "warning" : "neutral"}
            helper="ต้องสรุปผลก่อนครบกำหนด"
          />
          <StatTile
            label="เข้าใหม่เดือนนี้"
            value={countText(metrics?.currentMonthNewEmployees ?? 0)}
            helper={deltaText(metrics?.newEmployeeDelta ?? 0, "คน")}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {companyOptions.length > 1 ? (
            <FilterSelect
              label="บริษัท"
              value={filters.companyId}
              options={companyOptions}
              placeholder="ทุกบริษัท"
              onChange={(value) =>
                setFilters((current) => ({ ...current, companyId: value }))
              }
            />
          ) : null}
          <FilterSelect
            label="สาขา"
            value={filters.branchId}
            options={branchOptions}
            placeholder="ทุกสาขา"
            onChange={(value) =>
              setFilters((current) => ({ ...current, branchId: value }))
            }
          />
          <FilterSelect
            label="แผนก"
            value={filters.departmentId}
            options={departmentOptions}
            placeholder="ทุกแผนก"
            onChange={(value) =>
              setFilters((current) => ({ ...current, departmentId: value }))
            }
          />
          <FilterSelect
            label="สถานะ"
            value={filters.status}
            options={STATUS_OPTIONS.filter((option) => option.value)}
            placeholder="ทุกสถานะ"
            onChange={(value) =>
              setFilters((current) => ({ ...current, status: value }))
            }
          />
        </div>
      </section>

      <div className="grid border-b border-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <Section
          title="กำลังคนตามแผนก"
          description="ดูว่ากำลังคนกระจุกอยู่ที่หน่วยไหน"
          className="lg:border-b-0"
        >
          <BarList
            rows={(charts?.byDepartment ?? []).slice(0, 8).map((item) => ({
              key: item.id ?? item.code,
              label: item.name || item.code,
              value: item.count,
            }))}
            emptyText="ยังไม่มีข้อมูลแผนก"
          />
        </Section>

        <Section
          title="สถานะพนักงาน"
          description="ใช้ประเมินความเสี่ยงด้านกำลังคน"
        >
          <BarList
            rows={(charts?.byStatus ?? []).map((item) => ({
              key: item.status,
              label: item.label || item.status,
              value: item.count,
            }))}
            color="#10b981"
            emptyText="ยังไม่มีข้อมูลสถานะ"
          />
        </Section>
      </div>

      <div className="grid border-b border-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <Section
          title="กำลังคนตามสาขา"
          description="พื้นที่ที่มีกำลังคนมากที่สุด"
          className="lg:border-b-0"
        >
          <BarList
            rows={(charts?.byBranch ?? []).slice(0, 8).map((item) => ({
              key: item.id ?? item.code,
              label: item.name || item.code,
              value: item.count,
            }))}
            color="#0ea5e9"
            emptyText="ยังไม่มีข้อมูลสาขา"
          />
        </Section>

        <Section
          title="ตำแหน่งหลัก"
          description="ตำแหน่งที่มีจำนวนพนักงานมากที่สุด"
        >
          <BarList
            rows={(charts?.byPosition ?? []).slice(0, 8).map((item) => ({
              key: item.position,
              label: item.position || "ไม่ระบุตำแหน่ง",
              value: item.count,
            }))}
            color="#8b5cf6"
            emptyText="ยังไม่มีข้อมูลตำแหน่ง"
          />
        </Section>
      </div>

      <div className="grid border-b border-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <Section
          title="ช่วงอายุพนักงาน"
          description="ใช้ประเมินโครงสร้างกำลังคนและการวางแผนผู้สืบทอด"
          className="lg:border-b-0"
        >
          <BarList
            rows={(charts?.byAge ?? []).map((item) => ({
              key: item.code,
              label: item.name || item.code,
              value: item.count,
            }))}
            color="#f59e0b"
            emptyText="ยังไม่มีข้อมูลช่วงอายุ (ต้องมีวันเกิดในแฟ้มพนักงาน)"
          />
        </Section>

        <Section
          title="การเข้า-ออกและการรักษาคน"
          description="ตัวเลขทั้งองค์กรเดือนนี้ เทียบกับเดือนก่อน"
        >
          <div className="divide-y divide-slate-100">
            <RetentionLine
              label="อัตราลาออก"
              value={`${(insights?.workforce.turnoverRate ?? 0).toLocaleString("th-TH")}%`}
              helper={`ออก ${countText(insights?.workforce.resigned ?? 0)} คน · เดือนก่อน ${countText(insights?.workforce.resignedPrev ?? 0)} คน`}
              alert={
                (insights?.workforce.turnoverRate ?? 0) >
                (insights?.workforce.turnoverRatePrev ?? 0)
              }
            />
            <RetentionLine
              label="รับเข้าเดือนนี้"
              value={`${countText(insights?.workforce.hired ?? 0)} คน`}
              helper={`เดือนก่อน ${countText(insights?.workforce.hiredPrev ?? 0)} คน`}
            />
            <RetentionLine
              label="อายุงานเฉลี่ย"
              value={tenureText(insights?.workforce.avgTenureMonths ?? 0)}
              helper="ยิ่งนานยิ่งรักษาคนได้ดี"
            />
            <RetentionLine
              label="ผ่านทดลองงาน"
              value={`${(insights?.workforce.probationPassRate ?? 0).toLocaleString("th-TH")}%`}
              helper="สัดส่วนคนที่ผ่านจากที่ประเมินจบแล้ว"
            />
          </div>
        </Section>
      </div>

      <Section
        title="เทียบรายหน่วยงาน"
        description="ใช้หาหน่วยที่มีปัญหา — ขาดงานเกินสองเท่าของค่าเฉลี่ยองค์กรจะขึ้นสีแดง"
        tight
      >
        <DataTable
          columns={departmentColumns}
          rows={insights?.departments ?? []}
          rowKey={(row) => row.id ?? row.label}
          emptyTitle="ยังไม่มีข้อมูลรายหน่วยงาน"
          emptyDescription="ต้องมีพนักงานผูกกับแผนกก่อน ตัวเลขถึงจะแยกได้"
          minWidth="min-w-[52rem]"
        />
      </Section>
    </>
  );
}
