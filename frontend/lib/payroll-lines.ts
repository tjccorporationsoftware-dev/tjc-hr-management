import type { PayrollLine } from "@/types/payroll";
import { toNumber } from "@/lib/payroll-format";

/**
 * การแสดงผลรายการเงินเดือน (PayrollLine) ที่ใช้ร่วมกันทุกหน้าในโซนเงินเดือน
 * =====================================================================
 * แก้สองเรื่องที่อ่านแล้วสับสน โดยไม่แตะการคำนวณและไม่แตะข้อมูลที่บันทึกไว้
 *
 * 1) ชื่อรายการ OT ไม่บอกว่าเป็นของวันไหน
 *    ระบบแยกเก็บเป็นสามรหัสอยู่แล้ว (วันทำงาน / วันหยุด / วันหยุดพิเศษ)
 *    แต่รหัสวันทำงานชื่อว่า "ค่าล่วงเวลา" เฉย ๆ พอวางคู่กับ "ค่าล่วงเวลาวันหยุด"
 *    คนอ่านจึงไม่รู้ว่าตัวแรกคือของวันไหน
 *
 * 2) ในป๊อปอัพรายคน OT ขึ้นเป็นหลายบรรทัด
 *    เพราะระบบสร้างหนึ่งบรรทัดต่อหนึ่งใบ OT ที่อนุมัติ คนที่ทำ OT 16 ครั้ง
 *    จึงเห็น "ค่าล่วงเวลา" 16 แถวติดกัน อ่านยอดรวมของแต่ละประเภทไม่ได้
 *    ยุบให้เหลือแถวเดียวต่อประเภท แสดงแค่ชื่อกับยอด ไม่มีคำอธิบายใต้ชื่อ
 *
 * ตั้งใจแก้ที่ชั้นแสดงผล ไม่ใช่ที่ฐานข้อมูล เพราะ
 *   - บรรทัดที่คำนวณไปแล้วเก็บ `name` ไว้ในตัวเอง ถ้าไปแก้ชื่อใน master
 *     งวดเก่าก็ยังขึ้นชื่อเดิมอยู่ดี จนกว่าจะคำนวณใหม่
 *   - การยุบบรรทัดต้องไม่ทำให้ที่มาของตัวเลขหาย บรรทัดจริงยังอยู่ครบใน DB
 *     ตรวจย้อนกับใบ OT รายใบได้เหมือนเดิม (หน้าตรวจสอบรายการใช้ข้อมูลดิบ)
 */

/**
 * ชื่อที่ใช้แสดงแทนชื่อที่บันทึกไว้ในบรรทัด — ใส่เฉพาะรหัสที่ชื่อเดิมกำกวมจริง
 * รหัสอื่นใช้ชื่อจากบรรทัดตามเดิม จะได้ไม่ต้องมาไล่ตามทุกครั้งที่ HR เพิ่มรายการใหม่
 */
const LINE_LABEL_BY_CODE: Record<string, string> = {
  OVERTIME_PAY: "ค่าล่วงเวลา (วันทำงาน)",
  OT_HOLIDAY: "ค่าล่วงเวลา (วันหยุด)",
  OT_SPECIAL_HOLIDAY: "ค่าล่วงเวลา (วันหยุดพิเศษ)",
};

export function payrollLineLabel(line: Pick<PayrollLine, "code" | "name">) {
  return LINE_LABEL_BY_CODE[line.code] ?? line.name;
}

export type GroupedPayrollLine = {
  /** ใช้เป็น key ของ React — รหัสไม่ซ้ำกันในหนึ่งรายการเงินเดือน */
  key: string;
  code: string;
  label: string;
  amount: number;
};

/**
 * ยุบบรรทัดที่รหัสเดียวกันให้เหลือรายการเดียว
 *
 * เรียงตามลำดับที่เจอครั้งแรก ไม่เรียงใหม่ เพื่อให้ลำดับบนหน้าจอยังตรงกับ
 * ลำดับที่ backend ส่งมา (เงินเดือนฐานอยู่บนสุดเหมือนเดิม)
 */
export function groupPayrollLines(
  lines: PayrollLine[],
): GroupedPayrollLine[] {
  const buckets = new Map<string, GroupedPayrollLine>();

  for (const line of lines) {
    const key = line.code || line.name;
    const existing = buckets.get(key);

    if (!existing) {
      buckets.set(key, {
        key,
        code: line.code,
        label: payrollLineLabel(line),
        amount: toNumber(line.amount),
      });
      continue;
    }

    existing.amount += toNumber(line.amount);
  }

  return Array.from(buckets.values());
}

/**
 * รายการที่ควรอยู่ติดกันบนหน้าจอ
 *
 * ค่าล่วงเวลาสามประเภทเป็นเรื่องเดียวกัน แต่ยอดต่างกันมาก พอเรียงตามยอด
 * "วันทำงาน" กับ "วันหยุด" จึงถูกรายการอื่นแทรกกลาง คนอ่านต้องไล่หาเอง
 * จับเป็นกลุ่มเดียวกันไว้ แล้วให้ทั้งกลุ่มไปนั่งตรงตำแหน่งของสมาชิกที่ยอดสูงสุด
 */
const LINE_FAMILY_BY_CODE: Record<string, string> = {
  OVERTIME_PAY: "OVERTIME",
  OT_HOLIDAY: "OVERTIME",
  OT_SPECIAL_HOLIDAY: "OVERTIME",
};

export function payrollLineFamily(code: string) {
  return LINE_FAMILY_BY_CODE[code] ?? code;
}

/**
 * เรียงจากยอดมากไปน้อย แต่ไม่แยกรายการในกลุ่มเดียวกันออกจากกัน
 * ลำดับของกลุ่มตัดสินด้วยยอดสูงสุดในกลุ่ม ภายในกลุ่มเรียงจากมากไปน้อยเหมือนกัน
 */
export function sortLinesByAmountKeepingFamilies<
  T extends { code: string; amount: number },
>(rows: T[]): T[] {
  const familyPeak = new Map<string, number>();

  for (const row of rows) {
    const family = payrollLineFamily(row.code);
    familyPeak.set(family, Math.max(familyPeak.get(family) ?? -Infinity, row.amount));
  }

  return [...rows].sort((a, b) => {
    const familyA = payrollLineFamily(a.code);
    const familyB = payrollLineFamily(b.code);

    if (familyA !== familyB) {
      return (familyPeak.get(familyB) ?? 0) - (familyPeak.get(familyA) ?? 0);
    }

    return b.amount - a.amount;
  });
}
