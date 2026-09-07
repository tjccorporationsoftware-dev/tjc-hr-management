import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MasterStatus } from '../../../generated/prisma/client';

export class ListOnboardingChecklistsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}