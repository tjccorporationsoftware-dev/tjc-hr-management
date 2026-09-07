import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, Matches } from 'class-validator';
import { normalizeEmail } from '../utils/email.util';

/**
 * ช่องอีเมลทุกช่องในระบบใช้ตัวนี้แทน @IsEmail() เปล่าๆ
 *
 * ทำสองอย่างที่ @IsEmail() ไม่ทำให้:
 *   1. ตัดช่องว่างหัวท้าย + แปลงเป็นพิมพ์เล็ก ตั้งแต่ก่อนตรวจ
 *      อีเมลที่บันทึกลงฐานข้อมูลกับที่ใช้ค้นตอนล็อกอินจึงเป็นรูปแบบเดียวกันเสมอ
 *   2. ปิด allow_utf8_local_part ที่ class-validator เปิดไว้เป็นค่าเริ่มต้น
 *      กันอักษรไทยที่ติดมาจากแป้นพิมพ์ (เช่น `๋j@gmail.com`)
 *
 * ใส่ @IsOptional() เพิ่มเองที่ช่องที่ไม่บังคับกรอก
 */
export function EmailField(message = 'รูปแบบอีเมลไม่ถูกต้อง') {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeEmail(value) : value,
    ),
    IsEmail({ allow_utf8_local_part: false }, { message }),
    /*
     * ตาข่ายชั้นสอง — กันอักขระนอก ASCII ทั้งอีเมล ไม่ใช่แค่ส่วนหน้า @
     * เผื่อ validator รุ่นใหม่เปลี่ยนพฤติกรรมของ allow_utf8_local_part
     */
    Matches(/^[\x20-\x7E]+$/, {
      message:
        'อีเมลต้องเป็นตัวอักษรภาษาอังกฤษเท่านั้น (ตรวจว่าแป้นพิมพ์เป็นภาษาไทยอยู่หรือไม่)',
    }),
  );
}
