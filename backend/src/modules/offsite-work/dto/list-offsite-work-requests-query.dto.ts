import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AttendanceLocationType, OffsiteRequestStatus } from '../../../generated/prisma/client';

export class ListOffsiteWorkRequestsQueryDto {
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
  @IsEnum(OffsiteRequestStatus)
  status?: OffsiteRequestStatus;

  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  excludeDraft?: 'true' | 'false' | '1' | '0';

  @IsOptional()
  @IsEnum(AttendanceLocationType)
  locationType?: AttendanceLocationType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['HAS_ATTACHMENT', 'NO_ATTACHMENT'])
  attachmentStatus?: 'HAS_ATTACHMENT' | 'NO_ATTACHMENT';
}
