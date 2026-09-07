
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EmployeeDocumentStatus,
  EmployeeDocumentType,
} from '../../../generated/prisma/client';

export class CreateEmployeeDocumentDto {
  @IsEnum(EmployeeDocumentType)
  type!: EmployeeDocumentType;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  storageProvider?: string;

  @IsString()
  @MaxLength(500)
  storageKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bucketName?: string;

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