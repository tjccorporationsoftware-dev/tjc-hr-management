import { IsOptional, IsString } from 'class-validator';

export class LeaveRequestActionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}