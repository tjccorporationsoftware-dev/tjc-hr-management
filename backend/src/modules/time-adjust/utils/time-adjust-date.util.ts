import { BadRequestException } from '@nestjs/common';
import { toThaiDateOnly } from '../../../common/utils/thai-date.util';

/*
 * parseTimeAdjustDateTime
 * ---------------------------------------------------------
 * แปลง string/Date เป็น Date กลางสำหรับโมดูลขอแก้เวลา
 * ถ้ารูปแบบวันที่ไม่ถูกต้อง จะ throw BadRequestException ทันที
 */
export function parseTimeAdjustDateTime(value: string | Date) {
  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('รูปแบบวันที่และเวลาไม่ถูกต้อง');
  }

  return date;
}

/*
 * toTimeAdjustDateOnlyFromDate
 * ---------------------------------------------------------
 * ใช้สร้าง workDate จาก requestedLogTime โดยตัดเวลาออก เหลือเฉพาะวัน
 * เก็บแบบ UTC date เพื่อให้รูปแบบสอดคล้องกับ attendance เดิม
 */
export function toTimeAdjustDateOnlyFromDate(value: Date) {
  // ตัดวันตามเวลาไทย ไม่ใช่เวลาเซิร์ฟเวอร์ — บน UTC จะคลาดไป 1 วันช่วง 00:00-07:00
  return toThaiDateOnly(value);
}
