import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type AttendanceSessionRuleStatus = 'ACTIVE' | 'INACTIVE';
export type AttendanceSessionRuleCode =
  | 'MORNING_IN'
  | 'AFTERNOON_IN'
  | 'CHECK_OUT'
  | 'OFFSITE_IN'
  | 'OFFSITE_OUT'
  | 'CUSTOM';
export type AttendanceSessionRuleType = 'CHECK_IN' | 'CHECK_OUT';

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ListAttendanceSessionRulesQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendanceSessionRuleStatus;

  @IsOptional()
  @IsIn(['CHECK_IN', 'CHECK_OUT'])
  punchType?: AttendanceSessionRuleType;
}

export class CreateAttendanceSessionRuleDto {
  @IsIn([
    'MORNING_IN',
    'AFTERNOON_IN',
    'CHECK_OUT',
    'OFFSITE_IN',
    'OFFSITE_OUT',
    'CUSTOM',
  ])
  sessionCode!: AttendanceSessionRuleCode;

  @IsString()
  label!: string;

  @IsIn(['CHECK_IN', 'CHECK_OUT'])
  punchType!: AttendanceSessionRuleType;

  @Matches(TIME_HH_MM, { message: 'openTime ต้องเป็นรูปแบบ HH:mm' })
  openTime!: string;

  @Matches(TIME_HH_MM, { message: 'expectedTime ต้องเป็นรูปแบบ HH:mm' })
  expectedTime!: string;

  @Matches(TIME_HH_MM, { message: 'closeTime ต้องเป็นรูปแบบ HH:mm' })
  closeTime!: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'lateAfterTime ต้องเป็นรูปแบบ HH:mm' })
  lateAfterTime?: string | null;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'lateUntilTime ต้องเป็นรูปแบบ HH:mm' })
  lateUntilTime?: string | null;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'earlyBeforeTime ต้องเป็นรูปแบบ HH:mm' })
  earlyBeforeTime?: string | null;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'lateOutAfterTime ต้องเป็นรูปแบบ HH:mm' })
  lateOutAfterTime?: string | null;

  @IsOptional()
  @IsBoolean()
  requirePunch?: boolean;

  @IsOptional()
  @IsBoolean()
  allowEarlyPunch?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  earlyPunchGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  lateGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  latePenaltyPerMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  missingPenaltyAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  earlyLeavePenaltyPerMinute?: number;

  @IsOptional()
  @IsBoolean()
  collectLateOutMinutes?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateOt?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendanceSessionRuleStatus;
}

export class UpdateAttendanceSessionRuleDto {
  @IsOptional()
  @IsIn([
    'MORNING_IN',
    'AFTERNOON_IN',
    'CHECK_OUT',
    'OFFSITE_IN',
    'OFFSITE_OUT',
    'CUSTOM',
  ])
  sessionCode?: AttendanceSessionRuleCode;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(['CHECK_IN', 'CHECK_OUT'])
  punchType?: AttendanceSessionRuleType;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'openTime ต้องเป็นรูปแบบ HH:mm' })
  openTime?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'expectedTime ต้องเป็นรูปแบบ HH:mm' })
  expectedTime?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'closeTime ต้องเป็นรูปแบบ HH:mm' })
  closeTime?: string;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'lateAfterTime ต้องเป็นรูปแบบ HH:mm' })
  lateAfterTime?: string | null;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'lateUntilTime ต้องเป็นรูปแบบ HH:mm' })
  lateUntilTime?: string | null;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'earlyBeforeTime ต้องเป็นรูปแบบ HH:mm' })
  earlyBeforeTime?: string | null;

  @IsOptional()
  @Matches(TIME_HH_MM, { message: 'lateOutAfterTime ต้องเป็นรูปแบบ HH:mm' })
  lateOutAfterTime?: string | null;

  @IsOptional()
  @IsBoolean()
  requirePunch?: boolean;

  @IsOptional()
  @IsBoolean()
  allowEarlyPunch?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  earlyPunchGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  lateGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  latePenaltyPerMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  missingPenaltyAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  earlyLeavePenaltyPerMinute?: number;

  @IsOptional()
  @IsBoolean()
  collectLateOutMinutes?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateOt?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AttendanceSessionRuleStatus;
}

class ReorderAttendanceSessionRuleItemDto {
  @IsString()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder!: number;
}

export class ReorderAttendanceSessionRulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderAttendanceSessionRuleItemDto)
  items!: ReorderAttendanceSessionRuleItemDto[];
}
