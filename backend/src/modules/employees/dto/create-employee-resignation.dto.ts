
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEmployeeResignationDto {
  @IsDateString()
  resignationDate!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  documentId?: string;
}