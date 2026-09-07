import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateOffsiteWorkRequestDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsDateString()
  workDate!: string;

  @Matches(TIME_PATTERN)
  startTime!: string;

  @Matches(TIME_PATTERN)
  endTime!: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000000)
  attachmentUrl?: string;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
