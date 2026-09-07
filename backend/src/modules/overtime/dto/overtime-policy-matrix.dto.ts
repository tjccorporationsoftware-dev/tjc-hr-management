import { Type } from 'class-transformer';
import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';

const WORK_TYPES = ['WORKDAY', 'HOLIDAY', 'SPECIAL_HOLIDAY'] as const;
const CALC_START_MODES = ['IMMEDIATE', 'AFTER_MIN_MINUTES'] as const;
const HOUR_ROUNDING_MODES = [
  'NONE',
  'HALF_HOUR_DOWN',
  'HALF_HOUR_UP',
  'HOUR_DOWN',
  'HOUR_UP',
] as const;
const AMOUNT_ROUNDING_MODES = [
  'NONE',
  'ROUND_DOWN',
  'ROUND_UP',
  'ROUND_NEAREST',
] as const;

export type OvertimeWorkTypeValue = (typeof WORK_TYPES)[number];

export class GetOvertimeMatrixQueryDto {
  /** GLOBAL scope เท่านั้นที่เลือกบริษัทเองได้ */
  @IsOptional()
  @IsString()
  companyId?: string;

  /** ว่าง = ค่ามาตรฐานของบริษัท */
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsIn(WORK_TYPES)
  workType!: OvertimeWorkTypeValue;
}

/** นโยบาย OT ของประเภทพนักงาน 1 แถวในตาราง */
export class OvertimePolicyMatrixRowDto {
  @IsString()
  @IsNotEmpty()
  employeeTypeId!: string;

  /** false = ประเภทพนักงานนี้ไม่ได้ใช้ OT ประเภทวันนี้ */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

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
  @IsIn(CALC_START_MODES)
  calcStartMode?: (typeof CALC_START_MODES)[number];

  @IsOptional()
  @IsIn(HOUR_ROUNDING_MODES)
  hourRoundingMode?: (typeof HOUR_ROUNDING_MODES)[number];

  @IsOptional()
  @IsIn(AMOUNT_ROUNDING_MODES)
  amountRoundingMode?: (typeof AMOUNT_ROUNDING_MODES)[number];

  @IsOptional()
  @IsBoolean()
  includeInTax?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInSocialSecurity?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;
}

export class SaveOvertimeMatrixDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  /** ขอบเขตสาขา : null = ค่ามาตรฐานของบริษัท */
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsIn(WORK_TYPES)
  workType!: OvertimeWorkTypeValue;

  /** ชื่อ/คำอธิบายใช้ร่วมกันทุกแถวของประเภทวันนี้ */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameTh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OvertimePolicyMatrixRowDto)
  rows!: OvertimePolicyMatrixRowDto[];
}

/** เปิด/ปิดประเภทวัน OT ทั้งชุดจากรายการด้านซ้าย */
export class SetOvertimeMatrixStatusDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsIn(WORK_TYPES)
  workType!: OvertimeWorkTypeValue;

  @IsBoolean()
  enabled!: boolean;
}
