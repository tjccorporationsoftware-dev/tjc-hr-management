import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO กลางสำหรับ action ของ HR Review
 * -----------------------------------
 * ใช้กับปุ่ม ตรวจสอบแล้ว / พร้อมเข้าเงินเดือน / พักไว้ก่อน / ส่งเข้า Payroll
 */
export class HrReviewActionDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsString()
  payrollRunId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
