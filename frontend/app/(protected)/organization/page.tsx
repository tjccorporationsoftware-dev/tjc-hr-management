"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  Hourglass,
  MapPin,
  Network,
  UserPlus,
  Users,
} from "lucide-react";

import {
  Badge,
  PageChip,
  PageHeading,
  PageSurface,
  Select,
  StatTile,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { apiFetch, apiFetchWithMeta } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type {
  BranchItem,
  CompanyItem,
  DepartmentItem,
  OrganizationSummary,
  PaginationMeta,
} from "@/types/organization";

import { CompanyPanel } from "./_components/company-panel";
import { EntityPanel, type EntityTabKey } from "./_components/entity-panel";
import {
  ManpowerPanel,
  type ManpowerSummary,
} from "./_components/manpower-panel";
import { OrgStructureView } from "./_components/org-structure-view";

/**
 * โครงสร้างองค์กร
 * ----------------
 * รวมข้อมูลบริษัท / สาขา / แผนก / ฝ่าย / ตำแหน่ง / ประเภทพนักงาน / ผังองค์กร
 * และภาพรวมอัตรากำลัง (เดิมแยกเป็นหน้า /manpower) ไว้เป็น 8 แท็บในหน้าเดียว
 *
 * ตัวกรองบริษัท/สาขา/แผนกด้านบนใช้ร่วมกันทุกแท็บ ยกเว้นแท็บ "อัตรากำลัง"
 * ที่มีตัวกรองของตัวเอง เพราะดึงจากมุมมองพนักงานทั้งองค์กรคนละชุดข้อมูลกัน
 */

type TabKey =
  | "company"
  | "branches"
  | "departments"
  | "divisions"
  | "positions"
  | "employee-types"
  | "structure"
  | "manpower";

const entityTabs: EntityTabKey[] = [
  "branches",
  "departments",
  "divisions",
  "positions",
  "employee-types",
];

const tabLabels: Record<TabKey, string> = {
  company: "ข้อมูลบริษัท",
  branches: "สาขา",
  departments: "แผนก",
  divisions: "ฝ่าย/กลุ่มงาน",
  positions: "ตำแหน่ง",
  "employee-types": "ประเภทพนักงาน",
  structure: "ผังองค์กร",
  manpower: "อัตรากำลัง",
};

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function OrganizationWorkspace() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const permissionSet = useMemo(
    () =>
      new Set(
        (user?.permissions ?? []).map((permission) =>
          permission.trim().toUpperCase(),
        ),
      ),
    [user?.permissions],
  );

  const canSeeManpower = permissionSet.has("MANPOWER_READ");

  const tabs: Array<TabItem<TabKey>> = [
    { key: "company", label: tabLabels.company },
    { key: "branches", label: tabLabels.branches },
    { key: "departments", label: tabLabels.departments },
    { key: "divisions", label: tabLabels.divisions },
    { key: "positions", label: tabLabels.positions },
    { key: "employee-types", label: tabLabels["employee-types"] },
    { key: "structure", label: tabLabels.structure },
    ...(canSeeManpower
      ? [{ key: "manpower" as const, label: tabLabels.manpower }]
      : []),
  ];

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return tabs.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "company";
  });

  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");

  const [stats, setStats] = useState({
    companies: 0,
    branches: 0,
    departments: 0,
    positions: 0,
  });

  const [manpowerSummary, setManpowerSummary] =
    useState<ManpowerSummary | null>(null);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId),
    [companies, selectedCompanyId],
  );

  const branchOptions = useMemo(() => {
    if (!selectedCompanyId) return branches;
    return branches.filter((branch) => branch.companyId === selectedCompanyId);
  }, [branches, selectedCompanyId]);

  const departmentOptions = useMemo(() => {
    return departments.filter((department) => {
      if (selectedCompanyId && department.companyId !== selectedCompanyId) {
        return false;
      }
      if (selectedBranchId && department.branchId !== selectedBranchId) {
        return false;
      }
      return true;
    });
  }, [departments, selectedBranchId, selectedCompanyId]);

  // เลือกบริษัทให้อัตโนมัติเมื่อยังไม่มีตัวเลือก
  useEffect(() => {
    if (!selectedCompanyId && companies.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- เลือกบริษัทแรกอัตโนมัติเมื่อรายการโหลดเสร็จ
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  async function loadReferences() {
    // ขอบเขตเดียวกับของเดิม: บริษัทดึงทั้งหมดเสมอ ส่วนสาขา/แผนกกรองด้วยบริษัทที่เลือกอยู่
    // (ถ้ายังไม่เลือกบริษัทจะได้ทั้งหมดเหมือนกัน) กัน pageSize 100 ตัดข้อมูลของบริษัทอื่นทิ้งจนแผนก/สาขาของบริษัทที่เลือกหายไป
    const scope = selectedCompanyId ? `&companyId=${selectedCompanyId}` : "";

    const [companyResult, branchResult, departmentResult] = await Promise.all([
      apiFetchWithMeta<CompanyItem[], PaginationMeta>(
        "/organization/companies?page=1&pageSize=100",
      ),
      apiFetchWithMeta<BranchItem[], PaginationMeta>(
        `/organization/branches?page=1&pageSize=100${scope}`,
      ),
      apiFetchWithMeta<DepartmentItem[], PaginationMeta>(
        `/organization/departments?page=1&pageSize=100${scope}`,
      ),
    ]);

    setCompanies(companyResult.data);
    setBranches(branchResult.data);
    setDepartments(departmentResult.data);
  }

  async function loadStats() {
    const params = new URLSearchParams();
    if (selectedCompanyId) params.set("companyId", selectedCompanyId);
    if (selectedBranchId) params.set("branchId", selectedBranchId);

    const summary = await apiFetch<OrganizationSummary>(
      `/organization/summary${params.toString() ? `?${params.toString()}` : ""}`,
    );

    setStats({
      companies: summary.companies.total,
      branches: summary.branches.total,
      departments: summary.departments.total,
      positions: summary.positions.total,
    });
  }

  async function reload() {
    await Promise.all([loadReferences(), loadStats()]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลด/รีโหลดรายการอ้างอิงเมื่อเปลี่ยนบริษัทที่เลือก (เหมือนพฤติกรรมเดิม)
    loadReferences().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดสรุปใหม่เมื่อเปลี่ยนบริษัท/สาขา
    loadStats().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, selectedBranchId]);

  function changeCompany(id: string) {
    setSelectedCompanyId(id);
    setSelectedBranchId("");
    setSelectedDepartmentId("");
  }

  function changeBranch(id: string) {
    setSelectedBranchId(id);
    setSelectedDepartmentId("");
  }

  const showSharedFilter = tab !== "manpower";
  const activeEntityTab = entityTabs.includes(tab as EntityTabKey)
    ? (tab as EntityTabKey)
    : null;

  return (
    <PageSurface>
      <PageHeading
        heroMotif="organization"
        eyebrow="Organization"
        title="โครงสร้าง"
        titleAccent="องค์กร"
        description="ตั้งค่าข้อมูลบริษัท สาขา แผนก ฝ่าย ตำแหน่ง ประเภทพนักงาน ผังองค์กร และดูภาพรวมอัตรากำลังจากที่เดียว"
        chips={
          selectedCompany ? (
            <>
              <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
                {selectedCompany.code} · {selectedCompany.nameTh}
              </PageChip>
              {selectedCompany.address &&
              selectedCompany.taxId &&
              selectedCompany.phone &&
              selectedCompany.logoUrl ? (
                <Badge tone="positive">ข้อมูลบริษัทพร้อมออกเอกสาร</Badge>
              ) : (
                <Badge tone="warning">ข้อมูลบริษัทยังไม่ครบ</Badge>
              )}
            </>
          ) : null
        }
        actions={
          tab === "manpower" ? (
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0">
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="พนักงานทั้งหมด"
                value={count(manpowerSummary?.total ?? 0)}
                helper={`ทำงานอยู่ ${count(manpowerSummary?.active ?? 0)} คน`}
              />
              <StatTile
                icon={<Activity className="h-4 w-4" />}
                label="อัตราทำงานจริง"
                value={`${manpowerSummary?.activeRatePct ?? 0}%`}
                helper="active / ทั้งหมด"
                tone="positive"
              />
              <StatTile
                icon={<Hourglass className="h-4 w-4" />}
                label="ทดลองงาน"
                value={count(manpowerSummary?.probation ?? 0)}
                helper="อยู่ระหว่างทดลองงาน"
                tone="warning"
              />
              <StatTile
                icon={<UserPlus className="h-4 w-4" />}
                label="เข้าใหม่เดือนนี้"
                value={count(manpowerSummary?.newThisMonth ?? 0)}
                helper={
                  manpowerSummary
                    ? `${manpowerSummary.newDelta >= 0 ? "+" : ""}${manpowerSummary.newDelta.toLocaleString("th-TH")} จากเดือนก่อน`
                    : ""
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0">
              <StatTile
                icon={<Building2 className="h-4 w-4" />}
                label="บริษัท"
                value={count(stats.companies)}
              />
              <StatTile
                icon={<MapPin className="h-4 w-4" />}
                label="สาขา"
                value={count(stats.branches)}
              />
              <StatTile
                icon={<Network className="h-4 w-4" />}
                label="แผนก"
                value={count(stats.departments)}
              />
              <StatTile
                icon={<BriefcaseBusiness className="h-4 w-4" />}
                label="ตำแหน่ง"
                value={count(stats.positions)}
              />
            </div>
          )
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {showSharedFilter ? (
        <div className="grid gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:grid-cols-3 sm:px-6 3xl:px-7 [&_select]:bg-white">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]">
              บริษัท
            </span>
            <Select
              value={selectedCompanyId}
              onChange={(event) => changeCompany(event.target.value)}
            >
              <option value="">เลือกบริษัท</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} · {company.nameTh}
                </option>
              ))}
            </Select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]">
              สาขา
            </span>
            <Select
              value={selectedBranchId}
              onChange={(event) => changeBranch(event.target.value)}
              disabled={!selectedCompanyId}
            >
              <option value="">ทุกสาขา</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.nameTh}
                </option>
              ))}
            </Select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]">
              แผนก (ใช้กรองฝ่าย/ตำแหน่ง)
            </span>
            <Select
              value={selectedDepartmentId}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
              disabled={!selectedBranchId}
            >
              <option value="">ทุกแผนก</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.nameTh}
                </option>
              ))}
            </Select>
          </label>
        </div>
      ) : null}

      {tab === "company" ? (
        <CompanyPanel
          companyId={selectedCompanyId}
          companies={companies}
          onChanged={reload}
        />
      ) : null}

      {activeEntityTab ? (
        <EntityPanel
          key={activeEntityTab}
          tab={activeEntityTab}
          companyId={selectedCompanyId}
          branchId={selectedBranchId}
          departmentId={selectedDepartmentId}
          companies={companies}
          branches={branches}
          departments={departments}
          onChanged={reload}
        />
      ) : null}

      {tab === "structure" ? (
        <div className="px-5 py-5 sm:px-6">
          <OrgStructureView
            companyId={selectedCompanyId}
            branchId={selectedBranchId}
            departmentId={selectedDepartmentId}
          />
        </div>
      ) : null}

      {tab === "manpower" && canSeeManpower ? (
        <ManpowerPanel onSummaryChange={setManpowerSummary} />
      ) : null}
    </PageSurface>
  );
}

export default function OrganizationPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <OrganizationWorkspace />
    </Suspense>
  );
}
