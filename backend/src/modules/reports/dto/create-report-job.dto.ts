import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ExportFileFormat, ReportCode } from '../../../generated/prisma/client';

export class CreateReportJobDto {
  @IsEnum(ReportCode)
  reportCode!: ReportCode;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ExportFileFormat)
  format?: ExportFileFormat;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}