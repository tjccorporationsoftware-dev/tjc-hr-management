import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateLeaveBalancesDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @IsOptional()
  @IsBoolean()
  overwriteEntitlement?: boolean;
}