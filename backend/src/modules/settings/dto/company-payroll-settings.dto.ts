import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateCompanyPayrollSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payrollCutoffDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payrollPeriodStartDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  salaryDivisorDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  workingHoursPerDay?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  socialSecurityEmployeeRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  socialSecurityEmployerRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  socialSecurityMinBase?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  socialSecurityMaxBase?: number;
}
