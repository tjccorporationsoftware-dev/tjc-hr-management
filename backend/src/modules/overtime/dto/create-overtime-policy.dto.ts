import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOvertimePolicyDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  employeeTypeId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(['WORKDAY', 'HOLIDAY', 'SPECIAL_HOLIDAY'])
  workType?: 'WORKDAY' | 'HOLIDAY' | 'SPECIAL_HOLIDAY';

  @IsNumber()
  @Min(0)
  @Max(10)
  rateMultiplier!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  minMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  maxHoursPerDay?: number | null;

  @IsOptional()
  @IsIn(['IMMEDIATE', 'AFTER_MIN_MINUTES'])
  calcStartMode?: 'IMMEDIATE' | 'AFTER_MIN_MINUTES';

  @IsOptional()
  @IsIn(['NONE', 'HALF_HOUR_DOWN', 'HALF_HOUR_UP', 'HOUR_DOWN', 'HOUR_UP'])
  hourRoundingMode?:
    | 'NONE'
    | 'HALF_HOUR_DOWN'
    | 'HALF_HOUR_UP'
    | 'HOUR_DOWN'
    | 'HOUR_UP';

  @IsOptional()
  @IsIn(['NONE', 'ROUND_DOWN', 'ROUND_UP', 'ROUND_NEAREST'])
  amountRoundingMode?: 'NONE' | 'ROUND_DOWN' | 'ROUND_UP' | 'ROUND_NEAREST';

  @IsOptional()
  @IsBoolean()
  includeInTax?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInSocialSecurity?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
