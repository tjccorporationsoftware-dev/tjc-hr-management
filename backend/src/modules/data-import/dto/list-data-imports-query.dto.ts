import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  DataImportStatus,
  DataImportType,
} from '../../../generated/prisma/client';

export class ListDataImportsQueryDto {
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
  @IsEnum(DataImportType)
  type?: DataImportType;

  @IsOptional()
  @IsEnum(DataImportStatus)
  status?: DataImportStatus;
}
