import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** ตัวกรองของ "ความคืบหน้าพนักงานใหม่" — มองเป็นรายคน ไม่ใช่รายงาน/รายเอกสาร */
export class ListOnboardingProgressQueryDto {
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
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  /**
   * กรองตามขั้นที่ค้างอยู่ — ใช้ตอบว่า "ตอนนี้ใครติดอยู่ขั้นไหน"
   * TASKS = งานต้อนรับยังไม่ครบ · DOCUMENTS = เอกสารยังไม่ครบ
   * PROBATION = เหลือแค่รอผลทดลองงาน · DONE = จบกระบวนการแล้ว
   */
  @IsOptional()
  @IsIn(['ALL', 'TASKS', 'DOCUMENTS', 'PROBATION', 'DONE'])
  stage?: 'ALL' | 'TASKS' | 'DOCUMENTS' | 'PROBATION' | 'DONE';
}
