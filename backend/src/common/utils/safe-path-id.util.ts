import { BadRequestException } from '@nestjs/common';

/**
 * ตรวจว่า id ที่จะเอาไปต่อเป็นชื่อโฟลเดอร์/ไฟล์ ปลอดภัยจริง
 *
 * ทำไมต้องมี:
 * multer สร้างโฟลเดอร์ปลายทาง "ก่อน" ที่ handler จะได้ทำงาน จึงตรวจสิทธิ์ไม่ทัน
 * ถ้าเอา `req.params.id` ดิบ ๆ ไป join เป็น path ผู้เรียกใส่ `..%2F..%2F` มาได้
 * (express ถอด URL-encode ให้แล้ว) แล้วเขียนไฟล์ออกนอกโฟลเดอร์ uploads
 *
 * id ในระบบนี้เป็น cuid/uuid ซึ่งมีแค่ตัวอักษร ตัวเลข และ `-` เท่านั้น
 * จึงปฏิเสธอย่างอื่นทั้งหมด รวมทั้ง `.` `/` `\` และสตริงว่าง
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function assertSafePathId(
  value: string | undefined | null,
  subject = 'รหัสอ้างอิง',
): string {
  if (!value || !SAFE_ID_PATTERN.test(value)) {
    throw new BadRequestException(`${subject}ไม่ถูกต้อง`);
  }

  return value;
}
