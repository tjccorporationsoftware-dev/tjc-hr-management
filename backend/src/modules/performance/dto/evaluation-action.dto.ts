import { IsOptional, IsString } from 'class-validator';

export class EvaluationActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}