import { withNickname } from "@/lib/employee-nickname";

export type EmployeeNameLike = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  employeeCode?: string | null;
};

/**
 * ชื่อที่ใช้แสดงของพนักงาน
 *
 * เดิมมีสามตัวกระจายอยู่ (hr-ui.getHrEmployeeName, manager-ui.getEmployeeName,
 * ess-ui.getEmployeeName) ตรรกะเหมือนกันยกเว้นฝั่ง ESS ที่ไม่เอาคำนำหน้า
 * จึงทำเป็นตัวเลือกไว้แทนการมีสามฟังก์ชัน
 *
 * ชื่อเล่นต่อท้ายเสมอ "(ตาล)" — displayName ที่มาจาก API ถูกต่อให้แล้วที่ apiFetch
 * แต่ทางที่ประกอบชื่อเองจาก title/firstName/lastName ต้องต่อตรงนี้ ไม่งั้นหน้าที่
 * ไม่ได้ใช้ displayName จะขาดชื่อเล่นไป
 */
export function getEmployeeName(
  employee?: EmployeeNameLike | null,
  options: { includeTitle?: boolean; includeNickname?: boolean } = {},
) {
  if (!employee) return "-";

  const includeTitle = options.includeTitle ?? true;
  const includeNickname = options.includeNickname ?? true;

  const fullName = [
    includeTitle ? employee.title : null,
    employee.firstName,
    employee.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const base = employee.displayName || fullName || employee.employeeCode || "-";
  if (base === "-" || !includeNickname) return base;
  return withNickname(base, employee.nickname);
}
