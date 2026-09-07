import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { DisciplinaryHistoryType } from '../../../generated/prisma/client';

export class CreateDisciplinaryHistoryDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  warningLetterId?: string;

  @IsOptional()
  @IsEnum(DisciplinaryHistoryType)
  type?: DisciplinaryHistoryType;

  @IsDateString()
  eventDate!: string;

  @IsString()
  title!: string;

  @IsString()
  detail!: string;

  @IsOptional()
  @IsString()
  actionTaken?: string;

  @IsOptional()
  @IsString()
  note?: string;
}