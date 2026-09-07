import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvaluationScoreItemDto {
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

export class CreateEvaluationResultDto {
  @IsString()
  companyId!: string;

  @IsString()
  formId!: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  evaluatorUserId?: string;

  /** ผู้ประเมิน (พนักงาน) ที่บันทึกไว้กับใบนี้ */
  @IsOptional()
  @IsString()
  evaluatorEmployeeId?: string;

  @IsOptional()
  @IsString()
  periodName?: string;

  @IsDateString()
  evaluationDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreItemDto)
  scoreItems!: EvaluationScoreItemDto[];

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsOptional()
  @IsString()
  note?: string;
}