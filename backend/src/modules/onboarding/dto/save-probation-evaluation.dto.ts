import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class ProbationEvaluationScoreItemDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  textValue?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * บันทึกผลประเมินทดลองงานอย่างเดียว ไม่ตัดสินผ่าน/ไม่ผ่าน
 * แยกจาก review เพราะการให้คะแนนกับการตัดสินเป็นคนละจังหวะ
 * และบางที่คนให้คะแนนกับคนตัดสินเป็นคนละคน
 */
export class SaveProbationEvaluationDto {
  @IsString()
  formId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbationEvaluationScoreItemDto)
  scoreItems!: ProbationEvaluationScoreItemDto[];

  @IsOptional()
  @IsString()
  summary?: string;

  /** ผู้ประเมิน (พนักงาน) — ไม่ระบุ = คนที่กำลังใช้งานระบบ */
  @IsOptional()
  @IsString()
  evaluatorEmployeeId?: string;
}
