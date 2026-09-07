import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { MasterStatus } from '../../../generated/prisma/client';

/**
 * ผูกพนักงานกับรหัสผู้ใช้ในเครื่องสแกน
 * เครื่องส่งมาแค่ deviceUserId ต้องมีตัวนี้ถึงจะรู้ว่าเป็นพนักงานคนไหน
 */
export class CreateAttendanceDeviceEnrollmentDto {
  @IsString()
  employeeId!: string;

  @IsString()
  deviceUserId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  fingerCount?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  enrolledAt?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateAttendanceDeviceEnrollmentDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  deviceUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  fingerCount?: number | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsISO8601()
  enrolledAt?: string | null;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}
