import { BadRequestException } from '@nestjs/common';

/**
 * Payroll money utilities
 *
 * รวม logic การ normalize ตัวเลขเงินเดือน/รายได้/รายการหัก
 * จุดสำคัญ: ทุกจำนวนเงินจะถูกปัดทศนิยม 2 ตำแหน่งเสมอ เพื่อให้ยอดรวม payroll ไม่แกว่ง
 */
export function toMoney(value: unknown) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  // ปัด 2 ตำแหน่งแบบกัน floating-point error
  // เช่น 1.005 ถูกเก็บเป็น 1.00499999999999989 → Math.round(x*100) จะได้ 100 (1.00) ทั้งที่ควรเป็น 1.01
  // บวก epsilon เล็ก ๆ ที่สเกลสตางค์ (ใหญ่กว่า error ของ double แต่เล็กกว่าสตางค์จริง) ก่อนปัด
  const epsilon = parsed >= 0 ? 1e-6 : -1e-6;
  return Math.round(parsed * 100 + epsilon) / 100;
}

export function toMoneyString(value: unknown) {
  return toMoney(value).toFixed(2);
}

/**
 * บวกจำนวนเงินหลายก้อนแล้วคืนค่าที่ปัด 2 ตำแหน่งแล้ว
 *
 * ต้องปัด "ผลลัพธ์" ด้วย ไม่ใช่ปัดแค่ตัวตั้งแต่ละตัว
 * ของเดิมคืน sum ดิบ ทำให้ addMoney(0.1, 0.2) ได้ 0.30000000000000004
 * ค่านั้นถูกส่งต่อไปเป็นเพดานกันเงินสุทธิติดลบ และถูกสะสมต่อในยอดรวม
 * ก่อนจะไปปัดทีเดียวตอนเขียนลงฐานข้อมูล ซึ่งกลบปัญหาไว้แต่ไม่ได้แก้
 */
export function addMoney(...values: unknown[]): number {
  const sum = values.reduce<number>((total, value) => {
    return total + toMoney(value);
  }, 0);

  return toMoney(sum);
}

/**
 * ใช้ normalize ค่าจำนวนเงินจาก DTO ก่อนบันทึกลงฐานข้อมูล
 * ถ้าค่าติดลบหรือไม่ใช่ตัวเลขจะ throw ทันที เพื่อกันยอด payroll เพี้ยน
 */
export function normalizeDecimal(
  value: string | number | undefined,
  fallback = '0',
) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestException('จำนวนเงินต้องเป็นตัวเลขและต้องไม่ติดลบ');
  }

  return parsed.toFixed(2);
}
