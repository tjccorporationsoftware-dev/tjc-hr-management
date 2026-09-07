import { formatThaiDate } from "@/lib/date-format";
import type {
  EmployeeDetail,
  EmployeeSupervisorRef,
  EmployeeProbationRecord,
} from "@/types/employee";
import type { EmployeeCompensation } from "@/types/payroll";
import type { StatusMeta } from "@/lib/status-labels";
import { PROBATION_STATUS } from "@/lib/status-labels";

/**
 * ตัวช่วยแปลงค่าของหน้ารายละเอียดพนักงาน
 * --------------------------------------
 * รวมไว้ที่เดียวเพราะแต่ละแท็บใช้ซ้ำกันเกือบทั้งหมด
 * คำเรียกสถานะกลาง (ลา / OT / ทดลองงาน) ใช้จาก `@/lib/status-labels` ไม่เขียนซ้ำที่นี่
 */

export const dash = "-";

export function dateText(value?: string | null) {
  return formatThaiDate(value);
}

export function countText(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("th-TH") : "0";
}

export function decimalText(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0.0";

  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** เงินในหน้านี้ไม่ใส่สัญลักษณ์สกุล คอลัมน์ตัวเลขจะได้เรียงหลักตรงกัน */
export function moneyText(value: unknown) {
  if (value === null || value === undefined || value === "") return dash;

  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function sumOf(values: unknown[]) {
  return values.reduce<number>((total, value) => total + toNumber(value), 0);
}

export function countStatus<T extends { status?: string | null }>(
  items: T[],
  status: string,
) {
  return items.filter((item) => item.status === status).length;
}

export function timeText(value?: string | null) {
  if (!value) return dash;

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return value.slice(0, 5);
}

/** ค่าที่ว่าง/ไม่ระบุ ให้กลายเป็นขีดเดียวกันหมด จะได้ไม่มีทั้ง "" และ "ไม่ระบุ" ปนกัน */
export function textOf(value: unknown) {
  if (value === null || value === undefined) return dash;

  const text = String(value).trim();
  return text && text !== "ไม่ระบุ" ? text : dash;
}

export function employeeNameOf(employee: EmployeeDetail) {
  return (
    employee.displayName ||
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    employee.employeeCode ||
    dash
  );
}

export function personNameOf(
  person: Pick<
    EmployeeSupervisorRef,
    "title" | "firstName" | "lastName" | "displayName" | "employeeCode"
  >,
) {
  return (
    person.displayName ||
    [person.title, person.firstName, person.lastName]
      .filter(Boolean)
      .join(" ") ||
    person.employeeCode ||
    dash
  );
}

/** อายุงานนับเป็นปี/เดือน แบบที่ HR ใช้คุยกันจริง ไม่ใช่จำนวนวัน */
export function tenureText(startDate?: string | null) {
  if (!startDate) return dash;

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return dash;

  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();

  if (now.getDate() < start.getDate()) months -= 1;

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) return "น้อยกว่า 1 เดือน";
  if (years <= 0) return `${months} เดือน`;
  if (months <= 0) return `${years} ปี`;
  return `${years} ปี ${months} เดือน`;
}

export function onOffText(value?: boolean | null) {
  if (value === null || value === undefined) return dash;
  return value ? "เปิดใช้งาน" : "ปิดใช้งาน";
}

export function attendanceMethodsText(values?: string[] | null) {
  if (!values || values.length === 0) return dash;

  const map: Record<string, string> = {
    WEB: "เว็บไซต์",
    MOBILE: "แอปมือถือ",
    DEVICE: "เครื่องบันทึกเวลา",
  };

  return values.map((value) => map[value] || value).join(" · ");
}

export function genderText(value?: string | null) {
  const map: Record<string, string> = {
    MALE: "ชาย",
    FEMALE: "หญิง",
    OTHER: "อื่น ๆ",
    NOT_SPECIFIED: "ไม่ระบุ",
  };

  return value ? map[value] || value : dash;
}

export function maritalStatusText(value?: string | null) {
  const map: Record<string, string> = {
    SINGLE: "โสด",
    MARRIED: "สมรส",
    DIVORCED: "หย่า",
    WIDOWED: "หม้าย",
    NOT_SPECIFIED: "ไม่ระบุ",
  };

  return value ? map[value] || value : dash;
}

/** สถานะของ "บัญชีผู้ใช้" คนละชุดกับสถานะการจ้างงาน อย่าเอา EMPLOYEE_STATUS มาใช้ */
export function userStatusText(value?: string | null) {
  const map: Record<string, string> = {
    ACTIVE: "เปิดใช้งาน",
    INACTIVE: "ปิดใช้งาน",
    SUSPENDED: "ถูกระงับ",
  };

  return value ? map[value] || value : dash;
}

export function paymentMethodText(value?: string | null) {
  const map: Record<string, string> = {
    BANK_TRANSFER: "โอนเข้าบัญชี",
    CASH: "เงินสด",
    CHEQUE: "เช็ค",
    CHECK: "เช็ค",
    OTHER: "อื่น ๆ",
  };

  return value ? map[value] || value : dash;
}

export function documentTypeText(value?: string | null) {
  const map: Record<string, string> = {
    ID_CARD: "สำเนาบัตรประชาชน",
    HOUSE_REGISTRATION: "ทะเบียนบ้าน",
    EMPLOYMENT_CONTRACT: "สัญญาจ้าง",
    EDUCATION_CERTIFICATE: "วุฒิการศึกษา",
    BANK_BOOK: "สมุดบัญชีธนาคาร",
    MEDICAL_CERTIFICATE: "ใบรับรองแพทย์",
    WORK_PERMIT: "ใบอนุญาตทำงาน",
    OTHER: "เอกสารอื่น ๆ",
  };

  return value ? map[value] || value : dash;
}

export function workHistoryTypeText(value?: string | null) {
  const map: Record<string, string> = {
    JOINED: "เริ่มงาน",
    POSITION_CHANGE: "เปลี่ยนตำแหน่ง",
    DEPARTMENT_TRANSFER: "ย้ายแผนก",
    BRANCH_TRANSFER: "ย้ายสาขา",
    DIVISION_TRANSFER: "ย้ายฝ่าย / กลุ่มงาน",
    EMPLOYEE_TYPE_CHANGE: "เปลี่ยนประเภทพนักงาน",
    SALARY_ADJUSTMENT: "ปรับเงินเดือน",
    STATUS_CHANGE: "เปลี่ยนสถานะ",
    OTHER: "รายการอื่น ๆ",
  };

  return value ? map[value] || value : dash;
}

export function leaveDayTypeText(value?: string | null) {
  const map: Record<string, string> = {
    FULL_DAY: "เต็มวัน",
    HALF_DAY_MORNING: "ครึ่งวันเช้า",
    HALF_DAY_AFTERNOON: "ครึ่งวันบ่าย",
    HOURLY: "รายชั่วโมง",
  };

  return value ? map[value] || value : dash;
}

export function overtimeWorkTypeText(value?: string | null) {
  const map: Record<string, string> = {
    WORKDAY: "วันทำงาน",
    HOLIDAY: "วันหยุด",
    SPECIAL_HOLIDAY: "วันหยุดพิเศษ",
  };

  return value ? map[value] || value : dash;
}

/** สถานะเอกสารพนักงาน ยังไม่มีในคลังคำกลาง */
export const DOCUMENT_STATUS_VOCABULARY: Record<string, StatusMeta> = {
  ACTIVE: { label: "ใช้งาน", tone: "emerald" },
  EXPIRED: { label: "หมดอายุ", tone: "red" },
  REPLACED: { label: "ถูกแทนที่", tone: "slate" },
  DELETED: { label: "ลบแล้ว", tone: "slate" },
};

/** สถานะใบลาออก ใช้คำเดียวกับสายอนุมัติอื่น ๆ */
export const RESIGNATION_STATUS_VOCABULARY: Record<string, StatusMeta> = {
  DRAFT: { label: "ร่าง", tone: "slate" },
  SUBMITTED: { label: "รออนุมัติ", tone: "amber" },
  APPROVED: { label: "อนุมัติแล้ว", tone: "emerald" },
  REJECTED: { label: "ไม่อนุมัติ", tone: "red" },
  CANCELLED: { label: "ยกเลิก", tone: "slate" },
};

/** คลังคำกลางยังไม่มี EXTENDED เติมให้ที่นี่จนกว่าจะย้ายไปอยู่ในนั้น */
export const PROBATION_VOCABULARY: Record<string, StatusMeta> = {
  ...PROBATION_STATUS,
  EXTENDED: { label: "ขยายเวลาทดลองงาน", tone: "violet" },
};

export function probationLabel(status: EmployeeProbationRecord["status"]) {
  return PROBATION_VOCABULARY[status]?.label ?? status;
}

/** ค่าตอบแทนที่ใช้อยู่จริงวันนี้ ถ้าไม่มีให้ใช้รายการล่าสุดแทน */
export function pickCurrentCompensation(items: EmployeeCompensation[]) {
  if (items.length === 0) return null;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime(),
  );

  return (
    sorted.find(
      (item) =>
        item.status === "ACTIVE" &&
        new Date(item.effectiveDate).getTime() <= today.getTime(),
    ) ?? sorted[0]
  );
}

/**
 * ค่าตอบแทนตามใบนี้ = เงินเดือนฐานอย่างเดียว
 *
 * เบี้ยประจำทั้งหมดย้ายไปอยู่ที่ "รายการประจำ" (employee_compensation_items)
 * ซึ่งมีอายุของตัวเองไม่ได้ผูกกับใบปรับเงินเดือน จึงเอามารวมในบรรทัดเดียวกับ
 * ประวัติการปรับฐานไม่ได้ ต้องอ่านแยกจากรายการประจำโดยตรง
 */
export function compensationTotalOf(compensation: EmployeeCompensation) {
  return toNumber(compensation.baseSalary);
}
