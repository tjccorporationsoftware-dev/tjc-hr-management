"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import {
  Button,
  Notice,
  SearchInput,
  Select,
  joinClassName,
} from "@/components/kit";
import { LoadingState } from "@/components/common/feedback-state";
import { getManpowerOverview } from "@/lib/api";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import type { EmployeeStatus } from "@/types/employee";
import type {
  ManpowerAgeGroup,
  ManpowerFilterOption,
  ManpowerGenderGroup,
  ManpowerOrgGroup,
  ManpowerOverview,
  ManpowerPositionGroup,
} from "@/types/manpower";

/**
 * ภาพรวมอัตรากำลัง — เดิมเป็นหน้า /manpower แยก ยุบมาเป็นแท็บในหน้าโครงสร้างองค์กร
 * ตัวกรองที่นี่เป็นของตัวเอง แยกจากตัวกรองบริษัท/สาขา/แผนกที่ใช้ร่วมกับแท็บอื่น
 * เพราะ /manpower/overview นับข้อมูลจากมุมมองพนักงานทั้งองค์กร ไม่ใช่รายการอ้างอิงเดียวกัน
 *
 * หน้านี้ตอบสี่คำถาม เรียงจากบนลงล่าง:
 *   1. กำลังพลตอนนี้เท่าไหร่ และหายไปไหนบ้าง  → แถบตัวเลข
 *   2. กระจายตัวยังไง                          → สถานะ / อายุ / สังกัด / ประเภทจ้าง / ตำแหน่ง
 *
 * รายชื่อพนักงานรายคนไม่อยู่ที่นี่ — ดูที่ทะเบียนพนักงาน /employees
 */

/** สีในโดนัทต้องตรงกับ tone ของ badge สถานะที่ใช้ทั้งระบบ ไม่งั้นอ่านข้ามหน้าแล้วสับสน */
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#059669",
  PROBATION: "#2563eb",
  SUSPENDED: "#d97706",
  RESIGNED: "#64748b",
  TERMINATED: "#dc2626",
  INACTIVE: "#94a3b8",
};

const STATUS_OPTIONS: Array<{ value: EmployeeStatus | ""; label: string }> = [
  { value: "", label: "ทุกสถานะ" },
  ...(Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[]).map((value) => ({
    value,
    label: EMPLOYEE_STATUS[value].label,
  })),
];

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function hours(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export type ManpowerSummary = {
  total: number;
  active: number;
  activeRatePct: number;
  probation: number;
  newThisMonth: number;
  newDelta: number;
};

export function ManpowerPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: ManpowerSummary) => void;
}) {
  const [overview, setOverview] = useState<ManpowerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState<EmployeeStatus | "">("");
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      const data = await getManpowerOverview({
        companyId: companyId || undefined,
        branchId: branchId || undefined,
        departmentId: departmentId || undefined,
        status: status || undefined,
        q: search.trim() || undefined,
      });
      setOverview(data);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, branchId, departmentId, status, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูลครั้งแรกตอน mount
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ค้นหา/กรองอัตโนมัติ หน่วง 350ms
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const timer = window.setTimeout(() => void loadData(), 350);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const metrics = overview?.metrics;
  const charts = overview?.charts;

  const companies = overview?.filters?.companies ?? [];

  const branches = useMemo<ManpowerFilterOption[]>(
    () =>
      (overview?.filters?.branches ?? []).filter(
        (item) => !companyId || item.companyId === companyId,
      ),
    [overview?.filters?.branches, companyId],
  );

  const departments = useMemo<ManpowerFilterOption[]>(
    () =>
      (overview?.filters?.departments ?? []).filter((item) => {
        if (companyId && item.companyId !== companyId) return false;
        // แผนกส่วนใหญ่ไม่ผูกสาขา ตัวที่ผูกไว้เท่านั้นที่ต้องกรองตามสาขาที่เลือก
        if (branchId && item.branchId && item.branchId !== branchId) {
          return false;
        }
        return true;
      }),
    [overview?.filters?.departments, branchId, companyId],
  );

  /**
   * จำนวนคนต่อสาขา/แผนก สำหรับโชว์ในตัวกรอง
   * ตัวเลขนี้นับตามตัวกรองอื่นที่เลือกอยู่ จึงโชว์เฉพาะตอนที่ยังไม่ได้เจาะรายการนั้น
   * ไม่งั้นพอเลือกสาขาหนึ่งแล้ว สาขาที่เหลือจะขึ้น 0 ทั้งหมดจนเข้าใจผิด
   */
  const branchCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of charts?.byBranch ?? []) {
      if (row.id) map.set(row.id, row.count);
    }
    return map;
  }, [charts?.byBranch]);

  const departmentCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of charts?.byDepartment ?? []) {
      if (row.id) map.set(row.id, row.count);
    }
    return map;
  }, [charts?.byDepartment]);

  const statusPie = useMemo(
    () =>
      (charts?.byStatus ?? [])
        .filter((row) => row.count > 0)
        .map((row) => ({
          status: row.status,
          name: EMPLOYEE_STATUS[row.status]?.label ?? row.label,
          value: row.count,
        })),
    [charts?.byStatus],
  );

  useEffect(() => {
    if (!metrics) return;
    onSummaryChange?.({
      total: metrics.totalEmployees,
      active: metrics.activeEmployees,
      activeRatePct: Math.round(
        metrics.activeRate * (metrics.activeRate <= 1 ? 100 : 1),
      ),
      probation: metrics.probationEmployees,
      newThisMonth: metrics.currentMonthNewEmployees,
      newDelta: metrics.newEmployeeDelta,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  const total = metrics?.totalEmployees ?? 0;
  const offPayroll =
    (metrics?.resignedEmployees ?? 0) +
    (metrics?.terminatedEmployees ?? 0) +
    (metrics?.inactiveEmployees ?? 0);

  return (
    <>
      <div className="flex flex-col justify-between gap-3 border-b border-slate-300 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
        <p className="text-[13px] text-slate-500 3xl:text-[14px]">
          {metrics
            ? `${count(metrics.companyCount)} บริษัท · ${count(metrics.branchCount)} สาขา · ${count(metrics.departmentCount)} แผนก · ${count(metrics.positionCount)} ตำแหน่ง`
            : "กำลังโหลดตัวกรอง"}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="[&_input]:bg-slate-50/80 [&_input:focus]:bg-white">
            <SearchInput
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="ชื่อ / รหัสพนักงาน / ตำแหน่ง"
              className="w-full sm:w-56"
              aria-label="ค้นหาพนักงาน"
            />
          </div>

          {companies.length > 1 ? (
            <Select
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setBranchId("");
                setDepartmentId("");
              }}
              className="w-full sm:w-44"
              aria-label="บริษัท"
            >
              <option value="">ทุกบริษัท</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Select>
          ) : null}

          <Select
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setDepartmentId("");
            }}
            className="w-full sm:w-44"
            aria-label="สาขา"
          >
            <option value="">ทุกสาขา ({count(total)} คน)</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branchId
                  ? ""
                  : ` (${count(branchCountById.get(branch.id) ?? 0)} คน)`}
              </option>
            ))}
          </Select>

          <Select
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
            }}
            className="w-full sm:w-44"
            aria-label="แผนก"
          >
            <option value="">ทุกแผนก ({count(total)} คน)</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
                {departmentId
                  ? ""
                  : ` (${count(departmentCountById.get(department.id) ?? 0)} คน)`}
              </option>
            ))}
          </Select>

          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as EmployeeStatus | "");
            }}
            className="w-full sm:w-36"
            aria-label="สถานะ"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "ALL"} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Button
            onClick={() => void loadData()}
            disabled={loading}
            icon={
              <RefreshCcw
                className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              />
            }
          >
            รีเฟรช
          </Button>
        </div>
      </div>

      {errorText ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="critical">{errorText}</Notice>
        </div>
      ) : null}

      {loading && !overview ? (
        <div className="px-5 py-6 sm:px-6">
          <LoadingState title="กำลังรวบรวมข้อมูลอัตรากำลัง" />
        </div>
      ) : null}

      {overview && metrics ? (
        <>
          {/*
            ตัวเลขที่หัวหน้าหน้าไม่ได้บอก — คนหายไปไหน และมีงานค้างอะไรอยู่
            แถวเดียวจบ ของเดิมเป็นการ์ดสี่ใบสูงเกือบ 120px ดันกราฟตกจอ
          */}
          <div className="grid border-b border-slate-200 sm:grid-cols-2 xl:grid-cols-4">
            <ManpowerFact
              label="ไม่อยู่ในกำลังพล"
              value={count(offPayroll)}
              alert={offPayroll > 0}
              helper={`ลาออก ${count(metrics.resignedEmployees)} · เลิกจ้าง ${count(metrics.terminatedEmployees)} · ปิดใช้งาน ${count(metrics.inactiveEmployees)}`}
            />
            <ManpowerFact
              label="พักงาน"
              value={count(metrics.suspendedEmployees)}
              alert={metrics.suspendedEmployees > 0}
              helper="ยังนับเป็นพนักงานแต่ไม่ปฏิบัติงาน"
            />
            <ManpowerFact
              label="คำขอค้างอนุมัติ"
              value={count(metrics.pendingRequests)}
              alert={metrics.pendingRequests > 0}
              helper={`ลา ${count(metrics.pendingLeaveRequests)} · OT ${count(metrics.pendingOvertimeRequests)} · แก้เวลา ${count(metrics.pendingTimeAdjustRequests)}`}
            />
            <ManpowerFact
              label="OT อนุมัติเดือนนี้"
              value={`${hours(metrics.currentMonthApprovedOtHours)} ชม.`}
              helper={`${metrics.otHourDelta >= 0 ? "+" : ""}${hours(metrics.otHourDelta)} ชม. จากเดือนก่อน`}
            />
          </div>

          <div className="grid border-b border-slate-200 xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
            <ChartCell
              title="สัดส่วนตามสถานะ"
              description={`รวม ${count(total)} คน ตามตัวกรองปัจจุบัน`}
            >
              <StatusDonut data={statusPie} total={total} />
            </ChartCell>

            <ChartCell
              title="แยกตามเพศ"
              description={genderDescription(charts?.byGender ?? [], total)}
            >
              <GenderBars rows={charts?.byGender ?? []} total={total} />
            </ChartCell>
          </div>

          <div className="grid border-b border-slate-200 xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
            <ChartCell
              title="แยกตามสาขา"
              description={`รวม ${count(total)} คน · ${count(metrics.branchCount)} สาขา · แถบเข้ม = ปฏิบัติงานจริง`}
            >
              <OrgBars rows={charts?.byBranch ?? []} total={total} />
            </ChartCell>

            <ChartCell
              title="แยกตามแผนก"
              description={`รวม ${count(total)} คน · ${count(metrics.departmentCount)} แผนก · แถบเข้ม = ปฏิบัติงานจริง`}
            >
              <OrgBars rows={charts?.byDepartment ?? []} total={total} />
            </ChartCell>
          </div>

          <div className="grid border-b border-slate-200 xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
            <ChartCell
              title="โครงสร้างอายุ"
              description="ใช้ดูความเสี่ยงเรื่องการสืบทอดงาน"
            >
              <AgeBars ages={charts?.byAge ?? []} total={total} />
            </ChartCell>

            <ChartCell
              title="แยกตามประเภทการจ้าง"
              description={`${count(metrics.employeeTypeCount)} ประเภท · แถบเข้ม = ปฏิบัติงานจริง`}
            >
              <OrgBars rows={charts?.byEmployeeType ?? []} total={total} />
            </ChartCell>
          </div>

          <div className="border-b border-slate-200">
            <ChartCell
              title="ตำแหน่งที่มีคนมากที่สุด"
              description={`10 อันดับแรกจากทั้งหมด ${count(metrics.positionCount)} ตำแหน่ง`}
            >
              <PositionList positions={charts?.byPosition ?? []} />
            </ChartCell>
          </div>
        </>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

/** ช่องกราฟหนึ่งช่องในกริด — ขอบเป็นหน้าที่ของกริด ช่องนี้มีแค่หัวข้อกับเนื้อหา */
/** ตัวเลขสรุปหนึ่งช่อง — แถวเดียว ไม่ใช่การ์ดสามชั้น */
function ManpowerFact({
  label,
  value,
  helper,
  alert,
}: {
  label: string;
  value: string;
  helper: string;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-2.5 last:border-b-0 sm:border-r sm:px-6 sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-r xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(4n)]:border-r-0 xl:[&:nth-last-child(-n+4)]:border-b-0 3xl:px-7">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-500 3xl:text-[11.5px]">
          {label}
        </p>
        <p className="truncate text-[10.5px] leading-4 text-slate-400">
          {helper}
        </p>
      </div>

      <p
        className={joinClassName(
          "shrink-0 text-[20px] font-bold leading-none tabular-nums 3xl:text-[22px]",
          alert ? "text-amber-600" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 border-b border-slate-200 px-5 py-4 last:border-b-0 sm:px-6 xl:border-b-0 3xl:px-7">
      {/* ป้ายฟ้าคั่นเส้นบาง ชุดเดียวกับหัวข้อย่อยทั้งระบบ */}
      <div className="border-b border-brand-100 pb-1.5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </h2>
        <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
          {description}
        </p>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyChart() {
  return (
    <p className="py-8 text-center text-[13px] text-slate-400">ไม่มีข้อมูล</p>
  );
}

/** แถวป้าย + จำนวน + สัดส่วน ที่ทุกกราฟแท่งในหน้านี้ใช้ร่วมกัน */
function BarRow({
  label,
  value,
  pct,
  children,
}: {
  label: string;
  value: string;
  pct: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px] 3xl:text-[14px]">
        <span className="min-w-0 truncate text-slate-600">{label}</span>
        <span className="shrink-0 tabular-nums font-semibold text-slate-900">
          {value}
          <span className="ml-1.5 font-normal text-slate-400">{pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        {children}
      </div>
    </div>
  );
}

function StatusDonut({
  data,
  total,
}: {
  data: Array<{ name: string; status: string; value: number }>;
  total: number;
}) {
  if (data.length === 0) return <EmptyChart />;

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-center">
      <div className="relative mx-auto h-48 w-full max-w-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={86}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.status}
                  fill={STATUS_COLOR[entry.status] ?? "#94a3b8"}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("th-TH")} คน`,
                String(name ?? ""),
              ]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold tabular-nums leading-8 text-slate-900">
            {count(total)}
          </span>
          <span className="text-[11px] text-slate-400">คนทั้งหมด</span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;

          return (
            <div
              key={entry.status}
              className="flex items-center justify-between gap-2 py-2 text-[13px] 3xl:text-[14px]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: STATUS_COLOR[entry.status] ?? "#94a3b8",
                  }}
                />
                <span className="truncate text-slate-600">{entry.name}</span>
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                {count(entry.value)}
                <span className="ml-1.5 font-normal text-slate-400">
                  {pct}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * กราฟแท่งของกลุ่มสังกัด — แบ่งแถบเป็นสองท่อน
 * ท่อนเข้ม = คนที่ปฏิบัติงานจริง ท่อนจาง = ทดลองงาน/พักงาน/พ้นสภาพ
 * ตัวเลขรวมอย่างเดียวตอบไม่ได้ว่าแผนกนั้นมีกำลังใช้งานจริงเท่าไหร่
 */
function OrgBars({ rows, total }: { rows: ManpowerOrgGroup[]; total: number }) {
  const visible = rows.filter((row) => row.count > 0).slice(0, 8);

  if (visible.length === 0) return <EmptyChart />;

  const max = Math.max(1, ...visible.map((row) => row.count));

  return (
    <div className="space-y-3.5">
      {visible.map((row) => {
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        const width = (row.count / max) * 100;
        const activeWidth = (row.activeCount / max) * 100;

        return (
          <BarRow
            key={row.id ?? row.name}
            label={row.name}
            value={`${count(row.count)} คน`}
            pct={pct}
          >
            <span
              className="h-full bg-brand-600"
              style={{ width: `${activeWidth}%` }}
            />
            <span
              className="h-full bg-brand-200"
              style={{ width: `${Math.max(width - activeWidth, 0)}%` }}
            />
          </BarRow>
        );
      })}

      {rows.length > visible.length ? (
        <p className="pt-1 text-[12px] text-slate-400 3xl:text-[13px]">
          แสดง {visible.length} จาก {count(rows.length)} รายการ —
          กรองให้แคบลงเพื่อดูรายการที่เหลือ
        </p>
      ) : null}
    </div>
  );
}

/** บรรทัดสรุปใต้หัวข้อเพศ — บอกทันทีว่ามีกี่คนที่ยังไม่กรอกข้อมูล */
function genderDescription(rows: ManpowerGenderGroup[], total: number) {
  const unknown =
    rows.find((row) => row.gender === "NOT_SPECIFIED")?.count ?? 0;

  if (total === 0) return "ยังไม่มีข้อมูล";
  if (unknown === 0) return `กรอกข้อมูลเพศครบทั้ง ${count(total)} คน`;

  return `ยังไม่ระบุเพศ ${count(unknown)} จาก ${count(total)} คน`;
}

function GenderBars({
  rows,
  total,
}: {
  rows: ManpowerGenderGroup[];
  total: number;
}) {
  const visible = rows.filter((row) => row.count > 0);

  if (visible.length === 0) return <EmptyChart />;

  const max = Math.max(1, ...visible.map((row) => row.count));

  return (
    <div className="space-y-3.5">
      {visible.map((row) => {
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        const width = (row.count / max) * 100;
        const activeWidth = (row.activeCount / max) * 100;

        return (
          <BarRow
            key={row.gender}
            label={row.label}
            value={`${count(row.count)} คน`}
            pct={pct}
          >
            <span
              className="h-full bg-brand-600"
              style={{ width: `${activeWidth}%` }}
            />
            <span
              className="h-full bg-brand-200"
              style={{ width: `${Math.max(width - activeWidth, 0)}%` }}
            />
          </BarRow>
        );
      })}
    </div>
  );
}

function AgeBars({ ages, total }: { ages: ManpowerAgeGroup[]; total: number }) {
  const rows = ages.filter((row) => row.count > 0);

  if (rows.length === 0) return <EmptyChart />;

  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className="space-y-3.5">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;

        return (
          <BarRow
            key={row.code}
            label={row.name}
            value={`${count(row.count)} คน`}
            pct={pct}
          >
            <span
              className="h-full bg-brand-600"
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </BarRow>
        );
      })}
    </div>
  );
}

function PositionList({ positions }: { positions: ManpowerPositionGroup[] }) {
  const rows = positions.filter((row) => row.position).slice(0, 10);

  if (rows.length === 0) return <EmptyChart />;

  /* ความยาวแถบเทียบกับตำแหน่งที่มีคนมากที่สุด ไม่ใช่กับทั้งองค์กร */
  const max = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className="divide-y divide-brand-50">
      {rows.map((row, index) => (
        <div
          key={row.position}
          className="flex items-center gap-3 py-2 text-[12.5px] 3xl:text-[13px]"
        >
          <span className="w-5 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-300">
            {index + 1}
          </span>

          <span className="min-w-[8rem] flex-1 truncate font-semibold text-slate-700">
            {row.position}
          </span>

          {/* แถบสัดส่วน ทำให้อ่านลำดับได้โดยไม่ต้องเทียบตัวเลขทีละแถว */}
          <span className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-brand-50 sm:block">
            <span
              className="block h-full rounded-full bg-brand-500"
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </span>

          {/* สองช่องขวาตรึงความกว้างไว้ ทุกแถวจึงตรงแนวกัน */}
          <span className="w-14 shrink-0 text-right font-bold tabular-nums text-slate-900">
            {count(row.count)} คน
          </span>

          {/* สีเดียวกันทุกแถว การจางเป็นบางแถวอ่านเหมือนข้อมูลคนละชั้น */}
          <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-slate-500">
            ปฏิบัติงาน {count(row.activeCount)}
          </span>
        </div>
      ))}
    </div>
  );
}
