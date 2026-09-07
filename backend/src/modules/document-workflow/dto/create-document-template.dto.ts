import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDocumentTemplateDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  documentTypeId?: string | null;

  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  htmlContent?: string | null;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}