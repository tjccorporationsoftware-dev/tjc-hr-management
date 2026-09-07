import type { AuthUser } from "@/types/auth";

type RoleLike = string | { code?: string | null; name?: string | null };
type DashboardUser =
  | Pick<AuthUser, "roles" | "permissions"> & Partial<Pick<AuthUser, "scope">>
  | null
  | undefined;

function normalizeRoleCode(role: RoleLike) {
  if (typeof role === "string") {
    return role.trim().toUpperCase();
  }

  return (role.code || role.name || "").trim().toUpperCase();
}

function getRoleCodes(user: DashboardUser) {
  return (user?.roles ?? []).map((role) => normalizeRoleCode(role as RoleLike));
}

function getPermissionSet(user: DashboardUser) {
  return new Set(user?.permissions ?? []);
}

function hasRole(user: DashboardUser, roleCodes: string[]) {
  const roleSet = new Set(getRoleCodes(user));

  return roleCodes.some((roleCode) => roleSet.has(roleCode));
}

function hasEveryPermission(user: DashboardUser, permissions: string[]) {
  const permissionSet = getPermissionSet(user);

  return permissions.every((permission) => permissionSet.has(permission));
}

function hasAnyPermission(user: DashboardUser, permissions: string[]) {
  const permissionSet = getPermissionSet(user);

  return permissions.some((permission) => permissionSet.has(permission));
}

/**
 * Default landing page after login.
 *
 * Keep this mapping close to the existing route structure instead of creating a
 * new dashboard layer. The old /dashboard route now only redirects here for
 * backward compatibility with existing links and sessions.
 */
export function getDefaultDashboardPath(user: DashboardUser) {
  if (!user) {
    return "/login";
  }

  /*
   * Platform Console คุมได้ "ทุกบริษัท" จึงมีความหมายเฉพาะกับผู้ใช้ระดับ GLOBAL
   * ถ้าเช็คแค่โรล ผู้ดูแลระบบของบริษัทเดียว (scope COMPANY/BRANCH) จะถูกส่งเข้า
   * หน้าที่ขึ้นเลข 0 ทั้งหมดเพราะมองไม่เห็นบริษัทใดเลย จึงต้องเช็ค scope ด้วย
   * ต้องเช็คก่อน permission-based เพราะ SYSTEM_ADMIN มีสิทธิ์ครบทุกตัว
   */
  if (
    user.scope?.level === "GLOBAL" &&
    hasRole(user, ["SYSTEM_ADMIN", "ADMIN", "SUPER_ADMIN"])
  ) {
    return "/platform";
  }

  if (hasRole(user, ["HR_ADMIN", "HR_MANAGER"])) {
    return "/hr/dashboard";
  }

  if (hasRole(user, ["EXECUTIVE"])) {
    return "/executive/dashboard";
  }

  if (hasRole(user, ["MANAGER", "DEPT_MANAGER", "DEPARTMENT_MANAGER"])) {
    return "/manager/team";
  }

  if (hasRole(user, ["PAYROLL_ACCOUNTING"])) {
    return "/payroll";
  }

  if (hasRole(user, ["EMPLOYEE"]) && hasAnyPermission(user, ["ESS_ACCESS"])) {
    return "/ess";
  }

  if (
    hasEveryPermission(user, [
      "EMPLOYEE_READ",
      "ATTENDANCE_READ",
      "LEAVE_READ",
      "APPROVAL_ACCESS",
    ])
  ) {
    return "/hr/dashboard";
  }

  if (
    hasRole(user, ["SYSTEM_ADMIN"]) ||
    hasAnyPermission(user, ["ORG_MANAGE"])
  ) {
    return "/settings/system";
  }

  /*
   * ใช้สิทธิ์ที่เป็นด่านของหน้านั้นจริง ๆ ไม่ใช่สิทธิ์ที่ "น่าจะเกี่ยวข้อง"
   * ก่อนหน้านี้เช็ค MANPOWER_READ/REPORT_VIEW กับ APPROVAL_ACCESS แล้วส่งเข้า
   * ห้องผู้บริหาร/หน้าทีม ซึ่งกลายเป็นส่งไปเจอหน้า 403 หลังแยกสิทธิ์สองตัวนี้ออกมา
   */
  if (hasAnyPermission(user, ["EXECUTIVE_VIEW"])) {
    return "/executive/dashboard";
  }

  if (hasAnyPermission(user, ["TEAM_VIEW"])) {
    return "/manager/team";
  }

  if (hasAnyPermission(user, ["REPORT_VIEW"])) {
    return "/reports";
  }

  if (hasAnyPermission(user, ["PAYROLL_READ"])) {
    return "/payroll";
  }

  if (hasAnyPermission(user, ["PAYROLL_COMPENSATION_READ"])) {
    return "/payroll/employees";
  }

  if (hasAnyPermission(user, ["ESS_ACCESS"])) {
    return "/ess";
  }

  if (hasAnyPermission(user, ["ATTENDANCE_CHECKIN"])) {
    return "/ess/check-in";
  }

  return "/profile";
}
