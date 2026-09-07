import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListTimeAdjustRequestsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  excludeDraft?: 'true' | 'false' | '1' | '0';

  @IsOptional()
  @IsString()
  adjustType?: string;

  @IsOptional()
  @IsIn(['CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END'])
  targetLogType?: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['HAS_ATTACHMENT', 'NO_ATTACHMENT'])
  attachmentStatus?: 'HAS_ATTACHMENT' | 'NO_ATTACHMENT';
}
