import { IsOptional, IsString } from 'class-validator';

export class TimeAdjustRequestActionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}