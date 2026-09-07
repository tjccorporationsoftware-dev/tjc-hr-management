import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateVisaCertificateRequestDto {
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
  embassyName?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  travelDateFrom?: string | null;

  @IsOptional()
  @IsString()
  travelDateTo?: string | null;

  @IsOptional()
  @IsString()
  language?: 'TH' | 'EN' | 'TH_EN';

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}