/**
 * Payroll shared types
 *
 * ไฟล์นี้รวม type กลางของ payroll module
 * เป้าหมายคือไม่ให้ type กระจายอยู่ใน service หลายไฟล์จนแก้ยาก
 */
export type PayrollActorId = string | undefined;

export type PayrollCalculationMoney = string | number | null | undefined;

export type PayrollHandoffSourceType =
  | 'LEAVE'
  | 'OVERTIME'
  | 'TIME_ADJUST'
  | 'ATTENDANCE'
  | 'MANUAL';
