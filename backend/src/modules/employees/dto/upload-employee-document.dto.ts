import {
  EmployeeDocumentStatus,
  EmployeeDocumentType,
} from '../../../generated/prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UploadEmployeeDocumentDto {
  @IsEnum(EmployeeDocumentType)
  type!: EmployeeDocumentType;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  issuedDate?: string;

  @IsOptional()
  @IsDateString()
  expiredDate?: string;

  @IsOptional()
  @IsEnum(EmployeeDocumentStatus)
  status?: EmployeeDocumentStatus;
}