import type { OrganizationOption } from "@/types/employee";

/**
 * กติกาการเลือกแผนก
 * -----------------------------------------------------------------------------
 * แผนกผูกกับ "บริษัท" ส่วน branchId เป็น optional
 *   - branchId = null  → แผนกระดับบริษัท ใช้ร่วมกันทุกสาขา
 *   - branchId = ค่า   → แผนกเฉพาะสาขานั้น
 *
 * backend กรองแบบเดียวกันทั้งตอนลิสต์ (branchScopedDepartmentFilter) และตอน
 * ตรวจก่อนบันทึกพนักงาน คือ `OR: [{ branchId: null }, { branchId }]`
 * ฝั่งหน้าจอถ้าเทียบ branchId ตรง ๆ แผนกระดับบริษัทจะหายหมดทันทีที่เลือกสาขา
 */
export function filterDepartmentsByScope(
  departments: OrganizationOption[],
  scope: { companyId?: string; branchId?: string },
) {
  return departments.filter((department) => {
    if (scope.companyId && department.companyId !== scope.companyId) {
      return false;
    }

    // แผนกระดับบริษัท (branchId ว่าง) ใช้ได้กับทุกสาขา
    if (scope.branchId && department.branchId && department.branchId !== scope.branchId) {
      return false;
    }

    return true;
  });
}

/** แผนกที่เลือกไว้ยังใช้กับสาขาใหม่ได้ไหม (ยังไม่ได้เลือกแผนก = ไม่ต้องล้าง) */
export function departmentFitsBranch(
  departments: OrganizationOption[],
  departmentId: string,
  branchId: string,
) {
  if (!departmentId || !branchId) return true;

  const department = departments.find((item) => item.id === departmentId);
  if (!department) return true;

  return !department.branchId || department.branchId === branchId;
}
