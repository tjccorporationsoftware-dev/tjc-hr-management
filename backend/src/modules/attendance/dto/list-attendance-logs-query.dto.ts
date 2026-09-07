import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  AttendanceChannel,
  AttendanceLogStatus,
  AttendanceLogType,
} from '../../../generated/prisma/client';

export class ListAttendanceLogsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  // DTO เดียวใน 43 ตัวที่ไม่มี @Max — service clamp ที่ 100 ให้อยู่แล้วจึงไม่เคย
  // เป็นช่องโหว่ แต่ทำให้ client ที่ส่ง pageSize เกินได้ 200 กลับได้แค่ 100
  // โดยไม่มี error บอก ใส่ให้ตรงกับ DTO ตัวอื่นและกับ clamp ใน service
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(AttendanceLogType)
  logType?: AttendanceLogType;

  @IsOptional()
  @IsEnum(AttendanceChannel)
  channel?: AttendanceChannel;

  @IsOptional()
  @IsEnum(AttendanceLogStatus)
  status?: AttendanceLogStatus;
}