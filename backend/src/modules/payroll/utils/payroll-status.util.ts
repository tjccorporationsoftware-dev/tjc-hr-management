import { PayrollRunStatus } from '../../../generated/prisma/client';

/**
 * Payroll status utilities
 *
 * รวม rule เรื่องสถานะ Payroll Run ไว้ที่เดียว
 * ถ้าภายหลังเพิ่มสถานะใหม่ เช่น PAYROLL_LOCKED หรือ ARCHIVED ให้มาแก้ที่ไฟล์นี้ก่อน
 */
export function isFinalPayrollRunStatus(status: PayrollRunStatus) {
  return ['APPROVED', 'PAID', 'CANCELLED'].includes(status);
}

/**
 * สถานะที่ไม่ควรให้ calculate ใหม่ เพราะผ่านขั้น review/approve/payment แล้ว
 */
export function isLockedForCalculation(status: PayrollRunStatus) {
  return ['REVIEWED', 'APPROVED', 'PAID', 'CANCELLED'].includes(status);
}
