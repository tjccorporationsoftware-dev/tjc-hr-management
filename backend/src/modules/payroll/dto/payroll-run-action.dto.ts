import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewPayrollRunDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class ApprovePayrollRunDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class MarkPayrollRunPaidDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  note?: string;
}