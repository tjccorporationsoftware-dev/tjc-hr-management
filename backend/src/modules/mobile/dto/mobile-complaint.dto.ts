import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MobileComplaintListQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'])
  status?: 'SUBMITTED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class MobileCreateComplaintDto {
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

export class MobileComplaintActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
