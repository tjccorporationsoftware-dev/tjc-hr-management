"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock3,
  Ellipsis,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { getManpowerOverview, getPublicFileUrl } from "@/lib/api";
import { ErrorState } from "@/components/common/feedback-state";
import type {
  EmployeeStatus,
  ManpowerAgeGroup,
  ManpowerEmployee,
  ManpowerFilterOption,
  ManpowerOrgGroup,
  ManpowerOverview,
  ManpowerPositionGroup,
  ManpowerQueryParams,
  ManpowerStatusGroup,
} from "@/types/manpower";

import {
  formatThaiDate as formatDateFixDate,
  formatThaiDateTime as formatDateFixDateTime,
} from "@/lib/date-format";
type FilterState = {
  q: string;
  companyId: string;
  branchId: string;
  departmentId: string;
  divisionId: string;
  employeeTypeId: string;
  position: string;
  status: EmployeeStatus | "";
};

type Option = {
  value: string;
  label: string;
};

const cardClass =
  "rounded-[22px] border border-slate-200/80 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.045)]";

const employeeStatusText: Record<EmployeeStatus, string> = {
  ACTIVE: "ปฏิบัติงาน",
  INACTIVE: "ไม่ปฏิบัติงาน",
  PROBATION: "ทดลองงาน",
  RESIGNED: "ลาออก",
  SUSPENDED: "พักงาน",
  TERMINATED: "เลิกจ้าง",
};

const donutColorsAge = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#ea580c",
  "#059669",
  "#64748b",
  "#0284c7",
];

const donutColorsType = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#ea580c",
  "#059669",
  "#64748b",
];

const initialFilters: FilterState = {
  q: "",
  companyId: "",
  branchId: "",
  departmentId: "",
  divisionId: "",
  employeeTypeId: "",
  position: "",
  status: "",
};

export default function ManpowerPage() {
  const [loading, setLoading] = useState(false);
  const [baseOverview, setBaseOverview] = useState<ManpowerOverview | null>(
    null,
  );
  const [overview, setOverview] = useState<ManpowerOverview | null>(null);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function loadInitial() {
    setLoading(true);
    setErrorText(null);

    try {
      const data = await getManpowerOverview();
      setBaseOverview(data);
      setOverview(data);
    } catch (error) {
      console.error(error);
      setErrorText(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadFiltered(nextFilters: FilterState) {
    const params = buildManpowerParams(nextFilters);

    if (Object.keys(params).length === 0 && baseOverview) {
      setOverview(baseOverview);
      setErrorText(null);
      return;
    }

    setLoading(true);
    setErrorText(null);

    try {
      const data = await getManpowerOverview(params);
      setOverview(data);
    } catch (error) {
      console.error(error);
      setErrorText(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!baseOverview) return;

    const timer = window.setTimeout(() => {
      void loadFiltered(filters);
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseOverview,
    filters.q,
    filters.companyId,
    filters.branchId,
    filters.departmentId,
    filters.divisionId,
    filters.employeeTypeId,
    filters.position,
    filters.status,
  ]);

  const data = overview;
  const optionSource = baseOverview ?? overview;

  const metrics = data?.metrics;
  const latestEmployees = data?.lists?.latestEmployeesPreview ?? [];

  const totalEmployees = metrics?.totalEmployees ?? 0;
  const activeEmployees = metrics?.activeEmployees ?? 0;
  const activeRate = metrics?.activeRate ?? 0;

  const companyOptions = useMemo(
    () =>
      makeFilterOptions(
        optionSource?.filters?.companies,
        optionSource?.charts.byCompany ?? [],
        "ทุกบริษัท",
      ),
    [optionSource],
  );

  const branchOptions = useMemo(
    () =>
      makeFilterOptions(
        optionSource?.filters?.branches,
        optionSource?.charts.byBranch ?? [],
        "ทุกสาขา",
      ),
    [optionSource],
  );

  const departmentOptions = useMemo(
    () =>
      makeFilterOptions(
        optionSource?.filters?.departments,
        optionSource?.charts.byDepartment ?? [],
        "ทั้งหมด",
      ),
    [optionSource],
  );

  const divisionOptions = useMemo(
    () =>
      makeFilterOptions(
        optionSource?.filters?.divisions,
        optionSource?.charts.byDivision ?? [],
        "ทั้งหมด",
      ),
    [optionSource],
  );

  const employeeTypeOptions = useMemo(
    () =>
      makeFilterOptions(
        optionSource?.filters?.employeeTypes,
        optionSource?.charts.byEmployeeType ?? [],
        "ทั้งหมด",
      ),
    [optionSource],
  );

  const positionOptions = useMemo(() => {
    const positions = optionSource?.charts.byPosition ?? [];

    return [
      { value: "", label: "ทั้งหมด" },
      ...positions.map((item) => ({
        value: item.position,
        label: item.position,
      })),
    ];
  }, [optionSource]);

  const departmentChart = useMemo(() => {
    return toPercentItems(data?.charts.byDepartment ?? [], totalEmployees);
  }, [data, totalEmployees]);

  const positionChart = useMemo(() => {
    return toPositionPercentItems(
      data?.charts.byPosition ?? [],
      totalEmployees,
    );
  }, [data, totalEmployees]);

  const ageChart = useMemo(() => {
    return toAgePercentItems(data?.charts.byAge ?? [], totalEmployees);
  }, [data, totalEmployees]);

  const employeeTypeChart = useMemo(() => {
    return toPercentItems(data?.charts.byEmployeeType ?? [], totalEmployees);
  }, [data, totalEmployees]);

  const statusChart = useMemo(() => {
    return toStatusPercentItems(data?.charts.byStatus ?? [], totalEmployees);
  }, [data, totalEmployees]);

  const topDepartment = departmentChart[0];
  const topPosition = positionChart[0];
  const topAgeGroup = ageChart[0];
  const topEmployeeType = employeeTypeChart[0];
  const pendingLeaveRequests = metrics?.pendingLeaveRequests ?? 0;
  const pendingOvertimeRequests = metrics?.pendingOvertimeRequests ?? 0;
  const pendingTimeAdjustRequests = metrics?.pendingTimeAdjustRequests ?? 0;
  const pendingBreakdown = `ลา ${formatNumber(pendingLeaveRequests)} · OT ${formatNumber(pendingOvertimeRequests)} · แก้เวลา ${formatNumber(pendingTimeAdjustRequests)}`;

  return (
    <main className="min-h-[calc(100dvh-72px)] w-full space-y-4">
      <div className="mx-auto max-w-[1720px] space-y-4">
        <section className="relative overflow-hidden rounded-[30px] border border-blue-100 bg-white">
          <div className="absolute inset-y-0 right-0 hidden w-[42%] bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 lg:block" />
          <div className="absolute right-[-130px] top-[-160px] hidden h-[330px] w-[330px] rounded-full bg-blue-200/40 blur-3xl lg:block" />
          <div className="absolute bottom-[-175px] right-[8%] hidden h-[290px] w-[290px] rounded-full bg-sky-200/38 blur-3xl lg:block" />
          <div className="absolute left-[-150px] top-[-170px] h-[270px] w-[270px] rounded-full bg-indigo-100/50 blur-3xl" />

          <div className="relative p-5 sm:p-6 lg:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
              <div className="min-w-0 max-w-4xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[24px] border border-blue-100 bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <Users className="h-9 w-9" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                      <span>งาน HR</span>
                      <span>/</span>
                      <span className="text-blue-700">Manpower Analytics</span>
                    </div>

                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
                      Workforce Planning Center
                    </p>

                    <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.05em] text-slate-950 sm:text-4xl">
                      วิเคราะห์กำลังคนและอัตรากำลัง
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                      Dashboard สำหรับดูโครงสร้างพนักงาน จุดกระจุกตัวของแผนก
                      ตำแหน่ง สถานะกำลังคน และสัญญาณที่ HR ควรติดตาม
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white/85 px-3 py-1.5 text-xs font-bold text-blue-700 backdrop-blur">
                        <CalendarDays className="h-3.5 w-3.5" />
                        อัปเดตล่าสุด: {formatDateTimeThai(new Date())}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-white/85 px-3 py-1.5 text-xs font-bold text-sky-700 backdrop-blur">
                        <Users className="h-3.5 w-3.5" />
                        พนักงานทั้งหมด: {formatNumber(totalEmployees)} คน
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white/85 px-3 py-1.5 text-xs font-bold text-emerald-700 backdrop-blur">
                        <UserCheck className="h-3.5 w-3.5" />
                        อัตราปฏิบัติงาน: {activeRate.toLocaleString("th-TH")}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative flex flex-col gap-4 lg:min-h-[172px] lg:items-end lg:justify-between">
                <div className="relative z-20 flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                  <Link
                    href="/hr/dashboard"
                    className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700"
                  >
                    กลับ HR Dashboard
                  </Link>
                  <Link
                    href="/reports"
                    className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700"
                  >
                    รายงาน HR
                  </Link>
                  <button
                    type="button"
                    onClick={loadInitial}
                    disabled={loading}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", loading && "animate-spin")}
                    />
                    โหลดข้อมูล
                  </button>
                </div>

                <div className="relative hidden h-[142px] w-[315px] lg:block">
                  <div className="absolute bottom-5 right-[150px] h-[98px] w-[108px] rounded-[28px] border border-white/85 bg-white/82 backdrop-blur">
                    <div className="absolute left-5 top-6 h-3 w-[72px] rounded-full bg-blue-300" />
                    <div className="absolute left-5 top-12 h-3 w-[52px] rounded-full bg-sky-200" />
                    <div className="absolute left-5 top-[68px] h-3 w-20 rounded-full bg-indigo-200/80" />
                  </div>

                  <div className="absolute bottom-5 right-[70px] h-[90px] w-[108px] rounded-[36px] bg-sky-300/30">
                    <div className="absolute bottom-5 left-6 h-8 w-3.5 rounded-full bg-sky-400/70" />
                    <div className="absolute bottom-5 left-12 h-12 w-3.5 rounded-full bg-blue-400/70" />
                    <div className="absolute bottom-5 left-[72px] h-10 w-3.5 rounded-full bg-indigo-400/60" />
                  </div>

                  <div className="absolute bottom-2 right-0 grid h-[96px] w-[96px] place-items-center rounded-[30px] border border-white/85 bg-white/90 backdrop-blur">
                    <div className="grid h-[52px] w-[52px] place-items-center rounded-[20px] bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                      <BadgeCheck className="h-7 w-7" />
                    </div>
                  </div>

                  <div className="absolute bottom-[8px] right-[188px] inline-flex max-w-[132px] items-center gap-2 rounded-2xl border border-blue-100 bg-white/92 px-3 py-2 text-xs font-bold text-blue-700 backdrop-blur">
                    <UserCheck className="h-4 w-4 shrink-0" />
                    <span className="truncate">{formatNumber(activeEmployees)} คน</span>
                  </div>

                  <div className="absolute bottom-[74px] right-[212px] grid h-9 w-9 place-items-center rounded-2xl border border-white/75 bg-white/78 text-sky-600 backdrop-blur">
                    <CalendarDays className="h-4 w-4" />
                  </div>

                  <div className="absolute bottom-[102px] right-[104px] grid h-9 w-9 place-items-center rounded-2xl border border-white/75 bg-white/78 text-indigo-600 backdrop-blur">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {errorText ? (
          <ErrorState
            title="โหลดข้อมูลกำลังคนไม่สำเร็จ"
            description={errorText}
            action={
              <button
                type="button"
                onClick={loadInitial}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                ลองโหลดใหม่
              </button>
            }
          />
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="พนักงานทั้งหมด"
            value={totalEmployees}
            note={`เข้าใหม่เดือนนี้ ${formatNumber(metrics?.currentMonthNewEmployees ?? 0)} คน`}
            tone="blue"
            icon={<Users className="h-6 w-6" />}
          />
          <MetricCard
            title="แผนก"
            value={metrics?.departmentCount ?? 0}
            note={`สาขา ${formatNumber(metrics?.branchCount ?? 0)} แห่ง`}
            tone="teal"
            icon={<Building2 className="h-6 w-6" />}
          />
          <MetricCard
            title="ตำแหน่งงาน"
            value={metrics?.positionCount ?? 0}
            note="นับจากตำแหน่งที่มีอยู่จริง"
            tone="violet"
            icon={<BriefcaseBusiness className="h-6 w-6" />}
          />
          <MetricCard
            title="ประเภทสัญญา"
            value={metrics?.employeeTypeCount ?? 0}
            note="นับจากประเภทพนักงานจริง"
            tone="orange"
            icon={<FileText className="h-6 w-6" />}
          />
          <MetricCard
            title="พนักงานปฏิบัติงาน"
            value={activeEmployees}
            note={`อัตราปฏิบัติงาน ${activeRate.toLocaleString("th-TH")}%`}
            tone="green"
            icon={<UserCheck className="h-6 w-6" />}
          />
        </section>

        <section
          className={cn(
            cardClass,
            "p-4 sm:p-5",
          )}
        >
          <div className="space-y-4">
            {/* แถวที่ 1: ค้นหา + วันที่ */}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-end">
              <FilterField
                label="ค้นหาพนักงาน"
                control={
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                      value={filters.q}
                      onChange={(event) =>
                        setFilters((prev) => ({
                          ...prev,
                          q: event.target.value,
                        }))
                      }
                      placeholder="ชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทร"
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/60 pl-10 pr-10 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    />

                    <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                }
              />

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  ข้อมูล ณ วันที่
                </label>

                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

                  <input
                    value={formatShortDateThai(new Date())}
                    readOnly
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/60 pl-10 pr-4 text-sm text-slate-700 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* แถวที่ 2-3: ตัวกรอง 6 ช่อง แถวละ 3 ช่อง */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {/* companyOptions = "ทุกบริษัท" + companies → >2 แปลว่ามีหลายบริษัท */}
              {companyOptions.length > 2 ? (
                <div className="min-w-0">
                  <FilterSelect
                    label="บริษัท"
                    value={filters.companyId}
                    onChange={(value) =>
                      setFilters((prev) => ({ ...prev, companyId: value }))
                    }
                    options={companyOptions}
                  />
                </div>
              ) : null}

              <div className="min-w-0">
                <FilterSelect
                  label="สาขา"
                  value={filters.branchId}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, branchId: value }))
                  }
                  options={branchOptions}
                />
              </div>

              <div className="min-w-0">
                <FilterSelect
                  label="ฝ่าย/กลุ่มงาน"
                  value={filters.divisionId}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, divisionId: value }))
                  }
                  options={divisionOptions}
                />
              </div>

              <div className="min-w-0">
                <FilterSelect
                  label="ประเภทตำแหน่ง"
                  value={filters.position}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, position: value }))
                  }
                  options={positionOptions}
                />
              </div>

              <div className="min-w-0">
                <FilterSelect
                  label="ประเภทสัญญา"
                  value={filters.employeeTypeId}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, employeeTypeId: value }))
                  }
                  options={employeeTypeOptions}
                />
              </div>

              <div className="min-w-0">
                <FilterSelect
                  label="สถานะการทำงาน"
                  value={filters.status}
                  onChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: value as EmployeeStatus | "",
                    }))
                  }
                  options={[
                    { value: "", label: "ทั้งหมด" },
                    { value: "ACTIVE", label: "ปฏิบัติงาน" },
                    { value: "PROBATION", label: "ทดลองงาน" },
                    { value: "INACTIVE", label: "ไม่ปฏิบัติงาน" },
                    { value: "SUSPENDED", label: "พักงาน" },
                    { value: "RESIGNED", label: "ลาออก" },
                    { value: "TERMINATED", label: "เลิกจ้าง" },
                  ]}
                />
              </div>
            </div>

            {/* ปุ่มล้างตัวกรอง */}
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setFilters(initialFilters)}
                className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
              >
                ล้างตัวกรอง
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <ProgressCard
            title="แผนกที่ใช้กำลังคนสูงสุด"
            description="ดูสัดส่วนกำลังคนตามแผนก เพื่อช่วยวางแผนกระจายอัตรากำลัง"
            summary={
              topDepartment
                ? `${topDepartment.name} มากสุด ${formatNumber(topDepartment.count)} คน (${topDepartment.percent.toFixed(1)}%)`
                : "ยังไม่มีข้อมูลแผนก"
            }
            items={departmentChart}
            barClass="bg-blue-600"
          />

          <ProgressCard
            title="ตำแหน่งที่มีกำลังคนกระจุกตัว"
            description="ช่วยเห็นตำแหน่งที่มีจำนวนพนักงานสูง เพื่อใช้ประเมินโครงสร้างงาน"
            summary={
              topPosition
                ? `${topPosition.name} มากสุด ${formatNumber(topPosition.count)} คน (${topPosition.percent.toFixed(1)}%)`
                : "ยังไม่มีข้อมูลตำแหน่ง"
            }
            items={positionChart}
            barClass="bg-violet-500"
          />

          <ProgressCard
            title="สถานะกำลังคน"
            description="ตรวจสุขภาพกำลังคนจากสถานะพนักงานปัจจุบัน"
            summary={`ปฏิบัติงาน ${formatNumber(activeEmployees)} คน จากทั้งหมด ${formatNumber(totalEmployees)} คน`}
            items={statusChart}
            barClass="bg-emerald-500"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr_0.95fr]">
          <section
            className={cn(
              cardClass,
              "p-4",
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-slate-950">
                  ภาพรวมกำลังคนที่ควรติดตาม
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  รวมสัญญาณสำคัญสำหรับ HR: อัตราปฏิบัติงาน คำขอค้าง OT
                  และพนักงานเข้าใหม่
                </p>
              </div>
              <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-blue-100 bg-white/90 px-3 text-xs font-bold text-slate-500">
                {pendingBreakdown}
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
              <MiniMetric
                icon={<UserCheck className="h-5 w-5" />}
                title="อัตราปฏิบัติงาน"
                value={`${activeRate.toLocaleString("th-TH")}%`}
                note={`ปฏิบัติงาน ${formatNumber(activeEmployees)} คน จากทั้งหมด ${formatNumber(totalEmployees)} คน`}
                tone="blue"
              />

              <MiniMetric
                icon={<CalendarDays className="h-5 w-5" />}
                title="คำขอคงค้าง"
                value={metrics?.pendingRequests ?? 0}
                note={pendingBreakdown}
                tone="orange"
              />

              <MiniMetric
                icon={<Clock3 className="h-5 w-5" />}
                title="OT อนุมัติเดือนนี้"
                value={formatHours(metrics?.currentMonthApprovedOtHours ?? 0)}
                note={`${formatDelta(metrics?.otHourDelta ?? 0)} ชั่วโมงจากเดือนก่อน`}
                tone="violet"
              />

              <MiniMetric
                icon={<UserPlus className="h-5 w-5" />}
                title="พนักงานเข้าใหม่เดือนนี้"
                value={metrics?.currentMonthNewEmployees ?? 0}
                note={`${formatDelta(metrics?.newEmployeeDelta ?? 0)} คนจากเดือนก่อน`}
                tone="green"
              />
            </div>
          </section>

          <DonutCard
            title="การกระจายอายุพนักงาน"
            summary={
              topAgeGroup
                ? `กลุ่มหลัก: ${topAgeGroup.name} ${formatNumber(topAgeGroup.count)} คน (${topAgeGroup.percent.toFixed(1)}%)`
                : "ยังไม่มีข้อมูลอายุ"
            }
            total={totalEmployees}
            data={ageChart}
            colors={donutColorsAge}
          />

          <DonutCard
            title="ประเภทการจ้างงาน"
            summary={
              topEmployeeType
                ? `ประเภทหลัก: ${topEmployeeType.name} ${formatNumber(topEmployeeType.count)} คน (${topEmployeeType.percent.toFixed(1)}%)`
                : "ยังไม่มีข้อมูลประเภทการจ้างงาน"
            }
            total={totalEmployees}
            data={employeeTypeChart}
            colors={donutColorsType}
          />
        </section>

        <section className={cn(cardClass, "overflow-hidden")}>
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-slate-950">
                พนักงานที่เพิ่มล่าสุด
              </h2>
              <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600">
                {formatNumber(metrics?.totalEmployees ?? 0)} รายการ
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px]">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-5 py-3">รหัสพนักงาน</th>
                  <th className="px-5 py-3">ชื่อ-นามสกุล</th>
                  <th className="px-5 py-3">ตำแหน่งงาน</th>
                  <th className="px-5 py-3">แผนก</th>
                  <th className="px-5 py-3">วันที่เริ่มงาน</th>
                  <th className="px-5 py-3">ประเภทสัญญา</th>
                  <th className="px-5 py-3">สถานะการทำงาน</th>
                  <th className="px-5 py-3">การกระทำ</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {latestEmployees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-blue-50/35">
                    <td className="px-5 py-4 text-sm font-medium text-slate-700">
                      {employee.employeeCode || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar employee={employee} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {employeeName(employee)}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {employee.email || employee.user?.email || "-"}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-sm font-medium text-slate-700">
                        {employee.position || "-"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {employee.division?.nameTh || "-"}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-sm font-medium text-slate-700">
                        {employee.department?.nameTh || "-"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {employee.company?.nameTh || "-"}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatShortDateThai(employee.startDate)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={getEmployeeTypeBadge(
                          employee.employeeType?.nameTh,
                        )}
                      >
                        {employee.employeeType?.nameTh || "ไม่ระบุ"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={employee.status} />
                    </td>

                    <td className="px-5 py-4">
                      <Link
                        href={`/employees/${employee.id}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                        title="ดูข้อมูลพนักงาน"
                      >
                        <Ellipsis className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}

                {latestEmployees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-10 text-center text-sm text-slate-500"
                    >
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-sm text-slate-500">
            <span>
              แสดง {formatNumber(latestEmployees.length)} จาก{" "}
              {formatNumber(metrics?.totalEmployees ?? 0)} รายการ
            </span>
            <span>อัปเดตข้อมูลล่าสุด {formatDateTimeThai(new Date())}</span>
          </div>
        </section>
      </div>
    </main>
  );
}

function FilterField({
  label,
  control,
}: {
  label: string;
  control: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold text-slate-500">
        {label}
      </label>
      {control}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold text-slate-500">
        {label}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/60 px-4 pr-10 text-sm text-slate-700 outline-none transition focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
        >
          {options.map((item) => (
            <option key={`${item.value}-${item.label}`} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  note,
  tone,
  icon,
}: {
  title: string;
  value: number | string;
  note: string;
  tone: "blue" | "teal" | "violet" | "orange" | "green";
  icon: ReactNode;
}) {
  return (
    <section
      className={cn(
        cardClass,
        "p-5 transition hover:border-blue-100",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn("text-sm font-medium", toneText(tone))}>{title}</p>
          <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-slate-950">
            {typeof value === "number" ? formatNumber(value) : value}
          </p>
          <p className="mt-2 text-xs text-slate-500">{note}</p>
        </div>

        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full",
            toneBg(tone),
            toneText(tone),
          )}
        >
          {icon}
        </div>
      </div>
    </section>
  );
}

function ProgressCard({
  title,
  description,
  summary,
  items,
  barClass,
}: {
  title: string;
  description?: string;
  summary?: string;
  items: Array<{ name: string; count: number; percent: number }>;
  barClass: string;
}) {
  return (
    <section
      className={cn(
        cardClass,
        "p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold leading-5 text-slate-600">
          {summary}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <div key={item.name} className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <span className="truncate text-sm font-medium text-slate-700">
                {item.name}
              </span>
              <span className="text-sm text-slate-600">
                {formatNumber(item.count)} คน ({item.percent.toFixed(1)}%)
              </span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70">
              <div
                className={cn("h-full rounded-full", barClass)}
                style={{ width: `${Math.max(item.percent, 3)}%` }}
              />
            </div>
          </div>
        ))}

        {items.length === 0 ? <EmptyBox /> : null}
      </div>
    </section>
  );
}

function DonutCard({
  title,
  summary,
  total,
  data,
  colors,
}: {
  title: string;
  summary?: string;
  total: number;
  data: Array<{ name: string; count: number; percent: number }>;
  colors: string[];
}) {
  return (
    <section
      className={cn(
        cardClass,
        "p-5",
      )}
    >
      <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-950">
        {title}
      </h2>
      {summary ? (
        <p className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-600">
          {summary}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-[170px_1fr] xl:items-center">
        <div className="relative h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                innerRadius={55}
                outerRadius={78}
                stroke="none"
                paddingAngle={2}
              >
                {data.map((item, index) => (
                  <Cell key={item.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>

              <Tooltip
                formatter={(value, name) => [
                  `${formatNumber(Number(value ?? 0))} คน`,
                  String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm text-slate-500">รวม</span>
            <span className="text-[22px] font-semibold tracking-[-0.03em] text-slate-950">
              {formatNumber(total)}
            </span>
            <span className="text-sm text-slate-500">คน</span>
          </div>
        </div>

        <div className="space-y-4">
          {data.map((item, index) => (
            <div
              key={item.name}
              className="grid grid-cols-[14px_1fr_auto] items-center gap-3"
            >
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className="truncate text-sm font-medium text-slate-600">
                {item.name}
              </span>
              <span className="text-sm text-slate-600">
                {formatNumber(item.count)} คน ({item.percent.toFixed(1)}%)
              </span>
            </div>
          ))}

          {data.length === 0 ? <EmptyBox /> : null}
        </div>
      </div>
    </section>
  );
}

function MiniMetric({
  icon,
  title,
  value,
  note,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: number | string;
  note: string;
  tone: "blue" | "violet" | "orange" | "green";
}) {
  return (
    <div className="flex items-center gap-4 rounded-[22px] border border-slate-200/80 bg-white px-4 py-4">
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
          toneBg(tone),
          toneText(tone),
        )}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-slate-950">
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{note}</p>
      </div>
    </div>
  );
}

function EmptyBox() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      ไม่มีข้อมูล
    </div>
  );
}

function Avatar({ employee }: { employee: ManpowerEmployee }) {
  const name = employeeName(employee);
  const rawAvatar =
    (employee as ManpowerEmployee & { avatarUrl?: string | null }).avatarUrl ||
    employee.user?.avatarUrl ||
    null;
  const imageUrl = getPublicFileUrl(rawAvatar);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="h-11 w-11 rounded-2xl border border-slate-200 object-cover"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-blue-50 text-sm font-extrabold text-blue-700">
      {getInitials(name)}
    </div>
  );
}

function StatusBadge({ status }: { status?: EmployeeStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-600">
        -
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium",
        statusBadgeClass(status),
      )}
    >
      {employeeStatusText[status] || status}
    </span>
  );
}

function makeFilterOptions(
  filterItems: ManpowerFilterOption[] | undefined,
  chartItems: ManpowerOrgGroup[],
  defaultLabel: string,
) {
  const items = filterItems?.length
    ? filterItems.map((item) => ({ value: item.id, label: item.name }))
    : chartItems
        .filter((item) => item.id)
        .map((item) => ({ value: item.id ?? "", label: item.name }));

  return [{ value: "", label: defaultLabel }, ...items];
}

function toPercentItems(items: ManpowerOrgGroup[], total: number) {
  const divisor = total || 1;

  return items.slice(0, 8).map((item) => ({
    name: item.name,
    count: item.count,
    percent: (item.count / divisor) * 100,
  }));
}

function toPositionPercentItems(items: ManpowerPositionGroup[], total: number) {
  const divisor = total || 1;

  return items.slice(0, 8).map((item) => ({
    name: item.position,
    count: item.count,
    percent: (item.count / divisor) * 100,
  }));
}

function toAgePercentItems(items: ManpowerAgeGroup[], total: number) {
  const divisor = total || 1;

  return items.map((item) => ({
    name: item.name,
    count: item.count,
    percent: (item.count / divisor) * 100,
  }));
}

function toStatusPercentItems(items: ManpowerStatusGroup[], total: number) {
  const divisor = total || 1;

  return items.map((item) => ({
    name: employeeStatusText[item.status] || item.label || item.status,
    count: item.count,
    percent: (item.count / divisor) * 100,
  }));
}

function buildManpowerParams(filters: FilterState): ManpowerQueryParams {
  return {
    q: emptyToUndefined(filters.q),
    companyId: emptyToUndefined(filters.companyId),
    branchId: emptyToUndefined(filters.branchId),
    departmentId: emptyToUndefined(filters.departmentId),
    divisionId: emptyToUndefined(filters.divisionId),
    employeeTypeId: emptyToUndefined(filters.employeeTypeId),
    position: emptyToUndefined(filters.position),
    status: filters.status || undefined,
  };
}

function employeeName(employee: ManpowerEmployee) {
  return (
    employee.displayName ||
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "-"
  );
}

function statusBadgeClass(status: EmployeeStatus) {
  if (status === "ACTIVE") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "PROBATION") {
    return "border-blue-100 bg-blue-50 text-blue-700";
  }

  if (status === "SUSPENDED") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (status === "RESIGNED" || status === "TERMINATED") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function getEmployeeTypeBadge(typeName?: string | null) {
  const text = typeName || "ไม่ระบุ";

  if (text.includes("ประจำ") || text.includes("รายเดือน")) {
    return "inline-flex h-8 items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 text-xs font-medium text-emerald-700";
  }

  if (text.includes("สัญญา")) {
    return "inline-flex h-8 items-center rounded-full border border-blue-100 bg-blue-50 px-3 text-xs font-medium text-blue-700";
  }

  if (text.includes("ชั่วคราว")) {
    return "inline-flex h-8 items-center rounded-full border border-violet-100 bg-violet-50 px-3 text-xs font-medium text-violet-700";
  }

  if (text.includes("ทดลอง")) {
    return "inline-flex h-8 items-center rounded-full border border-amber-100 bg-amber-50 px-3 text-xs font-medium text-amber-700";
  }

  return "inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-700";
}

function toneBg(tone: "blue" | "teal" | "violet" | "orange" | "green") {
  if (tone === "blue") return "bg-blue-50";
  if (tone === "teal") return "bg-teal-50";
  if (tone === "violet") return "bg-violet-50";
  if (tone === "orange") return "bg-orange-50";
  return "bg-emerald-50";
}

function toneText(tone: "blue" | "teal" | "violet" | "orange" | "green") {
  if (tone === "blue") return "text-blue-600";
  if (tone === "teal") return "text-teal-600";
  if (tone === "violet") return "text-violet-600";
  if (tone === "orange") return "text-orange-600";
  return "text-emerald-600";
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "U";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatNumber(value: number) {
  return value.toLocaleString("th-TH");
}

function formatHours(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDelta(value: number) {
  if (value > 0) return `↑ ${formatNumber(value)}`;
  if (value < 0) return `↓ ${formatNumber(Math.abs(value))}`;
  return "→ 0";
}

function formatShortDateThai(value?: string | Date | null) {
  return formatDateFixDate(value);
}

function formatDateTimeThai(value: Date) {
  return formatDateFixDateTime(value);
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
