import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDocumentTypeDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  approvalLevels?: number;

  @IsOptional()
  @IsBoolean()
  allowEmployeeRequest?: boolean;
}