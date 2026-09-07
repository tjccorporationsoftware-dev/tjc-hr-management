import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { MaritalStatus } from '../../../generated/prisma/client';

/**
 * ข้อมูลที่พนักงานแก้เองได้จากหน้า "ข้อมูลของฉัน"
 * ----------------------------------------------
 * รับเฉพาะช่องที่เจ้าตัวเป็นคนรู้ดีที่สุดและแก้แล้วไม่กระทบเงิน/สิทธิ์:
 * ที่อยู่ · ผู้ติดต่อฉุกเฉิน · ข้อมูลส่วนตัวทั่วไป · การศึกษา
 *
 * ห้ามเพิ่ม HR master data (บริษัท/สาขา/แผนก/ตำแหน่ง/สถานะ/เงินเดือน)
 * และห้ามเพิ่มช่องที่ผูกกับเงินหรือการยืนยันตัวตน — เลขบัตรประชาชน
 * หนังสือเดินทาง วันเกิด เพศ เลขประกันสังคม เลขผู้เสียภาษี และบัญชีธนาคาร
 * ต้องให้ HR เป็นคนแก้เท่านั้น (ตัวเลขบัญชีคือช่องทางโกงเงินเดือนที่ง่ายที่สุด)
 *
 * DTO ตัวนี้ใช้ร่วมกับแอปมือถือ (MobileUpdateProfileDto) — สองทางแก้ได้เท่ากัน
 */
export class UpdateMyProfileDto {
  /* บัญชีผู้ใช้งาน */

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  /* ข้อมูลส่วนตัว */

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nationality?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  religion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lineId?: string | null;

  // ปล่อยค่าว่างให้ผ่านได้ เพราะ "ลบอีเมลส่วนตัวทิ้ง" คือการแก้ที่ถูกต้องแบบหนึ่ง
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ValidateIf((_object, value) => Boolean(value))
  @IsEmail({}, { message: 'รูปแบบอีเมลส่วนตัวไม่ถูกต้อง' })
  personalEmail?: string | null;

  /* ที่อยู่ */

  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  registeredAddress?: string | null;

  /* ผู้ติดต่อฉุกเฉิน */

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  emergencyContactRelation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  emergencyContactAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  emergencyContactRelation2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  emergencyContactAddress2?: string | null;

  /* การศึกษา */

  @IsOptional()
  @IsString()
  @MaxLength(120)
  educationLevel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  educationInstitute?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  educationMajor?: string | null;
}
