import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { WarningSeverity } from '../../../generated/prisma/client';

export class UpdateWarningLetterDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  letterNo?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsEnum(WarningSeverity)
  severity?: WarningSeverity;

  @IsOptional()
  @IsDateString()
  incidentDate?: string | null;

  @IsOptional()
  @IsDateString()
  issuedDate?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  correctiveAction?: string | null;

  @IsOptional()
  @IsString()
  employeeResponse?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}