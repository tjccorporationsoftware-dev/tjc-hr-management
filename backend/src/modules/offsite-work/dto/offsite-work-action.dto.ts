import { IsOptional, IsString, MaxLength } from 'class-validator';

export class OffsiteWorkActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
