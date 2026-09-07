import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const timezones = ['Asia/Bangkok', 'UTC'] as const;
const locales = ['th-TH', 'en-US'] as const;
const dateFormats = ['DD/MM/YYYY พ.ศ.', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;
const timeFormats = ['HH:mm', 'HH:mm:ss'] as const;
const holidayWeekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const holidayTypes = ['COMPANY', 'SPECIAL', 'PUBLIC'] as const;
const holidayWorkAssignmentTargetTypes = ['ALL', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'DIVISION', 'EMPLOYEE_TYPE', 'EMPLOYEE'] as const;
const substituteHolidayCreditStatuses = ['AVAILABLE', 'USED', 'CANCELLED'] as const;
const holidaySwapScopeTypes = ['COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE'] as const;

export class AttendanceCustomHolidayDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(holidayTypes)
  holidayType?: (typeof holidayTypes)[number];
}


export class AttendanceHolidayWorkOverrideDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  appliesToAll?: boolean;

  @IsOptional()
  @IsBoolean()
  grantSubstituteHoliday?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companyIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  divisionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeTypeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];
}


export class AttendanceSubstituteHolidayCreditDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  employeeCode?: string | null;

  @IsOptional()
  @IsString()
  employeeName?: string | null;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  earnedDate!: string;

  @IsOptional()
  @IsString()
  holidayName?: string | null;

  @IsOptional()
  @IsString()
  workOverrideName?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  grantedDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  grantedMinutes?: number;

  @IsOptional()
  @IsIn(substituteHolidayCreditStatuses)
  status?: (typeof substituteHolidayCreditStatuses)[number];

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceSummaryId?: string | null;

  @IsOptional()
  @IsString()
  grantedAt?: string;

  @IsOptional()
  @IsString()
  grantedById?: string | null;

  @IsOptional()
  @IsString()
  usedAt?: string | null;

  @IsOptional()
  @IsString()
  usedById?: string | null;

  @IsOptional()
  @IsString()
  cancelledAt?: string | null;

  @IsOptional()
  @IsString()
  cancelledById?: string | null;

  @IsOptional()
  @IsString()
  cancelledReason?: string | null;
}


export class CreateHolidaySwapDto {
  /**
   * ว่างได้ = ให้วันหยุดเพิ่มโดยไม่เอาวันไหนไปแลก
   * ถ้าส่งมา = ย้ายวันหยุด วันนี้จะกลายเป็นวันทำงานแทน
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  originalHolidayDate?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  swappedHolidayDate!: string;

  @IsIn(holidaySwapScopeTypes)
  scopeType!: (typeof holidaySwapScopeTypes)[number];

  @IsString()
  @MinLength(1)
  scopeId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelHolidaySwapDto {
  @IsOptional()
  @IsString()
  cancelReason?: string;
}

export class CreateHolidayCalendarDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(holidayTypes)
  holidayType?: (typeof holidayTypes)[number];
}

export class CreateHolidayWorkAssignmentDto {
  @IsString()
  holidayId!: string;

  @IsIn(holidayWorkAssignmentTargetTypes)
  targetType!: (typeof holidayWorkAssignmentTargetTypes)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  grantSubstituteHoliday?: boolean;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  organizationName?: string;

  @IsOptional()
  @IsIn(timezones)
  timezone?: (typeof timezones)[number];

  @IsOptional()
  @IsIn(locales)
  locale?: (typeof locales)[number];

  @IsOptional()
  @IsIn(dateFormats)
  dateFormat?: (typeof dateFormats)[number];

  @IsOptional()
  @IsIn(timeFormats)
  timeFormat?: (typeof timeFormats)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;


  @IsOptional()
  @IsArray()
  @IsIn(holidayWeekdays, { each: true })
  attendanceWeeklyHolidays?: Array<(typeof holidayWeekdays)[number]>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceCustomHolidayDto)
  attendanceCustomHolidays?: AttendanceCustomHolidayDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceHolidayWorkOverrideDto)
  attendanceHolidayWorkOverrides?: AttendanceHolidayWorkOverrideDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceSubstituteHolidayCreditDto)
  attendanceSubstituteHolidayCredits?: AttendanceSubstituteHolidayCreditDto[];

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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  fileUploadMaxMb?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[a-z0-9]+$/i, { each: true })
  allowedFileTypes?: string[];

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  sessionTimeoutMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(128)
  passwordMinLength?: number;

  @IsOptional()
  @IsBoolean()
  requireUppercase?: boolean;

  @IsOptional()
  @IsBoolean()
  requireLowercase?: boolean;

  @IsOptional()
  @IsBoolean()
  requireNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  requireSymbol?: boolean;

  @IsOptional()
  @IsBoolean()
  requireTwoFactor?: boolean;

  @IsOptional()
  @IsBoolean()
  enableEmailNotification?: boolean;

  @IsOptional()
  @IsBoolean()
  enableLineNotification?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;
}
