import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateComplaintDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  expectation?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}