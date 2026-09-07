import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

import {
  AttendanceChannel,
  AttendanceLogStatus,
  AttendanceLogType,
} from '../../../generated/prisma/client';

export class CreateManualAttendanceLogDto {
  @IsString()
  employeeId!: string;

  @IsEnum(AttendanceLogType)
  logType!: AttendanceLogType;

  @IsDateString()
  logTime!: string;

  @IsOptional()
  @IsEnum(AttendanceChannel)
  channel?: AttendanceChannel;

  @IsOptional()
  @IsEnum(AttendanceLogStatus)
  status?: AttendanceLogStatus;

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