import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DEDUCTION_PLAN_TYPES = [
  'STUDENT_LOAN',
  'EMPLOYEE_LOAN',
  'COOPERATIVE',
  'OTHER',
  'WORK_GUARANTEE',
  'DAMAGE_PAYMENT',
] as const;

export const DEDUCTION_PLAN_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'SUSPENDED',
  'CANCELLED',
] as const;

export type DeductionPlanType = (typeof DEDUCTION_PLAN_TYPES)[number];
export type DeductionPlanStatus = (typeof DEDUCTION_PLAN_STATUSES)[number];

export class EmployeeDeductionPlanQueryDto {
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

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsIn(DEDUCTION_PLAN_TYPES)
  planType?: DeductionPlanType;

  @IsOptional()
  @IsIn(DEDUCTION_PLAN_STATUSES)
  status?: DeductionPlanStatus;

  /** ค้นหาจากชื่อ รหัส หรือเลขที่สัญญา */
  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateEmployeeDeductionPlanDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsIn(DEDUCTION_PLAN_TYPES)
  planType!: DeductionPlanType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /** เลขที่สัญญา / เลขที่ผู้กู้ ใช้อ้างอิงตอนนำส่ง */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNo?: string | null;

  /** ยอดหนี้ทั้งหมด — เว้นว่าง = หักไปเรื่อย ๆ จนกว่าจะสั่งหยุด */
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number | null;

  @IsNumber()
  @Min(0.01)
  installmentAmount!: number;

  /** ยอดที่หักไปแล้วก่อนเข้าระบบ (ยกยอดมาจากระบบเดิม) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsISO8601()
  startDate!: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string | null;

  /** ลำดับการหักเมื่อเงินไม่พอ เลขน้อยหักก่อน (กยศ. ควรต่ำสุด) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  allowPartialDeduction?: boolean;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateEmployeeDeductionPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNo?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  installmentAmount?: number;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  allowPartialDeduction?: boolean;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class EmployeeDeductionPlanActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
