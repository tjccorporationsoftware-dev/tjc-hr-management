import { Transform } from 'class-transformer';
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

/**
 * Attendance Payroll Rule DTO
 * ------------------------------------------------------------
 * ใช้สำหรับตั้งกติกาหักเงินจากข้อมูลลงเวลา เช่น
 * - มาสาย
 * - ออกก่อนเวลา
 * - ลืมลงเวลาเข้า
 * - ลืมลงเวลาออก
 * - ขาดงาน
 *
 * หมายเหตุ:
 * - Create DTO = ใช้ตอนสร้าง rule ใหม่ ต้องมี field สำคัญครบ
 * - Update DTO = ใช้ตอนแก้ไข ทุก field เป็น optional
 * - ห้ามให้ Update DTO extends Create DTO แล้วประกาศ field ซ้ำ
 *   เพราะจะเกิด TS2612 property overwrite
 */

export type AttendancePayrollRuleKind =
  | 'LATE'
  | 'EARLY_LEAVE'
  | 'MISSING_CHECK_IN'
  | 'MISSING_CHECK_OUT'
  | 'ABSENCE';

export type AttendancePayrollRuleUnit =
  | 'FIXED'
  | 'PER_OCCURRENCE'
  | 'PER_MINUTE'
  | 'PER_HOUR'
  | 'PER_DAY';

export type AttendancePayrollRuleStatus = 'ACTIVE' | 'INACTIVE';

export class AttendancePayrollRuleQueryDto {
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
  companyId?: string;

  @IsOptional()
  @IsIn([
    'LATE',
    'EARLY_LEAVE',
    'MISSING_CHECK_IN',
    'MISSING_CHECK_OUT',
    'ABSENCE',
  ])
  kind?: AttendancePayrollRuleKind;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendancePayrollRuleStatus;

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateAttendancePayrollRuleDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsIn([
    'LATE',
    'EARLY_LEAVE',
    'MISSING_CHECK_IN',
    'MISSING_CHECK_OUT',
    'ABSENCE',
  ])
  kind!: AttendancePayrollRuleKind;

  @IsOptional()
  @IsIn(['FIXED', 'PER_OCCURRENCE', 'PER_MINUTE', 'PER_HOUR', 'PER_DAY'])
  unit?: AttendancePayrollRuleUnit;

  @IsOptional()
  @IsString()
  componentId?: string | null;

  @IsOptional()
  @IsString()
  componentCode?: string | null;

  @IsOptional()
  @IsBoolean()
  useSalaryRate?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rateAmount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryDivisorDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryDivisorHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDeductionAmount?: number | null;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSocialSecurityBase?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendancePayrollRuleStatus;

  @IsOptional()
  @IsString()
  note?: string | null;
}

/**
 * Update DTO
 * ------------------------------------------------------------
 * ใช้ class แยก ไม่ extends CreateAttendancePayrollRuleDto
 * เพื่อแก้ error TS2612:
 * Property 'companyId' will overwrite the base property...
 */
export class UpdateAttendancePayrollRuleDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn([
    'LATE',
    'EARLY_LEAVE',
    'MISSING_CHECK_IN',
    'MISSING_CHECK_OUT',
    'ABSENCE',
  ])
  kind?: AttendancePayrollRuleKind;

  @IsOptional()
  @IsIn(['FIXED', 'PER_OCCURRENCE', 'PER_MINUTE', 'PER_HOUR', 'PER_DAY'])
  unit?: AttendancePayrollRuleUnit;

  @IsOptional()
  @IsString()
  componentId?: string | null;

  @IsOptional()
  @IsString()
  componentCode?: string | null;

  @IsOptional()
  @IsBoolean()
  useSalaryRate?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rateAmount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryDivisorDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryDivisorHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDeductionAmount?: number | null;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSocialSecurityBase?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendancePayrollRuleStatus;

  @IsOptional()
  @IsString()
  note?: string | null;
}