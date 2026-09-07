import { IsOptional, IsString } from 'class-validator';

export class OvertimeRequestActionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}