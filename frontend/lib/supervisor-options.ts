import type { EmployeeListItem } from "@/types/employee";

/**
 * กติกาการเลือกหัวหน้างาน
 * -----------------------------------------------------------------------------
 * backend (ensureValidSupervisor) บังคับแค่ 3 ข้อ
 *   1) ไม่ใช่ตัวเอง
 *   2) อยู่บริษัทเดียวกัน และสาขาเดียวกัน
 *   3) ไม่ทำให้สายบังคับบัญชาวนกลับ
 *
 * ไม่ได้บังคับว่าต้องแผนกเดียวกัน เพราะโครงสร้างจริงหัวหน้าแผนกย่อมขึ้นตรงกับ
 * ผู้บริหารซึ่งอยู่คนละแผนกเสมอ ฝั่งหน้าจอจึงต้องไม่เข้มกว่านี้
 * แผนกใช้แค่จัดลำดับให้หาง่าย ไม่ใช้ตัดคนออก
 */

/** คนแผนกเดียวกันขึ้นก่อน จากนั้นเรียงตามชื่อแผนกและรหัสพนักงาน */
export function sortSupervisorsByDepartment<T extends EmployeeListItem>(
  supervisors: T[],
  departmentId?: string | null,
) {
  return [...supervisors].sort((a, b) => {
    if (departmentId) {
      const aSame = a.departmentId === departmentId ? 0 : 1;
      const bSame = b.departmentId === departmentId ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
    }

    const aDept = a.department?.nameTh ?? "";
    const bDept = b.department?.nameTh ?? "";
    if (aDept !== bDept) return aDept.localeCompare(bDept, "th");

    return a.employeeCode.localeCompare(b.employeeCode, "th");
  });
}

/**
 * ข้อความในตัวเลือก
 * ต้องบอกแผนกด้วย เพราะตอนนี้รายการมีคนข้ามแผนกปนอยู่
 * ถ้าเห็นแต่ชื่อกับตำแหน่งจะแยกไม่ออกว่าใครอยู่ทีมไหน
 */
export function buildSupervisorOptionLabel(
  name: string,
  supervisor: EmployeeListItem,
) {
  const position =
    supervisor.positionMaster?.nameTh || supervisor.position || "ไม่ระบุตำแหน่ง";
  const department = supervisor.department?.nameTh;

  return department
    ? `${name} - ${position} · ${department}`
    : `${name} - ${position}`;
}
