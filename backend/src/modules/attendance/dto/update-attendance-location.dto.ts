import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  AttendanceLocationType,
  MasterStatus,
} from '../../../generated/prisma/client';

export class UpdateAttendanceLocationDto {
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  nameTh?: string;

  @IsOptional()
  @IsString()
  nameEn?: string | null;

  @IsOptional()
  @IsEnum(AttendanceLocationType)
  type?: AttendanceLocationType;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  radiusMeters?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}