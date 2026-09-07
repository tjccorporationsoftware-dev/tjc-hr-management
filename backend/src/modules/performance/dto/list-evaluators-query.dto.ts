import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MasterStatus } from '../../../generated/prisma/client';

export class ListEvaluatorsQueryDto {
  @IsOptional()
  @IsString()
  formId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  evaluatorUserId?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}