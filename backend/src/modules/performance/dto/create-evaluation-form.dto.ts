import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EvaluationFormStatus,
  EvaluationPeriodType,
  EvaluationQuestionType,
} from '../../../generated/prisma/client';

export class CreateEvaluationQuestionDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EvaluationQuestionType)
  type?: EvaluationQuestionType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class CreateEvaluationFormDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EvaluationPeriodType)
  periodType?: EvaluationPeriodType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passScore?: number;

  @IsOptional()
  @IsEnum(EvaluationFormStatus)
  status?: EvaluationFormStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateEvaluationQuestionDto)
  questions!: CreateEvaluationQuestionDto[];
}