import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateComplaintDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string | null;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  expectation?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}