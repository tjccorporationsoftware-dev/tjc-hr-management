import { BadRequestException } from '@nestjs/common';
import type { HrReviewSourceType } from '../types/hr-review.types';

/**
 * Helper ตรวจ type ของ source ที่มาจาก route param
 * ------------------------------------------------
 * ป้องกันไม่ให้ route เช่น /hr-review/xxx/:id ถูกใช้กับ source ที่ระบบไม่รู้จัก
 */
export function parseHrReviewSourceType(value: string): HrReviewSourceType {
  const upper = value.toUpperCase();

  if (upper === 'LEAVE' || upper === 'OVERTIME' || upper === 'TIME_ADJUST') {
    return upper;
  }

  throw new BadRequestException('ประเภทคำขอสำหรับ HR Review ไม่ถูกต้อง');
}

/**
 * แปลง source type เป็นข้อความไทยสำหรับข้อความ error/log
 */
export function hrReviewSourceTypeText(sourceType: HrReviewSourceType) {
  const map: Record<HrReviewSourceType, string> = {
    LEAVE: 'ใบลา',
    OVERTIME: 'OT',
    TIME_ADJUST: 'คำขอแก้เวลา',
  };

  return map[sourceType] ?? sourceType;
}
