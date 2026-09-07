import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateDocumentPdfDto {
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}