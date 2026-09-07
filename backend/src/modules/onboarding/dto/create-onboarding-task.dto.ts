import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateOnboardingTaskDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  checklistId?: string;

  @IsOptional()
  @IsString()
  checklistItemId?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}