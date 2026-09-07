import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateOnboardingTaskDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  checklistId?: string | null;

  @IsOptional()
  @IsString()
  checklistItemId?: string | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}