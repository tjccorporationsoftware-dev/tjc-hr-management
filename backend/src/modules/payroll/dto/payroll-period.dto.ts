import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PayrollPeriodStatus } from "../../../generated/prisma/client";

export class CreatePayrollPeriodDto {
  @IsString()
  companyId!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsDateString()
  paymentDate!: string;

  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}

export class UpdatePayrollPeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}