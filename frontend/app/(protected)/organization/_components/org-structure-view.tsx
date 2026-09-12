"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComponentType,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  Building2,
  ChevronRight,
  GitBranch,
  Layers3,
  ListTree,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

import { Button, ButtonLink, SearchInput } from "@/components/kit";
import { apiFetch } from "@/lib/api";
import type {
  BranchItem,
  CompanyItem,
  DepartmentItem,
  DivisionItem,
  OrganizationStructureSummary,
} from "@/types/organization";

import {
  avatarUrlOf,
  buildLookup,
  cn,
  fetchAllEmployees,
  initialsOf,
  nameOf,
  normalize,
  positionOf,
  showApiError,
  type OrgLookup,
  type StructureEmployee,
} from "./structure-shared";

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

type ViewMode = "unit" | "supervisor";

export type OrgStructureViewProps = {
  /** ตัวกรองมาจากแถบด้านบนของหน้า /organization ไม่ต้องมีตัวกรองซ้ำในแท็บนี้ */
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  /**
   * โหมดอ่านอย่างเดียว — ใช้กับห้องผู้บริหาร
   *
   * ต่างจากโหมดปกติสองอย่าง
   * 1) ดึงข้อมูลจาก `/organization/org-chart` ครั้งเดียว แทนการยิง 4 endpoint
   *    ของ master data แล้วตามด้วย `/employees` ทีละหน้า — endpoint นั้นต้องมี
   *    EMPLOYEE_READ ซึ่งเท่ากับเปิดทะเบียนพนักงานทั้งองค์กร
   * 2) ซ่อนปุ่ม "จัดผังองค์กร" เพราะผู้บริหารดูอย่างเดียว ไม่ได้มาแก้สายบังคับบัญชา
   */
  readOnly?: boolean;
};

/** payload ของ `/organization/org-chart` — เฉพาะที่ใช้วาดผัง ไม่มีข้อมูลอ่อนไหว */
type OrgChartResponse = {
  companies: CompanyItem[];
  branches: BranchItem[];
  departments: DepartmentItem[];
  divisions: DivisionItem[];
  employees: StructureEmployee[];
};

/* ------------------------------------------------------------------ */
/* design tokens (ชุดเดียวกับหน้า /organization)                        */
/* ------------------------------------------------------------------ */

/** กล่องแบนไม่มีเงา ใช้แยกพื้นที่ 2 คอลัมน์ (ผังหลัก + สรุปด้านข้าง) ไม่ใช่การ์ดลอย */
const CARD = "overflow-hidden rounded-lg border border-slate-200 bg-white";

const EMPTY_SUMMARY: OrganizationStructureSummary = {
  stats: {
    companies: 0,
    branches: 0,
    departments: 0,
    divisions: 0,
    employees: 0,
    supervisors: 0,
    roots: 0,
  },
  dataQuality: {
    noDepartment: 0,
    noPosition: 0,
    noSupervisor: 0,
    inactive: 0,
  },
};

/**
 * level ของตำแหน่งเป็น "ระดับงาน (job grade)" — 1 = สูงสุด ไล่ลงถึง 9
 * (ประธาน = 1, ผู้จัดการ = 4, เจ้าหน้าที่ = 7) ตามตัวเลือกในฟอร์มตำแหน่ง
 * ใช้เรียงลำดับการแสดงผลเท่านั้น
 *
 * ห้ามใช้ตัดสินว่าใครเป็นหัวหน้าใคร — เรื่องนั้นยึด supervisorId อย่างเดียว
 * เพราะเป็นคนละแกนกัน (job grade vs reporting line)
 */

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export function OrgStructureView({
  companyId = "",
  branchId = "",
  departmentId = "",
  readOnly = false,
}: OrgStructureViewProps) {
  const treePanelRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [panning, setPanning] = useState(false);


  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [divisions, setDivisions] = useState<DivisionItem[]>([]);
  const [employees, setEmployees] = useState<StructureEmployee[]>([]);
  const [summary, setSummary] =
    useState<OrganizationStructureSummary>(EMPTY_SUMMARY);

  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("unit");
  const [zoom, setZoom] = useState(80);
  const [fullscreen, setFullscreen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  /* ---------------------------------------------------------------- */
  /* data                                                              */
  /* ---------------------------------------------------------------- */

  const loadStructure = useCallback(async () => {
    try {
      setLoading(true);

      if (readOnly) {
        const params = new URLSearchParams();
        if (companyId) params.set("companyId", companyId);
        if (branchId) params.set("branchId", branchId);
        if (departmentId) params.set("departmentId", departmentId);
        const query = params.toString();

        const chart = await apiFetch<OrgChartResponse>(
          `/organization/org-chart${query ? `?${query}` : ""}`,
        );

        setCompanies(chart?.companies ?? []);
        setBranches(chart?.branches ?? []);
        setDepartments(chart?.departments ?? []);
        setDivisions(chart?.divisions ?? []);
        setEmployees(chart?.employees ?? []);
        return;
      }

      const [companyRes, branchRes, departmentRes, divisionRes] =
        await Promise.all([
          apiFetch<CompanyItem[]>(
            "/organization/companies?page=1&pageSize=100",
          ),
          apiFetch<BranchItem[]>("/organization/branches?page=1&pageSize=100"),
          apiFetch<DepartmentItem[]>(
            "/organization/departments?page=1&pageSize=100",
          ),
          apiFetch<DivisionItem[]>(
            "/organization/divisions?page=1&pageSize=100",
          ),
        ]);

      setCompanies(companyRes ?? []);
      setBranches(branchRes ?? []);
      setDepartments(departmentRes ?? []);
      setDivisions(divisionRes ?? []);
      setEmployees(await fetchAllEmployees());
    } catch (error) {
      showApiError(error, "โหลดผังองค์กรไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [branchId, companyId, departmentId, readOnly]);

  const loadSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (branchId) params.set("branchId", branchId);
      if (departmentId) params.set("departmentId", departmentId);
      if (keyword) params.set("q", keyword);

      const query = params.toString();
      const result = await apiFetch<OrganizationStructureSummary>(
        `/organization/structure-summary${query ? `?${query}` : ""}`,
      );

      setSummary(result ?? EMPTY_SUMMARY);
    } catch (error) {
      showApiError(error, "โหลดสรุปผังองค์กรไม่สำเร็จ");
    }
  }, [branchId, companyId, departmentId, keyword]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดผังองค์กรใหม่เมื่อตัวกรองเปลี่ยน
    void loadStructure();
  }, [loadStructure]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดสรุปผังองค์กรใหม่เมื่อตัวกรองเปลี่ยน
    void loadSummary();
  }, [loadSummary]);

  /** หน่วงคำค้นเพื่อไม่ยิง summary ทุกตัวอักษร */
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(normalize(q)), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === treePanelRef.current);
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  /* ---------------------------------------------------------------- */
  /* derived                                                           */
  /* ---------------------------------------------------------------- */

  const lookup = useMemo(
    () => buildLookup(companies, branches, departments, divisions),
    [branches, companies, departments, divisions],
  );

  /** พนักงานหลังกรองด้วยตัวกรองหัวหน้า (บริษัท/สาขา/แผนก) */
  const scopedEmployees = useMemo(
    () =>
      employees.filter((employee) => {
        if (companyId && employee.companyId !== companyId) return false;
        if (branchId && employee.branchId !== branchId) return false;
        if (departmentId && employee.departmentId !== departmentId)
          return false;
        return true;
      }),
    [branchId, companyId, departmentId, employees],
  );

  const matchedEmployees = useMemo(() => {
    if (!keyword) return scopedEmployees;
    return scopedEmployees.filter((employee) =>
      searchTextOf(employee, lookup).includes(keyword),
    );
  }, [keyword, lookup, scopedEmployees]);

  /**
   * นับลูกทีมจากพนักงานทั้งหมด ไม่ใช่เฉพาะที่ผ่านตัวกรอง
   * ไม่งั้นค้นหาแล้วหัวหน้าจะกลายเป็นไม่มีลูกทีม
   */
  const reportCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const employee of employees) {
      if (!employee.supervisorId) continue;
      map.set(employee.supervisorId, (map.get(employee.supervisorId) ?? 0) + 1);
    }
    return map;
  }, [employees]);

  const unitTree = useMemo(
    () =>
      buildUnitTree({
        companies,
        branches,
        departments,
        divisions,
        employees: matchedEmployees,
        reportCounts,
        companyId,
        branchId,
        departmentId,
      }),
    [
      branchId,
      branches,
      companies,
      companyId,
      departmentId,
      departments,
      divisions,
      matchedEmployees,
      reportCounts,
    ],
  );

  const supervisorTree = useMemo(
    () => buildSupervisorTree(matchedEmployees, employees),
    [employees, matchedEmployees],
  );

  const branchSections = useMemo(
    () =>
      buildBranchSections(
        matchedEmployees,
        supervisorTree.childrenMap,
        branches,
        lookup,
      ),
    [branches, lookup, matchedEmployees, supervisorTree.childrenMap],
  );

  /** คู่ "ลูกน้อง ↔ หัวหน้าที่อยู่คนละสาขา" ที่ต้องลากเส้นโยงข้ามผัง */
  const crossBranchLinks = useMemo(
    () =>
      branchSections.flatMap((section) =>
        [...section.treeRoots, ...section.orphans]
          .filter((person) => person.supervisorId)
          .filter((person) => section.externalBossOf(person))
          .map((person) => ({
            key: `${person.supervisorId}->${person.id}`,
            bossId: person.supervisorId as string,
            personId: person.id,
          })),
      ),
    [branchSections],
  );

  const chartRef = useRef<HTMLDivElement | null>(null);
  const [crossPaths, setCrossPaths] = useState<
    Array<{ key: string; d: string }>
  >([]);

  /*
   * เส้นโยงข้ามผังต้องวาดทับด้วย SVG เพราะกล่องอยู่คนละสายของ DOM
   * จัดด้วย flex/border ไม่ได้ ต้องวัดตำแหน่งจริงบนจอแล้ววาดตาม
   *
   * วัดในพิกัดของกล่องที่ถูกย่อ/ขยาย จึงต้องหารด้วย scale ก่อนเสมอ
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const scale = zoom / 100;

    function measure() {
      if (!chart) return;

      const base = chart.getBoundingClientRect();
      const localRect = (id: string) => {
        const node = chart.querySelector<HTMLElement>(
          `[data-org-node="${id}"]`,
        );
        if (!node) return null;

        const rect = node.getBoundingClientRect();
        return {
          left: (rect.left - base.left) / scale,
          top: (rect.top - base.top) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
        };
      };

      const next: Array<{ key: string; d: string }> = [];

      for (const link of crossBranchLinks) {
        const boss = localRect(link.bossId);
        const person = localRect(link.personId);
        if (!boss || !person) continue;

        const fromX = boss.left + boss.width;
        const fromY = boss.top + boss.height / 2;
        const toX = person.left + person.width / 2;
        const toY = person.top;
        const midX = fromX + (toX - fromX) / 2;

        next.push({
          key: link.key,
          d: `M ${fromX} ${fromY} H ${midX} V ${toY - 14} H ${toX} V ${toY}`,
        });
      }

      setCrossPaths(next);
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(chart);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [crossBranchLinks, zoom, viewMode, keyword]);

  const stats = summary.stats;
  const quality = summary.dataQuality;

  const composition = useMemo(
    () => [
      {
        name: "หัวหน้าที่มีลูกทีม",
        value: stats.supervisors,
        color: "#2563eb",
      },
      {
        name: "พนักงานทั่วไป",
        value: Math.max(stats.employees - stats.supervisors, 0),
        color: "#cbd5e1",
      },
    ],
    [stats.employees, stats.supervisors],
  );

  /* ---------------------------------------------------------------- */
  /* actions                                                           */
  /* ---------------------------------------------------------------- */

  function toggleNode(id: string) {
    setCollapsed((current) => ({ ...current, [id]: !current[id] }));
  }

  function expandAll() {
    setCollapsed({});
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    for (const company of unitTree) {
      next[company.id] = true;
      for (const branch of company.branches) {
        next[branch.id] = true;
        for (const department of branch.departments) next[department.id] = true;
      }
    }
    setCollapsed(next);
  }

  /**
   * ลากด้วยเมาส์เพื่อเลื่อนดูผัง
   *
   * ผังสายรายงานกว้างกว่าจอเสมอเมื่อองค์กรใหญ่ การไล่แถบเลื่อนทีละนิดช้ามาก
   * จับที่พื้นที่ว่างแล้วลากได้เลยเร็วกว่า (ยังใช้แถบเลื่อน/ล้อได้เหมือนเดิม)
   */
  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    const container = panRef.current;
    // ปุ่มซ้ายเท่านั้น และไม่ขโมยการลากของเบราว์เซอร์บนข้อความ/รูป
    if (!container || event.button !== 0) return;

    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };

    container.setPointerCapture(event.pointerId);
    setPanning(true);
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const container = panRef.current;
    const state = panStateRef.current;
    if (!container || !state || state.pointerId !== event.pointerId) return;

    container.scrollLeft = state.scrollLeft - (event.clientX - state.startX);
    container.scrollTop = state.scrollTop - (event.clientY - state.startY);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const container = panRef.current;
    const state = panStateRef.current;
    if (!container || !state || state.pointerId !== event.pointerId) return;

    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    panStateRef.current = null;
    setPanning(false);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await treePanelRef.current?.requestFullscreen();
    } catch {
      toast.error("เบราว์เซอร์ไม่อนุญาตให้เปิดแบบเต็มจอ");
    }
  }

  /* พาตัวกรองบริษัท/สาขา/แผนกที่เลือกอยู่ไปตั้งต้นให้หน้าจัดผังด้วย */
  const editorHref = useMemo(() => {
    const params = new URLSearchParams();
    if (companyId) params.set("companyId", companyId);
    if (branchId) params.set("branchId", branchId);
    if (departmentId) params.set("departmentId", departmentId);

    const query = params.toString();
    return `/organization/structure-editor${query ? `?${query}` : ""}`;
  }, [branchId, companyId, departmentId]);

  const shownEmployees = matchedEmployees.length;
  const shownDepartments = new Set(
    matchedEmployees.map((employee) => employee.departmentId).filter(isText),
  ).size;

  return (
    <div className="space-y-4 max-[1536px]:space-y-3">
      {/* toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between max-[1536px]:pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-950 max-[1536px]:text-[13px]">
            ผังองค์กร
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 max-[1536px]:text-[11px]">
            แสดง {shownEmployees.toLocaleString("th-TH")} พนักงาน ใน{" "}
            {shownDepartments.toLocaleString("th-TH")} แผนก
            {keyword ? " (ตามคำค้น)" : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end max-[1536px]:gap-1.5">
          <div className="col-span-2 flex rounded-lg border border-slate-200 bg-slate-50 p-1 sm:col-span-1">
            <ModeButton
              active={viewMode === "unit"}
              icon={ListTree}
              onClick={() => setViewMode("unit")}
            >
              ตามแผนก
            </ModeButton>
            <ModeButton
              active={viewMode === "supervisor"}
              icon={Network}
              onClick={() => setViewMode("supervisor")}
            >
              สายรายงาน
            </ModeButton>
          </div>

          <div className="col-span-2 sm:col-span-1 sm:w-64">
            <SearchInput
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="ค้นหาชื่อ รหัส ตำแหน่ง แผนก"
              aria-label="ค้นหาในผังองค์กร"
            />
          </div>

          <Button
            onClick={loadStructure}
            icon={
              loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )
            }
          >
            รีเฟรช
          </Button>

          {/* กระดานจัดผังเป็นหน้าเต็มของตัวเอง — ส่งตัวกรองปัจจุบันไปทาง query */}
          {readOnly ? null : (
            <ButtonLink
              variant="primary"
              href={editorHref}
              icon={<Pencil className="h-4 w-4" />}
            >
              จัดผังองค์กร
            </ButtonLink>
          )}
        </div>
      </div>

      {/* metric strip */}
      <div className="grid gap-0 overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCell
          label="ฝ่าย / กลุ่มงาน"
          value={stats.divisions}
          helper="หน่วยย่อยภายใต้แผนก"
          icon={Layers3}
          tone="text-violet-600 bg-violet-50"
        />
        <MetricCell
          label="หัวหน้าที่มีลูกทีม"
          value={stats.supervisors}
          helper="ผู้ที่มีผู้ใต้บังคับบัญชาอย่างน้อย 1 คน"
          icon={ShieldCheck}
          tone="text-brand-600 bg-brand-50"
        />
        <MetricCell
          label="พนักงานในผัง"
          value={stats.employees}
          helper="นับเฉพาะที่ตรงตัวกรองปัจจุบัน"
          icon={UsersRound}
          tone="text-brand-600 bg-brand-50"
        />
        <MetricCell
          label="ยังไม่ระบุหัวหน้า"
          value={quality.noSupervisor}
          helper="ต้องกำหนดเพื่อให้สายบังคับบัญชาครบ"
          icon={TriangleAlert}
          tone="text-amber-600 bg-amber-50"
          alert={quality.noSupervisor > 0}
        />
      </div>

      {/* body */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] max-[1536px]:gap-3">
        <div
          ref={treePanelRef}
          className={cn(
            CARD,
            fullscreen && "flex h-screen flex-col rounded-none border-0",
          )}
        >
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between max-[1536px]:px-3 max-[1536px]:py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 max-[1536px]:text-[11px]">
                {viewMode === "unit"
                  ? "โครงสร้างตามแผนก"
                  : "สายรายงาน (ผู้บังคับบัญชา)"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 max-[1536px]:text-[10px]">
                {viewMode === "unit"
                  ? "บริษัท → สาขา → แผนก → ฝ่าย/กลุ่มงาน"
                  : "เรียงจากผู้บริหารสูงสุดลงมาตามผู้บังคับบัญชาที่กำหนดไว้ — คลิกค้างแล้วลากเพื่อเลื่อนดู"}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {/* ทั้งสองมุมมองยึดเกณฑ์เดียวกันแล้ว คือ supervisorId ที่ตั้งไว้จริง */}
              <span className="mr-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600">
                <span className="h-3 w-3 rounded-full bg-brand-600" />
                กรอบฟ้า = มีลูกทีม
                {readOnly ? "" : ' ตามที่ตั้งใน "จัดผังองค์กร"'}
              </span>

              {viewMode === "unit" ? (
                <>
                  <button
                    type="button"
                    onClick={expandAll}
                    className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-50"
                  >
                    ขยายทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    ยุบทั้งหมด
                  </button>
                </>
              ) : (
                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5">
                  <IconButton
                    label="ซูมออก"
                    onClick={() => setZoom((v) => Math.max(v - 10, 40))}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </IconButton>
                  <span className="min-w-[46px] text-center text-[11px] font-bold text-slate-600">
                    {zoom}%
                  </span>
                  <IconButton
                    label="ซูมเข้า"
                    onClick={() => setZoom((v) => Math.min(v + 10, 130))}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </IconButton>
                  <button
                    type="button"
                    onClick={() => setZoom(80)}
                    className="ml-0.5 h-8 rounded-lg px-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    พอดีจอ
                  </button>
                  <IconButton
                    label={fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
                    onClick={toggleFullscreen}
                    tone="text-brand-600 hover:bg-brand-50"
                  >
                    {fullscreen ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </IconButton>
                </div>
              )}
            </div>
          </div>

          {/*
            * เพดานความสูงใช้เฉพาะผังสายรายงาน
            *
            * ผังสายรายงานมีกล่องเลื่อน/ลากของตัวเอง ต้องมีส่วนที่ล้นถึงจะเลื่อนได้
            * ส่วนมุมมองตามแผนกเป็นรายการยาวที่ให้เลื่อนไปกับหน้าเว็บ ถ้าไปครอบ
            * เพดานให้ด้วยจะโดนตัดท้ายทิ้งโดยไม่มีแถบเลื่อน (เลื่อนลงดูไม่ได้)
            */}
          <div
            className={cn(
              "min-h-[420px]",
              fullscreen
                ? "flex-1"
                : viewMode === "supervisor" && "max-h-[calc(100vh-20rem)]",
            )}
          >
            {loading ? (
              <PanelMessage>
                <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                กำลังโหลดผังองค์กร…
              </PanelMessage>
            ) : viewMode === "unit" ? (
              unitTree.length === 0 ? (
                <PanelMessage>ไม่พบแผนกที่ตรงกับตัวกรอง</PanelMessage>
              ) : (
                <div className="space-y-3 p-4 max-[1536px]:space-y-2 max-[1536px]:p-3">
                  {unitTree.map((company) => (
                    <CompanyBlock
                      key={company.id}
                      node={company}
                      collapsed={collapsed}
                      onToggle={toggleNode}
                    />
                  ))}
                </div>
              )
            ) : supervisorTree.roots.length === 0 ? (
              <PanelMessage>
                ยังไม่มีข้อมูลสายบังคับบัญชา —
                กำหนดผู้บังคับบัญชาในหน้าข้อมูลพนักงาน
              </PanelMessage>
            ) : (
              <div
                ref={panRef}
                onPointerDown={startPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerCancel={endPan}
                className={cn(
                  "h-full overflow-auto p-4 max-[1536px]:p-3",
                  // touch-pan-* ปล่อยให้จอสัมผัสเลื่อนเองตามปกติ ลากด้วยเมาส์ค่อยใช้ตัวนี้
                  "touch-pan-x touch-pan-y select-none",
                  panning ? "cursor-grabbing" : "cursor-grab",
                )}
              >
                {stats.supervisors === 0 ? (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-[11px] leading-4 text-amber-800">
                      ยังไม่มีการกำหนดผู้บังคับบัญชาให้พนักงานคนใด
                      ผังนี้จึงแสดงทุกคนเป็นระดับบนสุด
                      {readOnly ? (
                        <>
                          {" "}
                          — ให้ HR กำหนดหัวหน้าให้ก่อน
                          ผังสายรายงานจึงจะขึ้นเป็นลำดับชั้น
                        </>
                      ) : (
                        <>
                          {" "}
                          — กำหนดหัวหน้าได้จากปุ่ม <b>จัดผังองค์กร</b>{" "}
                          หรือหน้าข้อมูลพนักงาน
                        </>
                      )}
                    </p>
                  </div>
                ) : null}

                <div
                  ref={chartRef}
                  className="relative flex min-w-full origin-top-left items-start gap-12 pb-4"
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: "top left",
                    width: `${(100 / zoom) * 100}%`,
                  }}
                >
                  {/* เส้นโยงข้ามสาขา วาดไว้ใต้การ์ด ไม่รับคลิก */}
                  {crossPaths.length > 0 ? (
                    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                      {crossPaths.map((path) => (
                        <path
                          key={path.key}
                          d={path.d}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth={1.5}
                        />
                      ))}
                    </svg>
                  ) : null}

                  {branchSections.map(
                    (group) => (
                      <section
                        key={group.key}
                        className="flex flex-col items-center"
                      >
                        {/* ชื่อบริษัท/สาขาขึ้นครั้งเดียวเป็นหัวของผัง ไม่ต้องแปะทุกการ์ด */}
                        <p className="rounded-lg bg-brand-600 px-4 py-1.5 text-[13px] font-bold text-white shadow-sm">
                          {group.name}
                        </p>
                        <span className="h-4 w-px bg-brand-300" />

                        {/*
                          * แยก "คนที่ไม่มีทั้งหัวหน้าและลูกทีม" ออกไปแถวล่าง
                          *
                          * ถ้าเอามาต่อในแถวเดียวกับต้นสาย แถวจะกว้างขึ้นเพราะคนพวกนี้
                          * แล้วหัวชื่อบริษัทที่จัดกึ่งกลางแถวจะเยื้องไปจากเส้นที่ลากลงมา
                          */}
                        {buildLevels(
                          group.treeRoots,
                          group.childrenMap,
                        ).map((level, levelIndex, allLevels) => {
                          const columns =
                            levelIndex === 0
                              ? [{ key: "root", name: null, items: level }]
                              : groupByDepartment(level, lookup);

                          /*
                           * แผนกเดิมที่ต่อลงมาจากชั้นบน ไม่ต้องขึ้นแถบชื่อซ้ำ
                           * เห็น "บริหาร" สองอันติดกันแล้วชวนเข้าใจผิดว่าเป็นคนละแผนก
                           */
                          const previousKeys = new Set(
                            levelIndex === 0
                              ? []
                              : groupByDepartment(
                                  allLevels[levelIndex - 1],
                                  lookup,
                                ).map((column) => column.key),
                          );

                          return (
                            <div
                              key={levelIndex}
                              className="flex flex-col items-center"
                            >
                              {levelIndex > 0 ? <LevelConnector /> : null}

                              <div className="relative flex items-start gap-3">
                                {columns.length > 1 ? (
                                  <span className="absolute left-0 right-0 top-0 h-px bg-brand-300" />
                                ) : null}

                                {columns.map((column) => (
                                  <div
                                    key={column.key}
                                    className="flex flex-col items-center gap-2"
                                  >
                                    {levelIndex > 0 ? (
                                      <>
                                        <LevelConnector />
                                        {/* แถบแผนกคุมหัวคอลัมน์ ไม่ต้องแปะซ้ำทุกการ์ด */}
                                        {previousKeys.has(column.key) ? null : (
                                          <p
                                            className={cn(
                                              "w-[168px] truncate rounded-md px-2 py-1 text-center text-[11px] font-bold",
                                              column.name
                                                ? "bg-brand-100 text-brand-800"
                                                : "bg-slate-100 text-slate-500",
                                            )}
                                          >
                                            {column.name ?? "ยังไม่ระบุแผนก"}
                                          </p>
                                        )}
                                      </>
                                    ) : null}

                                    {column.items.map((person) => (
                                      <SupervisorCard
                                        key={person.id}
                                        employee={person}
                                        directReports={
                                          (
                                            group.childrenMap.get(person.id) ??
                                            []
                                          ).length
                                        }
                                      />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        {group.orphans.length > 0 ? (
                          <div className="mt-6 w-full border-t border-dashed border-slate-200 pt-3">
                            <p className="mb-2 text-center text-[11px] font-semibold text-slate-400">
                              ยังไม่อยู่ในสายรายงาน ·{" "}
                              {group.orphans.length.toLocaleString("th-TH")} คน
                            </p>
                            <div className="flex flex-wrap items-start justify-center gap-2">
                              {group.orphans.map((person) => (
                                <SupervisorCard
                                  key={person.id}
                                  employee={person}
                                  directReports={0}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </section>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4 max-[1536px]:space-y-3">
          <section className={cn(CARD, "p-4 max-[1536px]:p-3")}>
            <p className="text-xs font-bold text-slate-900 max-[1536px]:text-[11px]">
              สัดส่วนกำลังคน
            </p>

            <div className="relative mt-3 h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={composition}
                    dataKey="value"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {composition.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold tracking-tight text-slate-950">
                  {stats.employees.toLocaleString("th-TH")}
                </p>
                <p className="text-[11px] text-slate-500">พนักงาน</p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {composition.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between text-xs max-[1536px]:text-[11px]"
                >
                  <span className="flex items-center gap-2 text-slate-600">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}
                  </span>
                  <span className="font-bold text-slate-900">
                    {entry.value.toLocaleString("th-TH")}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              <SummaryRow
                icon={Building2}
                tone="bg-brand-50 text-brand-600"
                label="บริษัท"
                value={stats.companies}
              />
              <SummaryRow
                icon={GitBranch}
                tone="bg-brand-50 text-brand-600"
                label="สาขา"
                value={stats.branches}
              />
              <SummaryRow
                icon={Layers3}
                tone="bg-violet-50 text-violet-600"
                label="แผนก"
                value={stats.departments}
              />
              <SummaryRow
                icon={Network}
                tone="bg-indigo-50 text-indigo-600"
                label="สายรายงานระดับบนสุด"
                value={stats.roots}
              />
            </div>
          </section>

          <section className={cn(CARD, "p-4 max-[1536px]:p-3")}>
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-bold text-slate-900 max-[1536px]:text-[11px]">
                ข้อมูลที่ควรตรวจสอบ
              </p>
            </div>

            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              รายการเหล่านี้ทำให้ผังองค์กรและสายอนุมัติไม่สมบูรณ์
            </p>

            <div className="mt-3 space-y-2">
              <QualityRow
                label="ยังไม่ระบุแผนก"
                value={quality.noDepartment}
                total={stats.employees}
              />
              <QualityRow
                label="ยังไม่ระบุตำแหน่ง"
                value={quality.noPosition}
                total={stats.employees}
              />
              <QualityRow
                label="ยังไม่ระบุผู้บังคับบัญชา"
                value={quality.noSupervisor}
                total={stats.employees}
              />
              <QualityRow
                label="สถานะไม่ใช่พนักงานปัจจุบัน"
                value={quality.inactive}
                total={stats.employees}
              />
            </div>
          </section>
        </aside>
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* unit view                                                           */
/* ------------------------------------------------------------------ */

/** พนักงานในผัง + จำนวนลูกทีมจริงตามที่ตั้งไว้ในจัดผังองค์กร */
type UnitMember = StructureEmployee & { directReports: number };

type DivisionNode = {
  id: string;
  code: string;
  name: string;
  employees: UnitMember[];
};

type DepartmentNode = {
  id: string;
  code: string;
  name: string;
  divisions: DivisionNode[];
  direct: UnitMember[];
  total: number;
};

type BranchNode = {
  id: string;
  code: string;
  name: string;
  departments: DepartmentNode[];
  total: number;
};

type CompanyNode = {
  id: string;
  code: string;
  name: string;
  branches: BranchNode[];
  total: number;
};

function CompanyBlock({
  node,
  collapsed,
  onToggle,
}: {
  node: CompanyNode;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const isOpen = !collapsed[node.id];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200">
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex w-full items-center gap-3 bg-brand-600 px-4 py-3 text-left transition hover:bg-brand-700 max-[1536px]:px-3 max-[1536px]:py-2.5"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-white/90 transition",
            isOpen && "rotate-90",
          )}
        />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Building2 className="h-4 w-4 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-white max-[1536px]:text-[13px]">
            {node.code} · {node.name}
          </span>
          <span className="block text-[11px] text-white/80">
            {node.branches.length} สาขา · {node.total.toLocaleString("th-TH")}{" "}
            พนักงาน
          </span>
        </span>
      </button>

      {isOpen ? (
        <div className="space-y-2 bg-slate-50 p-3 max-[1536px]:space-y-1.5 max-[1536px]:p-2.5">
          {node.branches.length === 0 ? (
            <EmptyLine text="ยังไม่มีสาขาที่ตรงตัวกรอง" />
          ) : (
            node.branches.map((branch) => (
              <BranchBlock
                key={branch.id}
                node={branch}
                collapsed={collapsed}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

function BranchBlock({
  node,
  collapsed,
  onToggle,
}: {
  node: BranchNode;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const isOpen = !collapsed[node.id];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-brand-50"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-slate-400 transition",
            isOpen && "rotate-90",
          )}
        />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <GitBranch className="h-3.5 w-3.5 text-brand-600" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900">
          {node.code} · {node.name}
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {node.departments.length} แผนก · {node.total} คน
        </span>
      </button>

      {isOpen ? (
        <div className="space-y-2 border-t border-slate-100 p-2.5">
          {node.departments.length === 0 ? (
            <EmptyLine text="ยังไม่มีแผนกในสาขานี้" />
          ) : (
            node.departments.map((department) => (
              <DepartmentBlock
                key={department.id}
                node={department}
                collapsed={collapsed}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function DepartmentBlock({
  node,
  collapsed,
  onToggle,
}: {
  node: DepartmentNode;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const isOpen = !collapsed[node.id];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-slate-50"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-slate-400 transition",
            isOpen && "rotate-90",
          )}
        />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50">
          <Layers3 className="h-3.5 w-3.5 text-violet-600" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
          {node.name}
        </span>
        <span className="shrink-0 text-[10px] font-bold text-slate-500">
          {node.total} คน
        </span>
      </button>

      {isOpen ? (
        <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 p-2.5">
          {node.divisions.map((division) => (
            <div key={division.id}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {division.name} ({division.employees.length})
              </p>
              <EmployeeGrid employees={division.employees} />
            </div>
          ))}

          {node.direct.length > 0 ? (
            <div>
              {node.divisions.length > 0 ? (
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  ไม่ระบุฝ่าย ({node.direct.length})
                </p>
              ) : null}
              <EmployeeGrid employees={node.direct} />
            </div>
          ) : null}

          {node.total === 0 ? (
            <EmptyLine text="ยังไม่มีพนักงานในแผนกนี้" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmployeeGrid({ employees }: { employees: UnitMember[] }) {
  if (employees.length === 0) return null;

  return (
    <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
      {employees.map((employee) => (
        <EmployeeChip key={employee.id} employee={employee} />
      ))}
    </div>
  );
}

function EmployeeChip({ employee }: { employee: UnitMember }) {
  const avatar = avatarUrlOf(employee);
  const name = nameOf(employee);
  // เน้นคนที่มีลูกทีมจริง ไม่ใช่เดาจากระดับตำแหน่ง
  const isLead = employee.directReports > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2",
        isLead ? "border-slate-200 bg-brand-50" : "border-slate-200",
      )}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={name}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            isLead ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600",
          )}
        >
          {initialsOf(name)}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 whitespace-nowrap text-[11px] font-bold text-slate-900">
            {name}
          </span>
          {isLead ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700">
              <UsersRound className="h-2.5 w-2.5" />
              {employee.directReports}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[10px] text-slate-500">
          {positionOf(employee) ?? employee.employeeCode ?? "—"}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* supervisor view                                                     */
/* ------------------------------------------------------------------ */

/**
 * แยกผังออกเป็นกลุ่มตามสาขา — หนึ่งสาขาหนึ่งผัง วางเรียงกันไปทางขวา
 *
 * เดิมจัดกลุ่มแค่ "ต้นสาย" ตามสาขา แล้วไล่ลูกทีมลงไปโดยไม่สนสาขา คนของแอสเซนท์
 * ที่บังเอิญขึ้นตรงกับผู้บริหารทีเจซีจึงไปโผล่กลางผังทีเจซี อ่านแล้วสับสนว่า
 * ตกลงคนนี้อยู่บริษัทไหน
 *
 * ตอนนี้ทุกคนอยู่ในผังของสาขาตัวเองเสมอ ใครที่หัวหน้าอยู่คนละสาขาจะขึ้นเป็น
 * ต้นสายของสาขาตัวเอง แล้วติดป้ายบอกว่าขึ้นตรงกับใครที่สาขาไหน
 */
function buildBranchSections(
  people: StructureEmployee[],
  childrenMap: Map<string, StructureEmployee[]>,
  branches: BranchItem[],
  lookup: OrgLookup,
) {
  const employeeById = new Map(people.map((person) => [person.id, person]));

  const keyOf = (person: StructureEmployee) => person.branchId ?? "none";
  const order = new Map(branches.map((branch, index) => [branch.id, index]));

  const buckets = new Map<string, StructureEmployee[]>();
  for (const person of people) {
    const key = keyOf(person);
    const list = buckets.get(key) ?? [];
    list.push(person);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .sort(
      ([a], [b]) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([key, members]) => {
      const memberIds = new Set(members.map((person) => person.id));

      /* ลูกทีมที่นับในผังนี้ต้องเป็นคนสาขาเดียวกันเท่านั้น */
      const scopedChildren = new Map<string, StructureEmployee[]>();
      for (const person of members) {
        const children = (childrenMap.get(person.id) ?? []).filter((child) =>
          memberIds.has(child.id),
        );
        if (children.length > 0) scopedChildren.set(person.id, children);
      }

      const roots = members.filter(
        (person) => !person.supervisorId || !memberIds.has(person.supervisorId),
      );

      return {
        key,
        name:
          key === "none"
            ? "ยังไม่ระบุสาขา"
            : (lookup.branches.get(key)?.nameTh ?? "ไม่พบสาขา"),
        childrenMap: scopedChildren,
        treeRoots: roots.filter(
          (person) => (scopedChildren.get(person.id) ?? []).length > 0,
        ),
        orphans: roots.filter(
          (person) => (scopedChildren.get(person.id) ?? []).length === 0,
        ),
        /** หัวหน้าที่อยู่คนละสาขา — ใช้ติดป้ายบอกว่าโยงไปหาใคร */
        externalBossOf: (person: StructureEmployee) => {
          if (!person.supervisorId || memberIds.has(person.supervisorId)) {
            return null;
          }

          const boss = employeeById.get(person.supervisorId);
          if (!boss) return null;

          return {
            name: nameOf(boss),
            branch: boss.branchId
              ? (lookup.branches.get(boss.branchId)?.nameTh ?? "")
              : "ยังไม่ระบุสาขา",
          };
        },
      };
    });
}

/** จัดคนในชั้นเดียวกันเป็นคอลัมน์ตามแผนก — คงลำดับที่ส่งเข้ามา (อาวุโสก่อน) */
function groupByDepartment(people: StructureEmployee[], lookup: OrgLookup) {
  const groups: Array<{
    key: string;
    name: string | null;
    items: StructureEmployee[];
  }> = [];
  const indexByKey = new Map<string, number>();

  for (const person of people) {
    const key = person.departmentId ?? "none";
    let index = indexByKey.get(key);

    if (index === undefined) {
      index = groups.length;
      indexByKey.set(key, index);
      groups.push({
        key,
        name: person.departmentId
          ? (lookup.departments.get(person.departmentId)?.nameTh ?? null)
          : null,
        items: [],
      });
    }

    groups[index].items.push(person);
  }

  return groups;
}

/**
 * ตัดผังเป็น "ชั้น" ตามระยะห่างจากต้นสาย
 *
 * ชั้น 0 = ต้นสาย · ชั้น 1 = ลูกทีมของชั้น 0 · ไล่ลงไปเรื่อย ๆ
 *
 * เดิมวาดแบบซ้อนกล่องในกล่อง (ลูกทีมอยู่ข้างในกล่องหัวหน้า) ความกว้างของกล่อง
 * จึงเท่ากับลูกหลานทั้งกอง หัวหน้าที่มีลูกทีมกระจายหลายแผนกเลยดันพี่น้องข้าง ๆ
 * ให้ห่างออกไปเป็นพัน px แก้ด้วยการจัดระยะยังไงก็ไม่หาย เพราะกล่องพี่น้อง
 * ซ้อนทับกันไม่ได้
 *
 * ตัดเป็นชั้นแล้วทุกคอลัมน์อยู่ในแถวของตัวเอง เรียงชิดกันตามปกติ
 * ไม่มีใครดันใครอีก และยังอ่านเป็นลำดับชั้นได้เหมือนเดิม
 */
function buildLevels(
  roots: StructureEmployee[],
  childrenMap: Map<string, StructureEmployee[]>,
) {
  const levels: StructureEmployee[][] = [];
  const seen = new Set<string>();
  let current = roots;

  // กันข้อมูลสายบังคับบัญชาที่วนกลับ ไม่ให้วาดไม่รู้จบ
  while (current.length > 0 && levels.length < 15) {
    const level = current.filter((person) => !seen.has(person.id));
    if (level.length === 0) break;

    level.forEach((person) => seen.add(person.id));
    levels.push(level);

    current = level.flatMap((person) => childrenMap.get(person.id) ?? []);
  }

  return levels;
}

/** เส้นตั้งเชื่อมระหว่างชั้น */
function LevelConnector() {
  return <span className="h-4 w-px bg-brand-300" />;
}

/** การ์ดคนในผัง — เอาชื่อบริษัท/แผนกออก เพราะย้ายไปเป็นหัวกลุ่มแล้ว */
function SupervisorCard({
  employee,
  directReports,
}: {
  employee: StructureEmployee;
  directReports: number;
}) {
  /* data-org-node ใช้ค้นหาตำแหน่งกล่องตอนวาดเส้นโยงข้ามสาขา */
  const avatar = avatarUrlOf(employee);
  const name = nameOf(employee);
  const nickname = employee.nickname?.trim();

  return (
    <div
      data-org-node={employee.id}
      className={cn(
        "relative flex w-[168px] items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-left",
        directReports > 0
          ? "border-brand-300 bg-brand-50/40"
          : "border-slate-200",
      )}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={name}
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            directReports > 0
              ? "bg-brand-600 text-white"
              : "bg-slate-200 text-slate-600",
          )}
        >
          {initialsOf(name)}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block whitespace-nowrap text-[11.5px] font-bold text-slate-900">
          {name}
          {nickname ? (
            <span className="font-medium text-slate-400"> ({nickname})</span>
          ) : null}
        </span>
        <span className="block truncate text-[10.5px] text-slate-500">
          {positionOf(employee) ?? "ไม่ระบุตำแหน่ง"}
        </span>
      </span>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

function ModeButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-semibold transition max-[1536px]:h-7 max-[1536px]:px-2.5 max-[1536px]:text-[11px]",
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-white/70",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
        tone ?? "text-slate-600 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function MetricCell({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  alert,
}: {
  label: string;
  value: number;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  alert?: boolean;
}) {
  return (
    /*
      แถวเดียวจบ: ไอคอน + ป้าย + ตัวเลข อยู่บรรทัดเดียวกัน
      ของเดิมเป็นการ์ดสามชั้น (ป้าย / ตัวเลข 30px / คำอธิบาย) สูงเกือบ 120px
      ทั้งที่เป็นตัวเลขสี่ตัว ดันผังองค์กรซึ่งเป็นเนื้อหาจริงตกจอ
    */
    <div className="flex items-center gap-2.5 border-b border-slate-200 bg-white px-4 py-2.5 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-r xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(4n)]:border-r-0 xl:[&:nth-last-child(-n+4)]:border-b-0">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          tone,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-500 3xl:text-[11.5px]">
          {label}
        </p>
        <p className="truncate text-[10.5px] leading-4 text-slate-400">
          {helper}
        </p>
      </div>

      <p
        className={cn(
          "shrink-0 text-[20px] font-bold tabular-nums leading-none 3xl:text-[22px]",
          alert ? "text-amber-600" : "text-slate-900",
        )}
      >
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg",
          tone,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-600 max-[1536px]:text-[11px]">
        {label}
      </span>
      <span className="shrink-0 text-sm font-bold text-slate-900">
        {value.toLocaleString("th-TH")}
      </span>
    </div>
  );
}

function QualityRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-600">{label}</span>
        <span
          className={cn(
            "font-bold",
            value > 0 ? "text-amber-600" : "text-emerald-600",
          )}
        >
          {value.toLocaleString("th-TH")} คน
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full",
            value > 0 ? "bg-amber-400" : "bg-emerald-400",
          )}
          style={{ width: `${Math.max(percent, value > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function PanelMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2.5 text-center text-[11px] text-slate-400">
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* data helpers                                                        */
/* ------------------------------------------------------------------ */

function buildUnitTree({
  companies,
  branches,
  departments,
  divisions,
  employees,
  reportCounts,
  companyId,
  branchId,
  departmentId,
}: {
  companies: CompanyItem[];
  branches: BranchItem[];
  departments: DepartmentItem[];
  divisions: DivisionItem[];
  employees: StructureEmployee[];
  /** employeeId → จำนวนลูกทีมตรง (มาจาก supervisorId ที่ตั้งไว้) */
  reportCounts: Map<string, number>;
  companyId: string;
  branchId: string;
  departmentId: string;
}): CompanyNode[] {
  const divisionsByDepartment = new Map<string, DivisionItem[]>();
  for (const division of divisions) {
    const list = divisionsByDepartment.get(division.departmentId) ?? [];
    list.push(division);
    divisionsByDepartment.set(division.departmentId, list);
  }

  /**
   * แผนกในระบบผูกกับ "บริษัท" (branchId เป็น null ได้)
   * ส่วนพนักงานผูกทั้งสาขาและแผนก จึงต้องประกอบสาขา → แผนก จากการสังกัดของพนักงาน
   */
  function buildDepartmentNode(
    department: DepartmentItem,
    members: StructureEmployee[],
  ): DepartmentNode {
    const sorted = members
      .map<UnitMember>((employee) => ({
        ...employee,
        directReports: reportCounts.get(employee.id) ?? 0,
      }))
      /*
       * เรียงตามตำแหน่งเป็นหลัก
       *
       * เดิมเอา "จำนวนลูกทีม" ขึ้นก่อน ทำให้รองผู้จัดการที่คุมคน 29 คนแซง
       * ผู้จัดการที่คุม 1 คน ซึ่งอ่านแล้วขัดกับผังจริง จำนวนลูกทีมเหลือเป็น
       * ตัวตัดสินท้ายสุดเมื่อทุกอย่างเสมอกัน
       */
      .sort((a, b) => {
        const byPosition = compareBySeniority(a, b);
        if (byPosition !== 0) return byPosition;
        return b.directReports - a.directReports;
      });

    const divisionNodes = (divisionsByDepartment.get(department.id) ?? [])
      .map<DivisionNode>((division) => ({
        id: `${department.id}:${division.id}`,
        code: division.code,
        name: division.nameTh,
        employees: sorted.filter(
          (employee) => employee.divisionId === division.id,
        ),
      }))
      .filter((division) => division.employees.length > 0);

    const inDivision = new Set(
      divisionNodes.flatMap((division) =>
        division.employees.map((employee) => employee.id),
      ),
    );

    return {
      id: department.id,
      code: department.code,
      name: department.nameTh,
      divisions: divisionNodes,
      direct: sorted.filter((employee) => !inDivision.has(employee.id)),
      total: sorted.length,
    };
  }

  return companies
    .filter((company) => !companyId || company.id === companyId)
    .map<CompanyNode>((company) => {
      const companyDepartments = departments
        .filter((department) => department.companyId === company.id)
        .filter(
          (department) => !departmentId || department.id === departmentId,
        );

      const companyBranches = branches
        .filter((branch) => branch.companyId === company.id)
        .filter((branch) => !branchId || branch.id === branchId)
        .map<BranchNode>((branch) => {
          const branchEmployees = employees.filter(
            (employee) => employee.branchId === branch.id,
          );

          const branchDepartments = companyDepartments
            .filter(
              (department) =>
                !department.branchId || department.branchId === branch.id,
            )
            .map((department) => ({
              department,
              members: branchEmployees.filter(
                (employee) => employee.departmentId === department.id,
              ),
            }))
            // แผนกที่ผูกกับสาขานี้โดยตรงให้แสดงเสมอ ส่วนแผนกระดับบริษัทแสดงเมื่อมีคน
            .filter(
              (entry) =>
                entry.members.length > 0 ||
                entry.department.branchId === branch.id,
            )
            .map<DepartmentNode>((entry) =>
              buildDepartmentNode(entry.department, entry.members),
            );

          const withoutDepartment = branchEmployees.filter(
            (employee) => !employee.departmentId,
          );

          if (withoutDepartment.length > 0 && !departmentId) {
            branchDepartments.push({
              id: `${branch.id}:no-department`,
              code: "-",
              name: "ยังไม่ระบุแผนก",
              divisions: [],
              direct: withoutDepartment
                .map<UnitMember>((employee) => ({
                  ...employee,
                  directReports: reportCounts.get(employee.id) ?? 0,
                }))
                .sort(compareBySeniority),
              total: withoutDepartment.length,
            });
          }

          return {
            id: branch.id,
            code: branch.code,
            name: branch.nameTh,
            departments: branchDepartments,
            total: branchDepartments.reduce(
              (sum, department) => sum + department.total,
              0,
            ),
          };
        });

      const withoutBranch = employees.filter(
        (employee) => employee.companyId === company.id && !employee.branchId,
      );

      if (withoutBranch.length > 0 && !branchId) {
        companyBranches.push({
          id: `${company.id}:no-branch`,
          code: "-",
          name: "ยังไม่ระบุสาขา",
          departments: companyDepartments
            .map((department) => ({
              department,
              members: withoutBranch.filter(
                (employee) => employee.departmentId === department.id,
              ),
            }))
            .filter((entry) => entry.members.length > 0)
            .map<DepartmentNode>((entry) =>
              buildDepartmentNode(entry.department, entry.members),
            ),
          total: withoutBranch.length,
        });
      }

      return {
        id: company.id,
        code: company.code,
        name: company.nameTh,
        branches: companyBranches,
        total: companyBranches.reduce((sum, branch) => sum + branch.total, 0),
      };
    })
    .filter((company) => company.branches.length > 0);
}

function buildSupervisorTree(
  matched: StructureEmployee[],
  all: StructureEmployee[],
) {
  const allById = new Map(all.map((employee) => [employee.id, employee]));

  /** ดึงสายบังคับบัญชาของคนที่ตรงคำค้นขึ้นมาด้วย ไม่งั้นต้นไม้จะขาด */
  const visible = new Map<string, StructureEmployee>();

  for (const employee of matched) {
    let cursor: StructureEmployee | undefined = employee;
    let guard = 0;

    while (cursor && guard < 20) {
      if (visible.has(cursor.id)) break;
      visible.set(cursor.id, cursor);
      cursor = cursor.supervisorId
        ? allById.get(cursor.supervisorId)
        : undefined;
      guard += 1;
    }
  }

  const childrenMap = new Map<string, StructureEmployee[]>();
  for (const employee of visible.values()) {
    if (!employee.supervisorId) continue;
    if (!visible.has(employee.supervisorId)) continue;

    const list = childrenMap.get(employee.supervisorId) ?? [];
    list.push(employee);
    childrenMap.set(employee.supervisorId, list);
  }

  for (const [key, list] of childrenMap) {
    childrenMap.set(key, list.sort(compareBySeniority));
  }

  const roots = [...visible.values()]
    .filter(
      (employee) =>
        !employee.supervisorId || !visible.has(employee.supervisorId),
    )
    .sort(compareBySeniority);

  return { roots, childrenMap };
}

function compareBySeniority(a: StructureEmployee, b: StructureEmployee) {
  /* ลำดับที่จัดมือไว้ในกระดานจัดผังมาก่อน (0 = ยังไม่เคยจัด ไปอยู่ท้าย) */
  const aManual = a.sortOrder || 0;
  const bManual = b.sortOrder || 0;

  if (aManual !== bManual) {
    if (aManual === 0) return 1;
    if (bManual === 0) return -1;
    return aManual - bManual;
  }

  const byLevel = rankOf(a) - rankOf(b);
  if (byLevel !== 0) return byLevel;

  return nameOf(a).localeCompare(nameOf(b), "th");
}

/**
 * level 1 = ตำแหน่งสูงสุด ไล่ลงไปถึง 9 ตามตัวเลือกในฟอร์มตำแหน่ง
 * คนที่ยังไม่ระบุตำแหน่งให้ไปอยู่ท้ายสุด
 */
function rankOf(employee: StructureEmployee) {
  const level = employee.positionMaster?.level;
  return typeof level === "number" && level > 0 ? level : 99;
}

function searchTextOf(employee: StructureEmployee, lookup: OrgLookup) {
  const department = employee.departmentId
    ? lookup.departments.get(employee.departmentId)
    : null;
  const branch = employee.branchId
    ? lookup.branches.get(employee.branchId)
    : null;

  return normalize(
    [
      nameOf(employee),
      employee.employeeCode,
      positionOf(employee),
      employee.positionMaster?.code,
      department?.nameTh,
      department?.code,
      branch?.nameTh,
      branch?.code,
      employee.supervisor ? nameOf(employee.supervisor) : null,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

