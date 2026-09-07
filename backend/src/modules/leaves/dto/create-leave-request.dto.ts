import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateLeaveRequestDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsString()
  @IsNotEmpty()
  leaveTypeId!: string;

  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @IsString()
  @IsNotEmpty()
  endDate!: string;

  @IsOptional()
  @IsIn(['FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON', 'HOURLY'])
  dayType?: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON' | 'HOURLY';

  @IsOptional()
  @IsString()
  @Matches(timePattern, { message: 'เวลาเริ่มลาต้องอยู่ในรูปแบบ HH:mm' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(timePattern, { message: 'เวลาสิ้นสุดลาต้องอยู่ในรูปแบบ HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalMinutes?: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  retroactiveReason?: string;

  @IsOptional()
  @IsString()
  contactInfo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
