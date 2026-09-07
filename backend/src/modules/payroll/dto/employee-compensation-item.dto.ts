import { Transform } from 'class-transformer';
import { EmployeeStatus } from '../../../generated/prisma/client';
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
 * Employee Compensation Item DTO
 * ------------------------------
 * ใช้สำหรับตั้งค่ารายรับ/รายหักประจำของพนักงาน
 * เช่น ค่าเดินทางประจำ, ค่าโทรศัพท์ประจำ, ค่าตำแหน่ง, หักประจำ ฯลฯ
 */
export class EmployeeCompensationItemQueryDto {
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
  componentId?: string;

  @IsOptional()
  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'INFO'])
  type?: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION' | 'INFO';

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateEmployeeCompensationItemDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @IsString()
  compensationId?: string | null;

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

  @IsString()
  @IsNotEmpty()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsOptional()
  isTaxable?: boolean;

  @IsOptional()
  isSocialSecurityBase?: boolean;

  /**
   * คิดตามสัดส่วนวันที่เป็นพนักงานจริงในงวดหรือไม่
   * ไม่ส่งมา = true (หารตามวัน) ซึ่งเป็นพฤติกรรมที่ถูกของรายการประจำส่วนใหญ่
   */
  @IsOptional()
  @IsBoolean()
  prorateByEmploymentDays?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateEmployeeCompensationItemDto {
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
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsOptional()
  isTaxable?: boolean;

  @IsOptional()
  isSocialSecurityBase?: boolean;

  /**
   * คิดตามสัดส่วนวันที่เป็นพนักงานจริงในงวดหรือไม่
   * ไม่ส่งมา = true (หารตามวัน) ซึ่งเป็นพฤติกรรมที่ถูกของรายการประจำส่วนใหญ่
   */
  @IsOptional()
  @IsBoolean()
  prorateByEmploymentDays?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  note?: string | null;
}
