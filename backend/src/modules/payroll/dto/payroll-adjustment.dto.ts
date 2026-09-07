import { Transform } from 'class-transformer';
import { EmployeeStatus } from '../../../generated/prisma/client';
import {
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
 * Payroll Adjustment DTO
 * ----------------------
 * ใช้สำหรับรายการเพิ่ม/หักเฉพาะงวด เช่น โบนัส, ค่าคอม, หักเงินยืม, หักค่าเสียหาย
 */
export class PayrollAdjustmentQueryDto {
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
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsIn(["ALL", ...Object.values(EmployeeStatus)])
  employeeStatus?: EmployeeStatus | "ALL";

  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'APPROVED', 'CANCELLED', 'IMPORTED'])
  status?: 'DRAFT' | 'APPROVED' | 'CANCELLED' | 'IMPORTED';

  @IsOptional()
  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'INFO'])
  type?: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION' | 'INFO';

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreatePayrollAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @IsString()
  periodId?: string | null;

  @IsOptional()
  @IsString()
  componentId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'INFO'])
  type!: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION' | 'INFO';

  @IsOptional()
  @IsIn([
    'MANUAL',
    'BASE_SALARY',
    'OVERTIME',
    'ATTENDANCE',
    'LEAVE',
    'SOCIAL_SECURITY',
    'TAX',
    'ALLOWANCE',
    'BONUS',
    'ADJUSTMENT',
    'IMPORT',
    'OTHER',
  ])
  sourceType?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  effectiveDate?: string | null;

  @IsOptional()
  isTaxable?: boolean;

  @IsOptional()
  isSocialSecurityBase?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdatePayrollAdjustmentDto {
  @IsOptional()
  @IsString()
  periodId?: string | null;

  @IsOptional()
  @IsString()
  componentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'INFO'])
  type?: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION' | 'INFO';

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  effectiveDate?: string | null;

  @IsOptional()
  isTaxable?: boolean;

  @IsOptional()
  isSocialSecurityBase?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class PayrollAdjustmentActionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
