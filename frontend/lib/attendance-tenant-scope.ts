import type { TenantScope } from "@/types/auth";

export type AttendanceTenantFilter = {
  companyId: string;
  branchId: string;
};

type CompanyOption = { id: string };
type BranchOption = { id: string; companyId?: string | null };
type ScopedOrgOption = {
  companyId?: string | null;
  branchId?: string | null;
};

/**
 * ล็อกตัวกรอง Attendance/HR Review ตาม tenant scope ของผู้ใช้
 * GLOBAL  -> เลือกบริษัทและสาขาได้ตามสิทธิ์
 * COMPANY -> ล็อกบริษัท แต่ยังเลือกสาขาภายในบริษัทได้
 * BRANCH  -> ล็อกทั้งบริษัทและสาขา
 */
export function applyAttendanceTenantScope<T extends AttendanceTenantFilter>(
  filters: T,
  scope?: TenantScope | null,
): T {
  if (!scope || scope.level === "GLOBAL") return filters;

  const companyId = scope.companyId ?? "";
  const branchId =
    scope.level === "BRANCH"
      ? (scope.branchId ?? "")
      : filters.companyId && filters.companyId !== companyId
        ? ""
        : filters.branchId;

  return {
    ...filters,
    companyId,
    branchId,
  };
}

export function filterCompaniesForAttendanceScope<T extends CompanyOption>(
  items: T[],
  scope?: TenantScope | null,
) {
  if (!scope || scope.level === "GLOBAL") return items;
  return items.filter((item) => item.id === scope.companyId);
}

export function filterBranchesForAttendanceScope<T extends BranchOption>(
  items: T[],
  scope?: TenantScope | null,
) {
  if (!scope || scope.level === "GLOBAL") return items;

  return items.filter((item) => {
    if (item.companyId && item.companyId !== scope.companyId) return false;
    if (scope.level === "BRANCH") return item.id === scope.branchId;
    return true;
  });
}

/**
 * แผนกที่ branchId เป็น null ถือเป็น master ระดับบริษัท จึงยังแสดงให้ BRANCH scope ใช้ได้
 * แต่รายการที่ระบุ branchId ต้องตรงกับสาขาของผู้ใช้เท่านั้น
 */
export function filterOrgUnitsForAttendanceScope<T extends ScopedOrgOption>(
  items: T[],
  scope?: TenantScope | null,
) {
  if (!scope || scope.level === "GLOBAL") return items;

  return items.filter((item) => {
    if (item.companyId && item.companyId !== scope.companyId) return false;
    if (
      scope.level === "BRANCH" &&
      item.branchId &&
      item.branchId !== scope.branchId
    ) {
      return false;
    }
    return true;
  });
}
