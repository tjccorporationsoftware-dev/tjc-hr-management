import { IsOptional, IsString } from 'class-validator';

export class WarningLetterActionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  employeeResponse?: string;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}