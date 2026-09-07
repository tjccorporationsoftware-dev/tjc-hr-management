import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query ของจอทีมบนมือถือ
 *
 * แยกจาก ManagerQuery ของเว็บ (ที่เป็น `Record<string, string>` ดิบ ๆ) โดยตั้งใจ
 * — ฝั่งแอปต้องผ่าน validation ก่อนเสมอ ค่าที่ไม่รู้จักต้องถูกปฏิเสธตั้งแต่ขอบ
 * ไม่ใช่ไหลเข้าไปเป็น `as never` ในชั้น query
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const MOBILE_TEAM_REQUEST_TYPES = [
  'ALL',
  'LEAVE',
  'OVERTIME',
  'TIME_ADJUST',
  'OFFSITE',
] as const;

export class MobileTeamMonthQueryDto {
  /**
   * วันที่ของ "สถานะรายคน" ที่อยากดู — ไม่ส่งมาคือวันนี้
   *
   * ManagerService รองรับพารามิเตอร์นี้อยู่แล้ว (`query.date`) แต่ฝั่งมือถือ
   * ไม่เคยเปิดทางให้ส่ง จอทีมจึงดูได้แต่วันนี้ ทั้งที่หัวหน้าต้องย้อนดูว่า
   * เมื่อวานใครไม่มาบ่อยกว่าที่คิด
   *
   * `month` ยังคุมยอดสะสมรายเดือนเหมือนเดิม ส่งคู่กันได้
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date ต้องอยู่ในรูปแบบ YYYY-MM-DD',
  })
  date?: string;

  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM' })
  month?: string;
}

class MobileTeamPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class MobileTeamMembersQueryDto extends MobileTeamPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /**
   * สถานะพนักงาน เช่น ACTIVE / PROBATION
   *
   * ไม่ผูกกับ enum ของ Prisma ที่นี่ เพราะ service เดิมเป็นคนตรวจ และการ
   * ประกาศรายชื่อซ้ำแปลว่าต้องตามแก้สองที่ทุกครั้งที่ HR เพิ่มสถานะใหม่
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class MobileTeamAttendanceQueryDto extends MobileTeamPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class MobileTeamRequestsQueryDto extends MobileTeamPageQueryDto {
  @IsOptional()
  @IsIn(MOBILE_TEAM_REQUEST_TYPES)
  type?: (typeof MOBILE_TEAM_REQUEST_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
