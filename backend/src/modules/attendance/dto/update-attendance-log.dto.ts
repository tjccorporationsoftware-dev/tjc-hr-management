import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

import {
  AttendanceChannel,
  AttendanceLogStatus,
} from '../../../generated/prisma/client';

export class UpdateAttendanceLogDto {
  @IsOptional()
  @IsDateString()
  logTime?: string;

  @IsOptional()
  @IsEnum(AttendanceChannel)
  channel?: AttendanceChannel;

  @IsOptional()
  @IsEnum(AttendanceLogStatus)
  status?: AttendanceLogStatus;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  deviceId?: string | null;

  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @IsNumber()
  gpsAccuracy?: number | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsString()
  reason!: string;
}