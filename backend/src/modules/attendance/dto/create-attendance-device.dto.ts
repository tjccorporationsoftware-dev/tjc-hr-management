import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  AttendanceDeviceType,
  MasterStatus,
} from '../../../generated/prisma/client';

export class CreateAttendanceDeviceDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(AttendanceDeviceType)
  type?: AttendanceDeviceType;

  @IsOptional()
  @IsString()
  serialNo?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // ข้อมูลเชื่อมต่อของเครื่องสแกน (ลายนิ้วมือ/ใบหน้า)
  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  commKey?: string;

  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}