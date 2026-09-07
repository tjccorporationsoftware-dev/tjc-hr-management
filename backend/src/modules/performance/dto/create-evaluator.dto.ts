import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MasterStatus } from '../../../generated/prisma/client';

export class CreateEvaluatorDto {
  @IsString()
  formId!: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  evaluatorUserId?: string;

  @IsOptional()
  @IsString()
  evaluatorEmployeeId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}