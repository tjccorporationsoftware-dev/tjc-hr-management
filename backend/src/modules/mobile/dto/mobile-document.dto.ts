import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MobileDocumentTypeListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class MobileDocumentListQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  documentTypeId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class MobileCreateDocumentRequestDto {
  @IsString()
  documentTypeId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  purpose?: string | null;

  @IsOptional()
  @IsObject()
  requestData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class MobileUpdateDocumentRequestDto {
  @IsOptional()
  @IsString()
  documentTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  purpose?: string | null;

  @IsOptional()
  @IsObject()
  requestData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class MobileDocumentActionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class MobileUploadDocumentFileDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
