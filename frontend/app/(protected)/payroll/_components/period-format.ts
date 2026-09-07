import type { PayrollPeriod } from "@/types/payroll";

/** ชื่อเดือนภาษาไทยกับการแปลงชื่องวด ใช้ร่วมกันทั้งหน้ารายการงวดและหน้ารายละเอียดงวด */

export const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** งวดเก็บปีเป็น ค.ศ. แต่คนไทยอ่าน พ.ศ. จึงบวก 543 ตรงชั้นแสดงผลที่เดียว */
export function periodLabel(
  period: Pick<PayrollPeriod, "month" | "year">,
) {
  return `${THAI_MONTHS[(period.month ?? 1) - 1] ?? ""} ${(period.year ?? 0) + 543}`;
}
