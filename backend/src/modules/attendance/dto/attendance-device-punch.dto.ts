import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { AttendanceLogType } from '../../../generated/prisma/client';

/** หนึ่งรายการสแกนที่เครื่องส่งเข้ามา */
export class AttendanceDevicePunchItemDto {
  /** รหัสผู้ใช้ในเครื่อง ใช้หาว่าเป็นพนักงานคนไหนผ่านตารางผูกพนักงาน */
  @IsString()
  deviceUserId!: string;

  /** เวลาที่สแกน (ISO 8601) */
  @IsISO8601()
  punchedAt!: string;

  /**
   * ถ้าเครื่องระบุมาว่าเข้าหรือออก ให้ใช้ค่านั้น
   * ถ้าไม่ระบุ ระบบจะสลับเข้า/ออกให้เองตามรายการล่าสุดของวันนั้น
   */
  @IsOptional()
  @IsEnum(AttendanceLogType)
  logType?: AttendanceLogType;

  /**
   * เลขรายการในเครื่อง ใช้กันบันทึกซ้ำเวลาดึงข้อมูลรอบเดิมอีกครั้ง
   * แนะนำให้ส่งมาทุกครั้งที่เครื่องรองรับ
   */
  @IsOptional()
  @IsString()
  rawRecordId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AttendanceDevicePunchBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceDevicePunchItemDto)
  punches!: AttendanceDevicePunchItemDto[];
}
