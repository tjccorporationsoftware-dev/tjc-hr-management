import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class PayrollListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  month?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  year?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}