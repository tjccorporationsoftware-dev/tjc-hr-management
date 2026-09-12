/**
 * ชื่อพนักงานสำหรับ "หน้าจอ" — ต่อชื่อเล่นท้ายชื่อเสมอ
 *
 * ผู้ใช้เรียกกันด้วยชื่อเล่นทั้งบริษัท รายชื่อบนหน้าเว็บทุกหน้าจึงต้องเป็น
 * "นางสาว สุภาพร สองเมือง (ตาล)"
 *
 * ฝั่งหน้าเว็บต่อให้เองแล้วเมื่อ response มีคู่ displayName + nickname มาด้วยกัน
 * ตัวนี้มีไว้สำหรับ endpoint ที่ประกอบชื่อเป็นสตริงสำเร็จรูป (employeeName) ตั้งแต่
 * ฝั่งเซิร์ฟเวอร์ เช่น หน้าตรวจความพร้อมเงินเดือน / รายการรอยสแกน
 *
 * ห้ามใช้กับเอกสารทางการ (สลิป, ภ.ง.ด., สปส., ไฟล์โอนเงิน) — พวกนั้นต้องเป็นชื่อจริงล้วน
 * และไม่ผ่านตัวนี้อยู่แล้ว
 */
export type EmployeeDisplayNameLike = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  employeeCode?: string | null;
};

export function withNickname(
  name: string | null | undefined,
  nickname: string | null | undefined,
) {
  const base = (name ?? "").trim();
  const nick = (nickname ?? "").trim();
  if (!base || !nick) return base;
  return base.endsWith(`(${nick})`) ? base : `${base} (${nick})`;
}

export function employeeDisplayName(
  employee: EmployeeDisplayNameLike | null | undefined,
  options: { includeTitle?: boolean; fallback?: string } = {},
) {
  const fallback = options.fallback ?? "-";
  if (!employee) return fallback;

  const includeTitle = options.includeTitle ?? true;
  const base =
    employee.displayName?.trim() ||
    [includeTitle ? employee.title : null, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    employee.employeeCode ||
    fallback;

  if (base === fallback) return base;
  return withNickname(base, employee.nickname);
}
