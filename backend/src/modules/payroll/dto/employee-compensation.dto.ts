import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  EmployeeStatus,
  MasterStatus,
  PayrollPaymentMethod,
  SalaryBasis,
} from "../../../generated/prisma/client";

export class EmployeeCompensationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

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
  status?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  pageSize?: number;
}

export class CreateEmployeeCompensationDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsString()
  baseSalary!: string;

  /**
   * ฐานของ baseSalary — รายเดือน / รายวัน / รายชั่วโมง
   * ไม่ส่งมา = MONTHLY ตามพฤติกรรมเดิม
   */
  @IsOptional()
  @IsEnum(SalaryBasis)
  salaryBasis?: SalaryBasis;

  @IsOptional()
  @IsEnum(PayrollPaymentMethod)
  paymentMethod?: PayrollPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankAccountName?: string;

  @IsOptional()
  @IsBoolean()
  socialSecurityEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateEmployeeCompensationDto {
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  baseSalary?: string;

  @IsOptional()
  @IsEnum(SalaryBasis)
  salaryBasis?: SalaryBasis;

  @IsOptional()
  @IsEnum(PayrollPaymentMethod)
  paymentMethod?: PayrollPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankAccountName?: string;

  @IsOptional()
  @IsBoolean()
  socialSecurityEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsString()
  note?: string;
}