import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export type AttendancePunchType = 'MORNING_IN' | 'AFTERNOON_IN' | 'CHECK_OUT' | 'OFFSITE_IN' | 'OFFSITE_OUT' | 'CUSTOM';
export type AttendancePunchSource = 'WEB' | 'MOBILE_APP' | 'SCANNER';

export class PunchAttendanceDto {
  @IsOptional()
  @IsIn(['MORNING_IN', 'AFTERNOON_IN', 'CHECK_OUT', 'OFFSITE_IN', 'OFFSITE_OUT', 'CUSTOM'])
  punchType?: AttendancePunchType;

  @IsOptional()
  @IsIn(['WEB', 'MOBILE_APP', 'SCANNER'])
  source?: AttendancePunchSource;

  @IsOptional()
  @IsString()
  punchedAt?: string;

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
  offsiteRequestId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}


export class PunchContextQueryDto {
  @IsOptional()
  @IsString()
  punchedAt?: string;

  @IsOptional()
  @IsIn(['MORNING_IN', 'AFTERNOON_IN', 'CHECK_OUT', 'OFFSITE_IN', 'OFFSITE_OUT', 'CUSTOM'])
  punchType?: AttendancePunchType;
}
