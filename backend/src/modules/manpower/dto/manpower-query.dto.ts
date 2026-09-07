import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EmployeeStatus } from '../../../generated/prisma/client';

export class ManpowerQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  q?: string;
}