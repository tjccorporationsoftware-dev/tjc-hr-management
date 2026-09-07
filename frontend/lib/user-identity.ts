import type { AuthUser } from "@/types/auth";

/**
 * ชื่อที่ใช้เรียก "ผู้ใช้ที่ล็อกอินอยู่" บนหน้าจอ
 * ---------------------------------------------
 * แถบบนสุดต้องบอกให้ได้ว่า "ตอนนี้ฉันอยู่บริษัทไหน และเข้ามาด้วยสิทธิ์อะไร"
 *
 * **ชื่อโรลให้ยึดค่าจากฐานข้อมูลเสมอ** (`/profile/me` คืน `{ code, name }` มาให้)
 * เพราะผู้ดูแลแก้ชื่อโรลและสร้างโรลใหม่เองได้ที่หน้าจัดการสิทธิ์ ถ้าหน้าเว็บ
 * แปลชื่อเองจะเพี้ยนจากที่ตั้งไว้ทันที ตาราง `ROLE_LABELS` ข้างล่างเป็นแค่
 * ตัวสำรองสำหรับที่ที่มีแต่โค้ด (เช่น `/auth/me`) ยังไม่รู้ชื่อจริง
 */

type IdentityUser = Pick<AuthUser, "roles"> &
  Partial<Pick<AuthUser, "scope">> &
  Record<string, unknown>;

type UserLike = IdentityUser | null | undefined;

/** โรลจากฐานข้อมูล — ที่อื่นส่งมาเป็นโค้ดล้วนก็ได้ */
export type RoleLike = string | { code?: string | null; name?: string | null };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "ผู้ดูแลระบบ",
  SYSTEM_ADMIN: "ผู้ดูแลระบบ",
  ADMIN: "ผู้ดูแลระบบ",
  EXECUTIVE: "ผู้บริหาร",
  HR_MANAGER: "ผู้จัดการฝ่ายบุคคล",
  HR_ADMIN: "เจ้าหน้าที่ฝ่ายบุคคล",
  PAYROLL_ACCOUNTING: "บัญชีและเงินเดือน",
  DEPARTMENT_MANAGER: "ผู้จัดการแผนก",
  DEPT_MANAGER: "ผู้จัดการแผนก",
  MANAGER: "หัวหน้างาน",
  EMPLOYEE: "พนักงาน",
};

/**
 * ผู้ใช้หนึ่งคนมีได้หลายโรล ต้องเลือกใบเดียวมาแสดง
 * เรียงจาก "สิทธิ์กว้างสุด" ลงมา เพราะคนที่เป็นทั้ง HR และพนักงาน
 * ย่อมเข้าระบบมาในฐานะ HR ไม่ใช่พนักงานทั่วไป
 */
const ROLE_PRIORITY = [
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "ADMIN",
  "EXECUTIVE",
  "HR_MANAGER",
  "HR_ADMIN",
  "PAYROLL_ACCOUNTING",
  "DEPARTMENT_MANAGER",
  "DEPT_MANAGER",
  "MANAGER",
  "EMPLOYEE",
];

function getRoleCode(role: RoleLike) {
  const code = typeof role === "string" ? role : (role?.code ?? "");

  return code.trim().toUpperCase();
}

/** "HR_ADMIN" → "Hr Admin" — ใช้เมื่อเจอโรลที่ผู้ดูแลสร้างเองและยังไม่มีคำไทย */
function humanizeRoleCode(code: string) {
  return code
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * ผู้ใช้คนหนึ่งมีได้หลายโรล — เลือกใบที่สิทธิ์กว้างสุดมาแสดงหนึ่งใบ
 * คืน `null` เมื่อยังไม่รู้โรล เพื่อให้ผู้เรียกเลือกได้ว่าจะไม่แสดงอะไรเลย
 * (ดีกว่าโชว์คำเดาไว้ก่อนแล้วสลับเป็นชื่อจริงทีหลังจนตัวหนังสือกระพริบ)
 */
export function getPrimaryRoleLabel(roles?: RoleLike[] | null) {
  if (!roles || roles.length === 0) {
    return null;
  }

  const primaryRole =
    ROLE_PRIORITY.map((code) =>
      roles.find((role) => getRoleCode(role) === code),
    ).find(Boolean) ?? roles[0];

  const name = typeof primaryRole === "string" ? "" : (primaryRole?.name ?? "");

  if (name.trim()) {
    return name.trim();
  }

  const code = getRoleCode(primaryRole);

  return ROLE_LABELS[code] ?? (humanizeRoleCode(code) || null);
}

/** ชื่อบริษัทที่ผู้ใช้สังกัด — ผู้ดูแลระดับแพลตฟอร์มเห็นได้ทุกบริษัทจึงไม่มีชื่อเดียว */
export function getCompanyLabel(user: UserLike) {
  const scope = user?.scope;

  if (scope?.companyName) {
    return scope.companyName;
  }

  if (scope?.level === "GLOBAL") {
    return "ทุกบริษัทในระบบ";
  }

  return "ยังไม่ได้ระบุบริษัท";
}

/** ชื่อสาขา — คืน null เมื่อผู้ใช้ไม่ได้ผูกกับสาขาใดสาขาหนึ่ง */
export function getBranchLabel(user: UserLike) {
  return user?.scope?.branchName ?? null;
}
