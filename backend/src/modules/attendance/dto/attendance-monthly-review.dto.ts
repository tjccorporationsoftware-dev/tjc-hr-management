import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const attendanceMonthlyReviewIssueValues = [
  "ALL",
  "ALERTS",
  "NORMAL_READY",
  "NEED_REVIEW",
  "MISSING_LOG",
  "MISSING_MORNING",
  "MISSING_AFTERNOON",
  "MISSING_CHECKOUT",
  "ABSENT",
  "LATE",
  "EARLY_CHECKOUT",
  "LATE_CHECKOUT",
  "LEAVE",
  "UNPAID_LEAVE",
  "OFFSITE",
  "PENALTY",
  "READY_FOR_PAYROLL",
  "LOCKED",
] as const;

export type AttendanceMonthlyReviewIssue =
  (typeof attendanceMonthlyReviewIssueValues)[number];

export class AttendanceMonthlyReviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsIn(attendanceMonthlyReviewIssueValues)
  issue?: AttendanceMonthlyReviewIssue = "ALL";
}

export class AttendanceMonthlyReviewDetailQueryDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;
}

export class AttendanceMonthlyReviewActionDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  employeeIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AttendanceMonthlyReviewScopeActionDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsIn(attendanceMonthlyReviewIssueValues)
  issue?: AttendanceMonthlyReviewIssue = "ALL";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
