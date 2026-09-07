import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  AttendanceDeviceType,
  MasterStatus,
} from '../../../generated/prisma/client';

export class UpdateAttendanceDeviceDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AttendanceDeviceType)
  type?: AttendanceDeviceType;

  @IsOptional()
  @IsString()
  serialNo?: string | null;

  @IsOptional()
  @IsString()
  ipAddress?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  // ข้อมูลเชื่อมต่อของเครื่องสแกน (ลายนิ้วมือ/ใบหน้า)
  @IsOptional()
  @IsString()
  brand?: string | null;

  @IsOptional()
  @IsString()
  model?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number | null;

  @IsOptional()
  @IsString()
  commKey?: string | null;

  @IsOptional()
  @IsString()
  firmwareVersion?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}