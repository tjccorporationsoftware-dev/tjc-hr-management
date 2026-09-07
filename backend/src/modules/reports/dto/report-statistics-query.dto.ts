import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportStatisticsQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  /** วันเริ่มช่วงที่นับ (YYYY-MM-DD) — ไม่ส่ง = ย้อนหลังตาม `days` */
  @IsOptional()
  @IsString()
  dateFrom?: string;

  /** วันสุดท้ายของช่วงที่นับ (YYYY-MM-DD) — ไม่ส่ง = วันนี้ */
  @IsOptional()
  @IsString()
  dateTo?: string;

  /** ใช้เมื่อไม่ได้ระบุช่วงวันเอง */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class ReportUserActivityQueryDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
