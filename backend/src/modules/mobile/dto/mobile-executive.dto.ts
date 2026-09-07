import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ExportFileFormat,
  ReportCode,
} from '../../../generated/prisma/client';

/**
 * ตัวกรองของห้องผู้บริหารบนมือถือ
 *
 * ทุกตัวเป็น **ตัวกรองในขอบเขตที่ผู้ใช้มีอยู่แล้ว** ไม่ใช่ตัวขยายสิทธิ์ —
 * `companyId` ที่ส่งมาไม่ได้ทำให้เห็นบริษัทที่ token ไม่ครอบคลุม เพราะ service
 * เดิมรวม scope ของ token เข้ากับ filter เสมอ ที่นี่จึงตรวจแค่รูปแบบข้อมูล
 */
export class MobileExecutiveFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  divisionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  /** คำค้นชื่อหรือรหัสพนักงาน ใช้ตอน drill-down ไปหารายชื่อ */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/**
 * แนวโน้มการเข้างานย้อนหลัง
 *
 * `days` จำกัดช่วง 7–60 ที่ฝั่ง service อยู่แล้ว ตรงนี้แค่กันค่าที่ไม่ใช่ตัวเลข
 */
export class MobileExecutiveAttendanceTrendQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,3}$/, { message: 'days ต้องเป็นตัวเลข' })
  days?: string;
}

export class MobileExecutiveAttendanceQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  departmentId?: string;

  /** PRESENT / LATE / LEAVE / ABSENT ตามที่ DashboardService รองรับ */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  /**
   * วันที่ต้องการดู รูปแบบ YYYY-MM-DD — ไม่ส่งมาคือวันนี้
   *
   * จอ "ลา/โอที รายวัน" ของผู้บริหารเลื่อนดูย้อนหลังได้ จอเดิมที่ดูแค่วันนี้
   * ไม่ส่งค่านี้มาก็ยังทำงานเหมือนเดิมทุกประการ
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  date?: string;
}

/**
 * ช่วงงวดที่ต้องการดูลา/โอทีสะสม
 *
 * แอปเป็นคนบอกขอบเขตงวดมา ไม่ใช่ backend เดาเอง เพราะวันตัดงวดของแต่ละบริษัท
 * ไม่เท่ากันและแอปรู้อยู่แล้วจากรอบเงินเดือนของผู้ใช้ (ดู useAttendanceHistory)
 */
export class MobileExecutivePeriodQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  from!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  departmentId?: string;
}

export class MobileExecutivePayrollQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;
}

export class MobileCreateExecutiveReportDto {
  @IsEnum(ReportCode)
  reportCode!: ReportCode;

  @IsOptional()
  @IsEnum(ExportFileFormat)
  format?: ExportFileFormat;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;

  /**
   * พารามิเตอร์เฉพาะของรายงานแต่ละชนิด เช่น ช่วงวันที่หรือรอบเงินเดือน
   *
   * ปล่อยเป็น object อิสระเหมือนฝั่งเว็บโดยตั้งใจ — ReportsService เป็นเจ้าของ
   * การตรวจว่าพารามิเตอร์ของรายงานนั้นถูกต้องไหม การประกาศ schema ซ้ำที่นี่
   * แปลว่าทุกครั้งที่รายงานเพิ่มพารามิเตอร์ แอปจะปฏิเสธของที่เว็บยอมรับ
   */
  @IsOptional()
  params?: Record<string, unknown>;
}
