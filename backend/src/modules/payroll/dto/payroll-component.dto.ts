import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  MasterStatus,
  PayrollLineSourceType,
  PayrollLineType,
} from "../../../generated/prisma/client";

export class CreatePayrollComponentDto {
  @IsString()
  companyId!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(255)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PayrollLineType)
  type!: PayrollLineType;

  @IsOptional()
  @IsEnum(PayrollLineSourceType)
  sourceType?: PayrollLineSourceType;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSocialSecurityBase?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdatePayrollComponentDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameTh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PayrollLineType)
  type?: PayrollLineType;

  @IsOptional()
  @IsEnum(PayrollLineSourceType)
  sourceType?: PayrollLineSourceType;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSocialSecurityBase?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}