import { IsOptional, IsString } from 'class-validator';

export class RenderDocumentTemplateQueryDto {
  @IsOptional()
  @IsString()
  templateId?: string;
}