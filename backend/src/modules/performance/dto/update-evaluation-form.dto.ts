import {
  ArrayMinSize,
  IsArray,
  IsEnum,
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
} from '../../../generated/prisma/client';
import { CreateEvaluationQuestionDto } from './create-evaluation-form.dto';

export class UpdateEvaluationFormDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(EvaluationPeriodType)
  periodType?: EvaluationPeriodType | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalScore?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passScore?: number | null;

  @IsOptional()
  @IsEnum(EvaluationFormStatus)
  status?: EvaluationFormStatus;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateEvaluationQuestionDto)
  questions?: CreateEvaluationQuestionDto[];
}