import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProbationStatus } from '../../../generated/prisma/client';

export class ProbationEvaluationScoreItemDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number;

  @IsOptional()
  @IsString()
  textValue?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** แบบประเมินที่ใช้ตอนรีวิวทดลองงาน (ไม่บังคับ) */
export class ProbationEvaluationDto {
  @IsString()
  formId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbationEvaluationScoreItemDto)
  scoreItems!: ProbationEvaluationScoreItemDto[];
}

export class ProbationActionDto {
  @IsEnum(ProbationStatus)
  status!: ProbationStatus;

  /**
   * วันที่บันทึกผลจริง ไม่ใส่ = วันนี้
   *
   * ต้องใส่ตอนย้ายข้อมูลพนักงานเดิมเข้าระบบ เพราะค่านี้ถูกใช้เป็น "วันบรรจุ"
   * ของพนักงาน ถ้าปล่อยเป็นวันนี้ พนักงานที่ทำงานมาหลายปีจะถูกนับอายุงานใหม่
   * ตั้งแต่วันที่กดผ่าน ทำให้โควตาลาพักร้อน/ลาป่วยถูกเฉลี่ยผิด
   */
  @IsOptional()
  @IsDateString()
  reviewedAt?: string;

  @IsOptional()
  @IsDateString()
  extendedUntil?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProbationEvaluationDto)
  evaluation?: ProbationEvaluationDto;
}
