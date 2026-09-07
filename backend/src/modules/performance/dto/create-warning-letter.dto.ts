import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { WarningSeverity } from '../../../generated/prisma/client';

export class CreateWarningLetterDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  letterNo?: string;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsEnum(WarningSeverity)
  severity?: WarningSeverity;

  @IsOptional()
  @IsDateString()
  incidentDate?: string;

  @IsOptional()
  @IsDateString()
  issuedDate?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  correctiveAction?: string;

  @IsOptional()
  @IsString()
  employeeResponse?: string;

  @IsOptional()
  @IsString()
  note?: string;
}