import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateOnboardingDocumentDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsString()
  documentName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}