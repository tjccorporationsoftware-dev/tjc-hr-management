import type { PayrollLineSourceType, PayrollLineType } from '../../../generated/prisma/client';

/**
 * PayrollExtraLine
 * ----------------
 * type กลางสำหรับ service ที่สร้าง PayrollLine เพิ่มเติมก่อนบันทึกจริง
 * เช่น recurring compensation, manual adjustment, attendance deduction
 */
export type PayrollExtraLine = {
  code: string;
  name: string;
  type: PayrollLineType;
  sourceType: PayrollLineSourceType;
  sourceId?: string | null;
  componentId?: string | null;
  /**
   * ใช้เฉพาะรายการค่าตอบแทนประจำจาก EmployeeCompensationItem
   * เพื่อให้ PayrollService ตรวจได้ว่ารายการนั้นผูกกับฐานเงินเดือน record ไหน
   * และป้องกันการสร้าง OTHER_EARNING ซ้ำกับรายการที่แยกชื่อไว้แล้ว
   */
  compensationId?: string | null;
  quantity: number;
  rate: number;
  amount: number;
  isTaxable?: boolean;
  isSocialSecurityBase?: boolean;
  /**
   * เฉพาะรายการค่าตอบแทนประจำ — ให้ PayrollService รู้ว่าบรรทัดนี้
   * ต้องหารตามวันที่เป็นพนักงานจริงหรือจ่ายเต็มจำนวน
   * รายการเฉพาะงวด (โบนัส ปรับปรุงรายเดือน) ไม่ใช้ค่านี้ เพราะเป็นยอดของงวดนั้นอยู่แล้ว
   */
  prorateByEmploymentDays?: boolean;
  /** ยอดก่อนหารตามวัน — เก็บไว้แสดงบนสลิปว่าหักมาจากเท่าไร */
  fullAmount?: number;
  sortOrder: number;
  note?: string | null;
};

export type PayrollExtraLineSummary = {
  earningLines: PayrollExtraLine[];
  deductionLines: PayrollExtraLine[];
  infoLines: PayrollExtraLine[];
  adjustmentIds?: string[];
  lateMinutes?: number;
  absentDays?: number;
  /** จำนวนวันที่มาทำงานจริงในงวด ใช้แสดงบนสลิปเงินเดือน */
  workedDays?: number;
};
