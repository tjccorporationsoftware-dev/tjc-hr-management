export type EmployeeNameLike = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  employeeCode?: string | null;
};

/**
 * ชื่อที่ใช้แสดงของพนักงาน
 *
 * เดิมมีสามตัวกระจายอยู่ (hr-ui.getHrEmployeeName, manager-ui.getEmployeeName,
 * ess-ui.getEmployeeName) ตรรกะเหมือนกันยกเว้นฝั่ง ESS ที่ไม่เอาคำนำหน้า
 * จึงทำเป็นตัวเลือกไว้แทนการมีสามฟังก์ชัน
 */
export function getEmployeeName(
  employee?: EmployeeNameLike | null,
  options: { includeTitle?: boolean } = {},
) {
  if (!employee) return "-";

  const includeTitle = options.includeTitle ?? true;

  const fullName = [
    includeTitle ? employee.title : null,
    employee.firstName,
    employee.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return employee.displayName || fullName || employee.employeeCode || "-";
}
