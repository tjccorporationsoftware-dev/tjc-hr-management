"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  Clock4,
  Loader2,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from "lucide-react";

import { PermissionDenied } from "@/components/common/feedback-state";
import {
  Button,
  Notice,
  PageChip,
  PageHeading,
  PageSurface,
  Select,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { ApprovalWorkflowPanel } from "./_components/approval-workflow-panel";
import { HolidayPanel } from "./_components/holiday-panel";
import { AttendancePolicyPanel } from "@/components/settings/work-policies/attendance-policy-panel";
import { CopyLeavePolicyDialog } from "@/components/settings/work-policies/copy-leave-policy-dialog";
import { LeavePolicyPanel } from "@/components/settings/work-policies/leave-policy-panel";
import { OvertimePolicyPanel } from "@/components/settings/work-policies/overtime-policy-panel";
import type { WorkPolicyScope } from "@/components/settings/work-policies/work-policy-types";
import { useAuth } from "@/contexts/auth-context";
import { apiFetchWithMeta } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { OrganizationOption, PaginationMeta } from "@/types/employee";

type WorkPolicyTab =
  "attendance" | "leave" | "overtime" | "holiday" | "approval";

type PolicyTabDefinition = {
  id: WorkPolicyTab;
  label: string;
  description: string;
  icon: LucideIcon;
  readPermission: string;
  managePermissions: string[];
};

/** แท็บที่ต้องเลือกบริษัท/สาขาก่อน */
const scopedTabs: WorkPolicyTab[] = ["attendance", "leave", "overtime"];

const policyTabs: PolicyTabDefinition[] = [
  {
    id: "attendance",
    label: "เวลาเข้า–ออกงาน",
    description: "รอบลงเวลาและค่าปรับ",
    icon: Clock4,
    readPermission: "ATTENDANCE_POLICY_READ",
    managePermissions: [
      "ATTENDANCE_POLICY_MANAGE",
      "ATTENDANCE_SESSION_RULE_MANAGE",
    ],
  },
  {
    id: "holiday",
    label: "ปฏิทินวันหยุด",
    description: "วันหยุดประจำสัปดาห์และวันหยุดบริษัท",
    icon: CalendarDays,
    readPermission: "ORG_MANAGE",
    managePermissions: ["ORG_MANAGE"],
  },
  {
    id: "leave",
    label: "การลา",
    description: "ประเภทลาและโควตาสิทธิ์",
    icon: CalendarDays,
    readPermission: "LEAVE_READ",
    managePermissions: ["LEAVE_QUOTA_MANAGE"],
  },
  {
    id: "overtime",
    label: "OT",
    description: "อัตราคูณและเงื่อนไข OT",
    icon: Timer,
    readPermission: "OT_READ",
    managePermissions: ["OT_SETTING_MANAGE"],
  },
  {
    id: "approval",
    label: "สายอนุมัติ",
    description: "เส้นทางอนุมัติของแต่ละคำขอ",
    icon: BadgeCheck,
    /*
     * เกณฑ์เป็นสิทธิ์ "แก้ไข" ไม่ใช่ "อ่าน" — แท็บนี้เป็นหน้าจอแก้ไขล้วน ไม่มีโหมดดูอย่างเดียว
     * เดิมใช้ ORG_READ ซึ่ง PAYROLL_ACCOUNTING และ EXECUTIVE ถือติดตัวอยู่แล้ว
     * ทั้งสองจึงเห็นฟอร์มที่แก้ได้ แต่พอกดบันทึกเจอ "คุณไม่มีสิทธิ์ใช้งานส่วนนี้"
     */
    readPermission: "APPROVAL_MATRIX_MANAGE",
    managePermissions: ["APPROVAL_MATRIX_MANAGE"],
  },
];

function hasPermission(permissionSet: Set<string>, permission: string) {
  return permissionSet.has(permission.trim().toUpperCase());
}

function optionName(item?: OrganizationOption | null) {
  return item?.nameTh || item?.nameEn || item?.code || "-";
}

function WorkPolicies() {
  const { user } = useAuth();
  const permissionSet = useMemo(
    () =>
      new Set(
        (user?.permissions ?? []).map((permission) =>
          permission.trim().toUpperCase(),
        ),
      ),
    [user?.permissions],
  );
  const visibleTabs = useMemo(
    () =>
      policyTabs.filter((tab) =>
        hasPermission(permissionSet, tab.readPermission),
      ),
    [permissionSet],
  );

  // ลิงก์เก่า (ปฏิทินวันหยุด / สายอนุมัติ) redirect มาพร้อม ?tab=
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<WorkPolicyTab>(() => {
    const requested = searchParams.get("tab");
    return policyTabs.some((tab) => tab.id === requested)
      ? (requested as WorkPolicyTab)
      : "attendance";
  });
  const [companyId, setCompanyId] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [employeeTypeId, setEmployeeTypeId] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  // เปลี่ยนค่านี้เพื่อบังคับให้ panel โหลดใหม่หลังคัดลอกสำเร็จ
  const [leaveReloadKey, setLeaveReloadKey] = useState(0);

  // ตัวเลือกขอบเขตแทบไม่เปลี่ยนระหว่างใช้งาน ให้ cache อยู่นานกว่าค่าเริ่มต้น
  const scopeOptionsStaleTime = 5 * 60_000;

  const companiesQuery = useApiQuery(
    queryKeys.organization.companies({ pageSize: 300, status: "ACTIVE" }),
    () =>
      apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
        "/organization/companies?page=1&pageSize=300&status=ACTIVE",
      ),
    { staleTime: scopeOptionsStaleTime },
  );

  const branchesQuery = useApiQuery(
    queryKeys.organization.branches({ pageSize: 500, status: "ACTIVE" }),
    () =>
      apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
        "/organization/branches?page=1&pageSize=500&status=ACTIVE",
      ),
    { staleTime: scopeOptionsStaleTime },
  );

  const employeeTypesQuery = useApiQuery(
    queryKeys.organization.employeeTypes({ pageSize: 300, status: "ACTIVE" }),
    () =>
      apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
        "/organization/employee-types?page=1&pageSize=300&status=ACTIVE",
      ),
    { staleTime: scopeOptionsStaleTime },
  );

  const companies = companiesQuery.data?.data ?? [];
  const branches = branchesQuery.data?.data ?? [];
  const employeeTypes = employeeTypesQuery.data?.data ?? [];

  const scopeLoading =
    companiesQuery.isPending ||
    branchesQuery.isPending ||
    employeeTypesQuery.isPending;

  const scopeQueryError =
    companiesQuery.error ?? branchesQuery.error ?? employeeTypesQuery.error;
  const scopeError = scopeQueryError
    ? getErrorMessage(scopeQueryError, "ไม่สามารถโหลดบริษัทและสาขาได้")
    : null;

  // เลือกบริษัทแรกให้อัตโนมัติเมื่อรายการมาถึง และยังไม่ได้เลือกอะไรไว้
  useEffect(() => {
    if (!companyId && companies.length > 0) {
      setCompanyId(companies[0].id);
    }
  }, [companyId, companies]);

  const activeDefinition =
    visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0];
  // บัญชีระดับสาขาถูกล็อกที่สาขาตัวเองเสมอ เลือกสาขาอื่นหรือ "ทุกสาขา" ไม่ได้
  const isBranchScoped = user?.scope?.level === "BRANCH";
  const lockedBranchId = isBranchScoped
    ? (user?.scope?.branchId ?? null)
    : null;
  const effectiveBranchId = isBranchScoped ? lockedBranchId : branchId;

  const selectedCompany =
    companies.find((item) => item.id === companyId) ?? null;
  const companyBranches = branches.filter(
    (item) => item.companyId === companyId,
  );
  const companyEmployeeTypes = employeeTypes.filter(
    (item) => item.companyId === companyId,
  );
  const selectedBranch =
    companyBranches.find((item) => item.id === effectiveBranchId) ?? null;
  const selectedEmployeeType =
    companyEmployeeTypes.find((item) => item.id === employeeTypeId) ?? null;

  const scope: WorkPolicyScope | null = companyId
    ? {
        companyId,
        branchId: effectiveBranchId,
        employeeTypeId,
        companyName: optionName(selectedCompany),
        branchName: selectedBranch ? optionName(selectedBranch) : null,
        employeeTypeName: selectedEmployeeType
          ? optionName(selectedEmployeeType)
          : null,
      }
    : null;

  const canManageAttendancePolicy = hasPermission(
    permissionSet,
    "ATTENDANCE_POLICY_MANAGE",
  );
  const canManageAttendanceRules = hasPermission(
    permissionSet,
    "ATTENDANCE_SESSION_RULE_MANAGE",
  );
  // สิทธิ์การลาและ OT ต้องเป็นมาตรฐานเดียวทั้งบริษัท
  // บัญชีระดับสาขาจึงดูได้อย่างเดียว ต่อให้มี permission ก็ตาม (backend กันซ้ำอีกชั้น)
  const canManageLeave =
    hasPermission(permissionSet, "LEAVE_QUOTA_MANAGE") && !isBranchScoped;
  const canManageOvertime =
    hasPermission(permissionSet, "OT_SETTING_MANAGE") && !isBranchScoped;

  if (visibleTabs.length === 0 || !activeDefinition) {
    return (
      <PageSurface>
        <PermissionDenied
          title="ไม่มีสิทธิ์ดูนโยบายการทำงาน"
          description="บัญชีนี้ยังไม่มีสิทธิ์ดูนโยบายเวลาเข้าออกงาน การลา หรือ OT"
        />
      </PageSurface>
    );
  }

  const hasScopeFilter = Boolean(branchId || employeeTypeId);
  const needsScope = scopedTabs.includes(activeDefinition.id);
  const tabItems: Array<TabItem<WorkPolicyTab>> = visibleTabs.map((tab) => ({
    key: tab.id,
    label: tab.label,
  }));

  return (
    <PageSurface>
      <PageHeading
        heroMotif="settings"
        eyebrow="Work Policies"
        title="นโยบาย"
        titleAccent="การทำงาน"
        description="เวลาเข้า–ออกงาน สิทธิ์การลา เงื่อนไข OT ปฏิทินวันหยุด และสายอนุมัติ รวมอยู่ที่เดียว"
        chips={
          <>
            <PageChip tone="brand">
              {selectedCompany
                ? optionName(selectedCompany)
                : "ยังไม่เลือกบริษัท"}
            </PageChip>
            <PageChip>
              {selectedBranch ? optionName(selectedBranch) : "ทุกสาขา"}
            </PageChip>
            <PageChip>
              {selectedEmployeeType
                ? optionName(selectedEmployeeType)
                : "พนักงานทุกประเภท"}
            </PageChip>
          </>
        }
      />

      <Tabs
        items={tabItems}
        value={activeDefinition.id}
        onChange={setActiveTab}
      />

      {/* ขอบเขตใช้เฉพาะสามหมวดแรก อีกสองหมวดตั้งค่าระดับบริษัทอยู่แล้ว */}
      {needsScope ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 3xl:px-7 [&_select]:bg-white">
          <div className="flex flex-wrap items-end gap-2">
            <ScopeField label="บริษัท">
              {companies.length > 1 ? (
                <Select
                  value={companyId}
                  disabled={scopeLoading}
                  onChange={(event) => {
                    setCompanyId(event.target.value);
                    setBranchId(null);
                    setEmployeeTypeId(null);
                  }}
                  className="w-52"
                >
                  <option value="">เลือกบริษัท</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {optionName(company)}
                    </option>
                  ))}
                </Select>
              ) : (
                // ผู้ใช้ระดับบริษัท: ล็อกเป็นบริษัทของตนเอง ไม่ต้องเลือก
                <div className="flex h-9 w-52 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-600">
                  {scopeLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      กำลังโหลด…
                    </span>
                  ) : (
                    optionName(selectedCompany)
                  )}
                </div>
              )}
            </ScopeField>

            <ScopeField label="สาขา">
              <Select
                value={effectiveBranchId ?? ""}
                disabled={
                  isBranchScoped ||
                  !companyId ||
                  scopeLoading ||
                  companyBranches.length === 0
                }
                onChange={(event) => setBranchId(event.target.value || null)}
                className="w-56"
              >
                {/* บัญชีระดับสาขาเลือก "ทุกสาขา" ไม่ได้ เพราะแก้ค่ากลางบริษัทไม่ได้อยู่แล้ว */}
                {isBranchScoped ? null : (
                  <option value="">ทุกสาขา — ค่ามาตรฐานบริษัท</option>
                )}
                {companyBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {optionName(branch)}
                  </option>
                ))}
              </Select>
            </ScopeField>

            {/*
              หมวดการลาและ OT แสดงประเภทพนักงานครบทุกแถวในตารางเดียวอยู่แล้ว
              จึงไม่ต้องเลือกทีละประเภท — คงตัวกรองไว้เฉพาะหมวดที่ยังใช้
            */}
            {activeDefinition.id === "leave" ||
            activeDefinition.id === "overtime" ? null : (
              <ScopeField label="ประเภทพนักงาน">
                <Select
                  value={employeeTypeId ?? ""}
                  disabled={!companyId || scopeLoading}
                  onChange={(event) =>
                    setEmployeeTypeId(event.target.value || null)
                  }
                  className="w-52"
                >
                  <option value="">พนักงานทุกประเภท</option>
                  {companyEmployeeTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {optionName(item)}
                    </option>
                  ))}
                </Select>
              </ScopeField>
            )}

            {hasScopeFilter ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!isBranchScoped) setBranchId(null);
                  setEmployeeTypeId(null);
                }}
              >
                ล้างขอบเขต
              </Button>
            ) : null}
          </div>

          <p className="text-[12px] text-slate-500 3xl:text-[12.5px]">
            {branchId
              ? `ตั้งค่าเฉพาะสาขา ${optionName(selectedBranch)} — ค่าที่ไม่ได้ตั้งจะสืบทอดจากบริษัท`
              : "ตั้งเป็นค่ามาตรฐานของบริษัท — ทุกสาขาที่ไม่ได้ตั้งแยกจะใช้ค่านี้"}
          </p>
        </div>
      ) : null}

      {scopeError && needsScope ? (
        <div className="px-5 3xl:px-6 4xl:px-7 py-4">
          <Notice tone="critical">{scopeError}</Notice>
        </div>
      ) : null}

      {activeDefinition.id === "holiday" ? <HolidayPanel /> : null}
      {activeDefinition.id === "approval" ? <ApprovalWorkflowPanel /> : null}

      {needsScope ? (
        scope ? (
          <>
            {/* บอกเหตุผลให้ชัด ไม่ใช่ปล่อยให้เจอปุ่มจางแล้วงงว่าทำไมกดไม่ได้ */}
            {isBranchScoped &&
            (activeDefinition.id === "leave" ||
              activeDefinition.id === "overtime") ? (
              <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50/70 px-5 py-2.5 sm:px-6 3xl:px-7">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="min-w-0 text-[12.5px] leading-5 text-amber-900 3xl:text-[13px]">
                  โหมดดูอย่างเดียว —{" "}
                  {activeDefinition.id === "leave" ? "สิทธิ์การลา" : "อัตรา OT"}
                  ต้องเป็นมาตรฐานเดียวกันทั้งบริษัท
                  จึงให้ผู้ดูแลระดับบริษัทเป็นผู้ตั้งค่า
                  บัญชีระดับสาขาดูได้อย่างเดียว
                </p>
              </div>
            ) : null}

            {activeDefinition.id === "attendance" ? (
              <AttendancePolicyPanel
                scope={scope}
                branches={companyBranches}
                canManagePolicy={canManageAttendancePolicy}
                canManageRules={canManageAttendanceRules}
                scopeLevel={user?.scope?.level ?? "GLOBAL"}
                ownBranchId={user?.scope?.branchId ?? null}
              />
            ) : null}
            {activeDefinition.id === "leave" ? (
              <LeavePolicyPanel
                key={`leave-${scope.companyId}-${scope.branchId ?? "all"}-${leaveReloadKey}`}
                scope={scope}
                canManage={canManageLeave}
                isBranchScoped={isBranchScoped}
                onRequestCopy={
                  companies.length > 1 ? () => setCopyOpen(true) : undefined
                }
              />
            ) : null}
            {activeDefinition.id === "overtime" ? (
              <OvertimePolicyPanel
                scope={scope}
                canManage={canManageOvertime}
              />
            ) : null}
          </>
        ) : (
          <div className="flex min-h-[300px] items-center justify-center text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-400">
            {scopeLoading
              ? "กำลังโหลดข้อมูลบริษัท…"
              : "กรุณาเลือกบริษัทเพื่อเริ่มตั้งค่านโยบาย"}
          </div>
        )
      ) : null}

      {scope ? (
        <CopyLeavePolicyDialog
          open={copyOpen}
          companies={companies}
          branches={branches}
          targetCompanyId={scope.companyId}
          targetBranchId={scope.branchId}
          onClose={() => setCopyOpen(false)}
          onCopied={() => setLeaveReloadKey((value) => value + 1)}
        />
      ) : null}
    </PageSurface>
  );
}

/** ป้ายกำกับเหนือช่องเลือกขอบเขต */
function ScopeField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function WorkPoliciesPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <WorkPolicies />
    </Suspense>
  );
}
