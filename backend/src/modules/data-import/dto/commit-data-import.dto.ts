import { IsEnum, IsObject, IsOptional } from 'class-validator';

import { DataImportDuplicateMode } from '../../../generated/prisma/client';
import type { DataImportMapping } from '../datasets/data-import-dataset.types';

export class CommitDataImportDto {
  /**
   * { fieldKey: หมายเลขคอลัมน์ } ที่ผู้ใช้ยืนยันจากหน้าเว็บ
   *
   * ค่าที่ส่งมาถูกกรองด้วย normalizeMapping อีกชั้นเสมอ จึงตรวจแค่ว่าเป็นออบเจกต์
   * ไม่ต้องประกาศทุกฟิลด์ไว้ที่นี่ให้ซ้ำกับนิยามของแต่ละชุดข้อมูล
   */
  @IsOptional()
  @IsObject()
  mapping?: DataImportMapping;

  @IsOptional()
  @IsEnum(DataImportDuplicateMode)
  duplicateMode?: DataImportDuplicateMode;
}
