import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateSalaryCertificateRequestDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string | null;

  @IsOptional()
  @IsString()
  purpose?: string | null;

  @IsOptional()
  @IsString()
  issueTo?: string | null;

  @IsOptional()
  @IsString()
  language?: 'TH' | 'EN' | 'TH_EN';

  @IsOptional()
  @IsString()
  salaryDisplayMode?: 'MONTHLY_ONLY' | 'MONTHLY_AND_ALLOWANCE' | 'CUSTOM';

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}