import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateOffsiteWorkRequestDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  workDate?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000000)
  attachmentUrl?: string;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
