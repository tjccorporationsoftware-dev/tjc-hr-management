import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateProbationRecordDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

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