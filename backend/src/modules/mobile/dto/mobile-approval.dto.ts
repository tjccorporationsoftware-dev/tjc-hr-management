import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MOBILE_APPROVAL_TYPE_SLUGS = [
  'leave',
  'offsite',
  'overtime',
  'time-adjust',
] as const;

const MOBILE_APPROVAL_STATUSES = [
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'RETURNED',
] as const;

export class MobileApprovalListQueryDto {
  @IsOptional()
  @IsIn(MOBILE_APPROVAL_TYPE_SLUGS)
  type?: (typeof MOBILE_APPROVAL_TYPE_SLUGS)[number];

  @IsOptional()
  @IsIn(MOBILE_APPROVAL_STATUSES)
  status?: (typeof MOBILE_APPROVAL_STATUSES)[number];

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
