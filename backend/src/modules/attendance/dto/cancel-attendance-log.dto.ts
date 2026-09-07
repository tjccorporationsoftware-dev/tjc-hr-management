import { IsOptional, IsString } from 'class-validator';

export class CancelAttendanceLogDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}