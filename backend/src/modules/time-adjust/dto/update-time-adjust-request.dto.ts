import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTimeAdjustRequestDto {
  @IsOptional()
  @IsString()
  originalAttendanceLogId?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([
    'MISSING_CHECK_IN',
    'MISSING_CHECK_OUT',
    'WRONG_TIME',
    'DEVICE_ERROR',
    'OUTSIDE_WORK',
    'OTHER',
  ])
  adjustType?: string;

  @IsOptional()
  @IsIn(['CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END'])
  targetLogType?: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';

  @IsOptional()
  @IsString()
  requestedLogTime?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string | null;
}