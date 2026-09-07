import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDocumentRequestDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string | null;

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