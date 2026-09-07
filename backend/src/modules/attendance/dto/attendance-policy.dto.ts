import {
  IsIn,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export type AttendancePolicyStatus = 'ACTIVE' | 'INACTIVE';
export type MissingPenaltyMode = 'PER_SESSION' | 'PER_DAY';

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ListAttendancePoliciesQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendancePolicyStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class EffectiveAttendancePolicyQueryDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsString()
  date?: string;
}

export class CreateAttendancePolicyDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'morningCheckInDeadline ต้องเป็นรูปแบบ HH:mm' })
  morningCheckInDeadline?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'afternoonCheckInDeadline ต้องเป็นรูปแบบ HH:mm' })
  afternoonCheckInDeadline?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'checkoutAllowedFrom ต้องเป็นรูปแบบ HH:mm' })
  checkoutAllowedFrom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  latePenaltyRatePerMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  missingLogPenaltyPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  lateGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  lateRoundingMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxLatePenaltyPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxMissingPenaltyPerDay?: number;

  @IsOptional()
  @IsIn(['PER_SESSION', 'PER_DAY'])
  missingPenaltyMode?: MissingPenaltyMode;

  @IsOptional()
  @IsBoolean()
  offsiteEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireOffsiteApproval?: boolean;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsString()
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendancePolicyStatus;
}

export class UpdateAttendancePolicyDto {
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  employeeTypeId?: string | null;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'morningCheckInDeadline ต้องเป็นรูปแบบ HH:mm' })
  morningCheckInDeadline?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'afternoonCheckInDeadline ต้องเป็นรูปแบบ HH:mm' })
  afternoonCheckInDeadline?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'checkoutAllowedFrom ต้องเป็นรูปแบบ HH:mm' })
  checkoutAllowedFrom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  latePenaltyRatePerMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  missingLogPenaltyPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  lateGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  lateRoundingMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxLatePenaltyPerDay?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxMissingPenaltyPerDay?: number | null;

  @IsOptional()
  @IsIn(['PER_SESSION', 'PER_DAY'])
  missingPenaltyMode?: MissingPenaltyMode;

  @IsOptional()
  @IsBoolean()
  offsiteEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireOffsiteApproval?: boolean;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendancePolicyStatus;
}
