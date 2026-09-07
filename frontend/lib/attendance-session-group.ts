/**
 * การจัดกลุ่มพนักงานตามกติกาลงเวลา — ใช้ร่วมกันระหว่างหน้าตรวจเวลารายวันกับหน้าตรวจก่อนเข้าเงินเดือน
 * ทั้งสองหน้าต้องเรียงและคั่นกลุ่มเหมือนกัน ไม่งั้น HR ไล่เทียบข้ามหน้าไม่ได้
 */

type OrgRef =
  | { id: string; code?: string | null; nameTh?: string | null }
  | null
  | undefined;

export type AttendanceGroupEmployee =
  | {
      branch?: OrgRef;
      department?: OrgRef;
      attendanceTrackingRequired?: boolean;
      attendanceExemptSessions?: Array<"MORNING_IN" | "AFTERNOON_IN" | "CHECK_OUT">;
    }
  | null
  | undefined;

const MANAGEMENT_DEPARTMENT_CODE = "MGT";

/**
 * กลุ่มการลงเวลาที่ใช้เรียงแถว — คนที่กติกาเหมือนกันต้องอยู่ติดกัน
 * ไม่งั้นต้องไล่อ่านทีละแถวว่าช่องว่างของใครคือยกเว้น ของใครคือยังไม่ลง
 *
 * 0 ฝ่ายบริหาร · 1 ต้องลงครบ 3 รอบ · 2 ยกเว้นเข้างานบ่าย · 3 ยกเว้นรอบอื่น/ไม่ต้องลงเวลา
 */
export function getAttendanceSessionGroupRank(employee: AttendanceGroupEmployee) {
  const department = employee?.department;

  if (
    department?.code === MANAGEMENT_DEPARTMENT_CODE ||
    (department?.nameTh || "").includes("บริหาร")
  ) {
    return 0;
  }

  const exemptSessions = employee?.attendanceExemptSessions ?? [];

  if (employee?.attendanceTrackingRequired === false) return 3;
  if (exemptSessions.length === 0) return 1;
  if (exemptSessions.includes("AFTERNOON_IN")) return 2;

  return 3;
}

/** คีย์ของกลุ่มในตาราง — แผนกซ้อนอยู่ใต้สาขา ชื่อแผนกซ้ำข้ามสาขาได้จึงต้องรวมสาขาไว้ในคีย์ */
export function attendanceBranchGroupKey(employee: AttendanceGroupEmployee) {
  return `b:${employee?.branch?.id ?? "none"}`;
}

export function attendanceDepartmentGroupKey(employee: AttendanceGroupEmployee) {
  return `${attendanceBranchGroupKey(employee)}|d:${employee?.department?.id ?? "none"}`;
}

/** ชื่อที่ใช้เรียง — สังกัดที่ไม่ระบุไปอยู่ท้ายสุดเสมอ */
export function attendanceBranchSortText(employee: AttendanceGroupEmployee) {
  return employee?.branch?.nameTh || "￿";
}

export function attendanceDepartmentSortText(employee: AttendanceGroupEmployee) {
  return employee?.department?.nameTh || "￿";
}

/**
 * ลำดับของแผนก = กลุ่มการลงเวลาที่ "เร็วที่สุด" ในแผนกนั้น
 *
 * ตารางจัดกลุ่มตามแผนก คนแผนกเดียวกันจึงต้องอยู่ติดกันเสมอ ถ้าเรียงด้วยกลุ่มรายคนตรง ๆ
 * แผนกที่มีทั้งคนลงครบ 3 รอบและคนยกเว้นเข้างานบ่ายจะถูกฉีกเป็นสองหัวกลุ่ม
 */
export function buildAttendanceDepartmentGroupRank<T>(
  rows: T[],
  getEmployee: (row: T) => AttendanceGroupEmployee,
  getKey: (row: T) => string = (row) =>
    attendanceDepartmentGroupKey(getEmployee(row)),
) {
  const ranks = new Map<string, number>();

  for (const row of rows) {
    const key = getKey(row);
    const rank = getAttendanceSessionGroupRank(getEmployee(row));
    const current = ranks.get(key);
    if (current === undefined || rank < current) ranks.set(key, rank);
  }

  return ranks;
}
