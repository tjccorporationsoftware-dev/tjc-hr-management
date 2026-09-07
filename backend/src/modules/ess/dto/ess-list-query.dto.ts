import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class EssListQueryDto {
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
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  leaveTypeId?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['WORKDAY', 'HOLIDAY', 'SPECIAL_HOLIDAY'])
  workType?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'WRONG_TIME', 'DEVICE_ERROR', 'OUTSIDE_WORK', 'OTHER'])
  adjustType?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END'])
  targetLogType?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  search?: string;

}