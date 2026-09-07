import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListLeaveRequestsQueryDto {
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
  @IsString()
  leaveTypeId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  excludeDraft?: 'true' | 'false' | '1' | '0';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  isRetroactive?: 'true' | 'false' | '1' | '0';

  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  requiresPayrollCorrection?: 'true' | 'false' | '1' | '0';

  @IsOptional()
  @IsIn(['HAS_ATTACHMENT', 'NO_ATTACHMENT', 'MISSING_REQUIRED'])
  attachmentStatus?: 'HAS_ATTACHMENT' | 'NO_ATTACHMENT' | 'MISSING_REQUIRED';

  @IsOptional()
  @IsIn(['AFFECTS_PAYROLL'])
  payrollImpact?: 'AFFECTS_PAYROLL';

  @IsOptional()
  @IsIn(['AFFECTS_ATTENDANCE'])
  attendanceImpact?: 'AFFECTS_ATTENDANCE';
}