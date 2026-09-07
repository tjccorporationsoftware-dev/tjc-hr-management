import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTimeAdjustRequestDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  originalAttendanceLogId?: string | null;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'MISSING_CHECK_IN',
    'MISSING_CHECK_OUT',
    'WRONG_TIME',
    'DEVICE_ERROR',
    'OUTSIDE_WORK',
    'OTHER',
  ])
  adjustType!: string;

  @IsIn(['CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END'])
  targetLogType!: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';

  @IsString()
  @IsNotEmpty()
  requestedLogTime!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}