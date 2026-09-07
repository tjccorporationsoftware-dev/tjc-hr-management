import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateLeaveRequestDto {
  @IsOptional()
  @IsString()
  leaveTypeId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON', 'HOURLY'])
  dayType?: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON' | 'HOURLY';

  @IsOptional()
  @IsString()
  @Matches(timePattern, { message: 'เวลาเริ่มลาต้องอยู่ในรูปแบบ HH:mm' })
  startTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(timePattern, { message: 'เวลาสิ้นสุดลาต้องอยู่ในรูปแบบ HH:mm' })
  endTime?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalMinutes?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  retroactiveReason?: string | null;

  @IsOptional()
  @IsString()
  contactInfo?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}
