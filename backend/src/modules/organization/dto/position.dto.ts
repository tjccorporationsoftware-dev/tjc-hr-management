import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { MasterStatus } from "../../../generated/prisma/client";

export class CreatePositionDto {
  /** ใช้เฉพาะ GLOBAL admin ระบุบริษัทปลายทาง; company admin จะถูกล็อกเป็นบริษัทตน */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * ระดับตำแหน่ง — **1 = สูงสุด** ไล่เลขมากขึ้นเมื่อตำแหน่งต่ำลง
   * เช่น กรรมการผู้จัดการ = 1, ผู้อำนวยการ = 2, ผู้จัดการ = 3, พนักงานปฏิบัติการ = 9
   *
   * ตั้งกลับด้านแล้วจะกระทบสายอนุมัติ เพราะขั้น "ผู้บริหาร" ใช้ค่านี้เป็นชั้นสำรอง
   * ตอนที่ยังไม่มีใครถูกผูกบทบาทผู้บริหาร (ดู approval-matrix-resolver.service.ts)
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  level?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameTh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** ระดับตำแหน่ง — 1 = สูงสุด (ดูคำอธิบายเต็มที่ CreatePositionDto) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  level?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MasterStatus, { message: "สถานะไม่ถูกต้อง" })
  status?: MasterStatus;
}