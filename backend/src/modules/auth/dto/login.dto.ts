import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EmailField } from '../../../common/decorators/email-field.decorator';

/**
 * เข้าระบบด้วย "รหัสพนักงาน + รหัสผ่าน" เป็นหลัก
 *
 * ยังรับ `email` ไว้ด้วยเพราะ (1) บัญชีผู้ดูแลระบบไม่มีรหัสพนักงาน
 * และ (2) แอปมือถือรุ่นเก่าที่ยังไม่ได้อัปเดตส่ง email มา — ห้ามทำให้เข้าไม่ได้
 * ส่งมาอย่างใดอย่างหนึ่งก็พอ ถ้ามาทั้งคู่ใช้ username ก่อน
 */
export class LoginDto {
  @ValidateIf((o: LoginDto) => !o.email)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสพนักงาน' })
  @MaxLength(254)
  // อนุญาตอีเมลในช่องเดียวกันด้วย — ผู้ดูแลระบบใช้ช่องนี้ใส่อีเมลได้เลย
  @Matches(/^[\x20-\x7E]*$/, {
    message:
      'รหัสพนักงานต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลข (ตรวจว่าแป้นพิมพ์เป็นภาษาไทยอยู่หรือไม่)',
  })
  // ไม่ส่งมาเลยให้เป็นค่าว่าง จะได้ติดแค่ "กรุณากรอกรหัสพนักงาน" ไม่ใช่ error ทุกข้อพร้อมกัน
  username?: string = '';

  @ValidateIf((o: LoginDto) => !o.username && typeof o.email === 'string')
  @EmailField('รูปแบบอีเมลไม่ถูกต้อง')
  email?: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  password!: string;
}
