import { IsOptional, IsString } from 'class-validator';

export class ReportJobActionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}