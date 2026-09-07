import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsIn,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

const attendanceDailyReviewIssueValues = [
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
  "TIME_ADJUST",
] as const;

export type AttendanceDailyReviewIssue =
  (typeof attendanceDailyReviewIssueValues)[number];

function toBoolean(value: unknown) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}

export class ListAttendanceDailySummariesQueryDto {
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
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  hasMissingLog?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  hasPenalty?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  leaveIsPaid?: boolean;

  @IsOptional()
  @IsIn([
    "CALCULATED",
    "NEED_REVIEW",
    "REVIEWED",
    "READY_FOR_PAYROLL",
    "SENT_TO_PAYROLL",
    "LOCKED",
  ])
  reviewStatus?:
    | "CALCULATED"
    | "NEED_REVIEW"
    | "REVIEWED"
    | "READY_FOR_PAYROLL"
    | "SENT_TO_PAYROLL"
    | "LOCKED";

  @IsOptional()
  @IsIn(attendanceDailyReviewIssueValues)
  issue?: AttendanceDailyReviewIssue = "ALL";
}

export class RecalculateAttendanceDailySummariesDto {
  @IsOptional()
  @IsUUID()
  progressId?: string;

  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

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
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  force?: boolean;
}
