
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ResignationStatus } from '../../../generated/prisma/client';

export class UpdateEmployeeResignationDto {
  @IsOptional()
  @IsDateString()
  resignationDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsEnum(ResignationStatus)
  status?: ResignationStatus;
}