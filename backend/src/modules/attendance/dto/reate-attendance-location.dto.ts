import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

import {
  AttendanceLocationType,
  MasterStatus,
} from '../../../generated/prisma/client';

export class CreateAttendanceLocationDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsString()
  code!: string;

  @IsString()
  nameTh!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsEnum(AttendanceLocationType)
  type?: AttendanceLocationType;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  radiusMeters?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}