import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MasterStatus } from '../../../generated/prisma/client';

export class CreateOnboardingChecklistItemDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class CreateOnboardingChecklistDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOnboardingChecklistItemDto)
  items!: CreateOnboardingChecklistItemDto[];
}