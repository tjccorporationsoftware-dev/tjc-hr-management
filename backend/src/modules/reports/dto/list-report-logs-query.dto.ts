import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ReportCode, ReportLogAction } from '../../../generated/prisma/client';

export class ListReportLogsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  reportJobId?: string;

  @IsOptional()
  @IsString()
  exportFileId?: string;

  @IsOptional()
  @IsEnum(ReportCode)
  reportCode?: ReportCode;

  @IsOptional()
  @IsEnum(ReportLogAction)
  action?: ReportLogAction;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}