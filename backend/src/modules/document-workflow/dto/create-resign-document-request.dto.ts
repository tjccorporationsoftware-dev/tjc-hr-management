import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateResignDocumentRequestDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string | null;

  @IsString()
  effectiveDate!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  handoverNote?: string | null;

  @IsOptional()
  @IsString()
  assetReturnNote?: string | null;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}