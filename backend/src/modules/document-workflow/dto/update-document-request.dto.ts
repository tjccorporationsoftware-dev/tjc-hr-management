import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDocumentRequestDto {
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