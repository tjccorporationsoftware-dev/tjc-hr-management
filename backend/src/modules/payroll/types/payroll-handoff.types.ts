import type { PayrollLineSourceType, PayrollLineType } from '../../../generated/prisma/client';

/**
 * Payroll Handoff Types
 * ---------------------
 * Type กลางสำหรับแปลงรายการที่ HR Review แล้วให้กลายเป็น PayrollLine
 *
 * แนวคิด:
 * - HrReviewItem คือหลักฐานว่า HR ตรวจรายการ Leave / OT / Time Adjust แล้ว
 * - PayrollHandoffLine คือรายการเงินเดือนที่พร้อมสร้างเป็น PayrollLine
 * - PayrollHandoffSummary คือผลรวมที่ PayrollItem ต้องเอาไปใส่ในช่อง summary เช่น overtimeHours / unpaidLeaveDays
 */

export type PayrollCalculationSettings = {
  /** จำนวนวันหารฐานเงินเดือน เช่น 30 วัน หรือค่าจาก System Settings */
  salaryDivisorDays: number;
  /** จำนวนชั่วโมงทำงานต่อวัน เช่น 8 ชั่วโมง หรือค่าจาก System Settings */
  workingHoursPerDay: number;
};

export type PayrollHandoffSourceType = 'LEAVE' | 'OVERTIME' | 'TIME_ADJUST';

export type PayrollHandoffLine = {
  /** รหัส line ที่จะไปแสดงในสลิป เช่น OVERTIME_PAY, UNPAID_LEAVE_DEDUCTION */
  code: string;
  /** ชื่อรายการภาษาไทยที่แสดงในสลิป */
  name: string;
  /** ประเภทรายการเงินเดือน: รายได้ / รายหัก / ข้อมูลประกอบ */
  type: PayrollLineType;
  /** sourceType ใช้บอกว่า line นี้มาจาก OT / LEAVE / ATTENDANCE */
  sourceType: PayrollLineSourceType;
  /** id ของคำขอต้นทาง เช่น overtimeRequest.id / leaveRequest.id */
  sourceId: string;
  /** PayrollComponent id ถ้าต้นทางผูก component มาโดยตรง */
  componentId?: string | null;
  /** ปริมาณ เช่น ชั่วโมง OT หรือจำนวนวันลา */
  quantity: number;
  /** อัตราต่อหน่วย เช่น ค่าแรงต่อชั่วโมง x multiplier หรือค่าแรงต่อวัน */
  rate: number;
  /** จำนวนเงินรวมของ line นี้ */
  amount: number;
  /** ใช้เรียงลำดับในสลิป */
  sortOrder: number;
  /** เงินรายการนี้คิดภาษีหรือไม่ */
  isTaxable?: boolean;
  /** เงินรายการนี้เป็นฐานประกันสังคมหรือไม่ */
  isSocialSecurityBase?: boolean;
  /** หมายเหตุสำหรับ audit ว่ามาจากคำขออะไร */
  note?: string | null;
};

export type PayrollHandoffSummary = {
  /** id ของ HrReviewItem ที่ถูกนำเข้ารอบ payroll นี้ ใช้ mark เป็น SENT_TO_PAYROLL หลังคำนวณสำเร็จ */
  reviewItemIds: string[];
  /** รายการรายได้เพิ่มเติม เช่น OT */
  earningLines: PayrollHandoffLine[];
  /** รายการหัก เช่น ลาไม่รับค่าจ้าง */
  deductionLines: PayrollHandoffLine[];
  /** รายการข้อมูลประกอบ เช่น ลาที่ได้รับค่าจ้าง / ขอแก้เวลา */
  infoLines: PayrollHandoffLine[];
  /** ชั่วโมง OT รวมที่อนุมัติและ HR ส่งเข้า payroll */
  overtimeHours: number;
  /** วันลาที่ได้รับค่าจ้าง ใช้แสดงใน PayrollItem */
  paidLeaveDays: number;
  /** วันลาไม่รับค่าจ้าง ใช้แสดงใน PayrollItem และคิดรายการหัก */
  unpaidLeaveDays: number;
  /** นาทีมาสาย จาก phase นี้ยังไม่คำนวณจริง เก็บไว้เผื่อ phase attendance payroll */
  lateMinutes: number;
};

export type CollectPayrollHandoffParams = {
  companyId: string;
  employeeId: string;
  periodId: string;
  payrollRunId: string;
  periodStartDate: Date;
  periodEndDate: Date;
  baseSalary: number;
  /**
   * ฐานของ baseSalary — ไม่ส่งมา = MONTHLY เท่าพฤติกรรมเดิม
   * จำเป็นตอนหาอัตราต่อชั่วโมงของ OT พนักงานรายวัน/พาร์ทไทม์
   */
  salaryBasis?: 'MONTHLY' | 'DAILY' | 'HOURLY';
  payrollCalculationSettings?: PayrollCalculationSettings;
};
