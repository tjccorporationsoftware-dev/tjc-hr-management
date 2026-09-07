import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MasterStatus } from '../../../generated/prisma/client';
import { CreateOnboardingChecklistItemDto } from './create-onboarding-checklist.dto';

export class UpdateOnboardingChecklistDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOnboardingChecklistItemDto)
  items?: CreateOnboardingChecklistItemDto[];
}