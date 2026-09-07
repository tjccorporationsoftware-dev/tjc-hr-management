import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EvaluationScoreItemDto } from './create-evaluation-result.dto';

export class UpdateEvaluationResultDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  formId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  evaluatorUserId?: string | null;

  @IsOptional()
  @IsString()
  periodName?: string | null;

  @IsOptional()
  @IsDateString()
  evaluationDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreItemDto)
  scoreItems?: EvaluationScoreItemDto[];

  @IsOptional()
  @IsString()
  summary?: string | null;

  @IsOptional()
  @IsString()
  recommendation?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}