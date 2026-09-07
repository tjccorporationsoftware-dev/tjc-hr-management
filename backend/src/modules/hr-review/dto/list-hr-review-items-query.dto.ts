import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query DTO สำหรับหน้า HR Review Center
 * -------------------------------------
 * ใช้ filter รายการที่ผ่าน approval แล้วและรอ HR ตรวจ/ส่ง Payroll
 */
export class ListHrReviewItemsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(['ALL', 'LEAVE', 'OVERTIME', 'TIME_ADJUST'])
  type?: 'ALL' | 'LEAVE' | 'OVERTIME' | 'TIME_ADJUST' = 'ALL';

  /**
   * สถานะของ HR Review
   * - WAITING_REVIEW = source อนุมัติแล้ว แต่ยังไม่มี record ใน HrReviewItem
   * - REVIEWED = HR ตรวจแล้ว
   * - PAYROLL_READY = พร้อมเข้าเงินเดือน
   * - ON_HOLD = พักไว้ก่อน ยังไม่ส่ง payroll
   * - SENT_TO_PAYROLL = ส่งเข้า payroll แล้ว/ล็อกแล้ว
   */
  @IsOptional()
  @IsIn([
    'ALL',
    'WAITING_REVIEW',
    'REVIEWED',
    'PAYROLL_READY',
    'ON_HOLD',
    'SENT_TO_PAYROLL',
    'CANCELLED',
  ])
  status?:
    | 'ALL'
    | 'WAITING_REVIEW'
    | 'REVIEWED'
    | 'PAYROLL_READY'
    | 'ON_HOLD'
    | 'SENT_TO_PAYROLL'
    | 'CANCELLED' = 'ALL';

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  /** ถ้าเลือก periodId ระบบจะใช้ช่วงวันที่ของ PayrollPeriod นั้นเป็นกรอบค้นหา */
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
