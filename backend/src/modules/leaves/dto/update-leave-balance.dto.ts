import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateLeaveBalanceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  entitlementDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  carriedForwardDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(-365)
  @Max(365)
  adjustedDays?: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}