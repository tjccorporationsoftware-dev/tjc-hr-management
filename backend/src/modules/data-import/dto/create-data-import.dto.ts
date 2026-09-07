import { IsEnum, IsOptional } from 'class-validator';

import {
  DataImportDuplicateMode,
  DataImportType,
} from '../../../generated/prisma/client';

export class CreateDataImportDto {
  @IsEnum(DataImportType)
  type!: DataImportType;

  @IsOptional()
  @IsEnum(DataImportDuplicateMode)
  duplicateMode?: DataImportDuplicateMode;
}
