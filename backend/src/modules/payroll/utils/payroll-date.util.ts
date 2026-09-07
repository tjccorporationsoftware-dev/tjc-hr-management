import { BadRequestException } from '@nestjs/common';

/**
 * Payroll date utilities
 *
 * รวม helper ด้านวันที่ของ Payroll ไว้ที่เดียว
 * เพื่อไม่ให้ payroll.service.ts มี utility function ปนกับ business logic มากเกินไป
 */
export function toDateOnly(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง');
  }

  return date;
}
