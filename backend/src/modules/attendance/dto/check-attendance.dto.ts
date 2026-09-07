import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

import { AttendanceChannel } from '../../../generated/prisma/client';

export class CheckAttendanceDto {
  @IsOptional()
  @IsEnum(AttendanceChannel)
  channel?: AttendanceChannel;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  gpsAccuracy?: number;

  @IsOptional()
  @IsString()
  note?: string;
}