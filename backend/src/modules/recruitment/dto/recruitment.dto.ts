import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  EmploymentTypeTag,
  JobApplicationStage,
  JobOfferStatus,
  JobPostingStatus,
  InterviewResult,
} from '../../../generated/prisma/client';
import { EmailField } from '../../../common/decorators/email-field.decorator';

class PagedQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}

/* ---------------- Job posting ---------------- */

export class CreateJobPostingDto {
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
  positionId?: string;

  @IsString()
  code!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsEnum(EmploymentTypeTag)
  employmentType?: EmploymentTypeTag;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  openings?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  requirement?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  workLocation?: string;

  @IsOptional()
  @IsEnum(JobPostingStatus)
  status?: JobPostingStatus;

  @IsOptional()
  @IsDateString()
  closingDate?: string;
}

export class UpdateJobPostingDto extends CreateJobPostingDto {
  @IsOptional()
  @IsString()
  declare code: string;

  @IsOptional()
  @IsString()
  declare title: string;
}

export class ListJobPostingsQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsEnum(JobPostingStatus)
  status?: JobPostingStatus;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

/* ---------------- Application ---------------- */

export class CreateJobApplicationDto {
  @IsString()
  postingId!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @EmailField()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  currentPosition?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expectedSalary?: number;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  currentCompany?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;

  @IsOptional()
  @IsString()
  educationLevel?: string;

  @IsOptional()
  @IsString()
  educationInstitute?: string;

  @IsOptional()
  @IsString()
  educationMajor?: string;

  @IsOptional()
  @IsString()
  resumeUrl?: string;
}

export class UpdateJobApplicationDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @EmailField()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  currentPosition?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expectedSalary?: number;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  screeningScore?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListJobApplicationsQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  postingId?: string;

  @IsOptional()
  @IsEnum(JobApplicationStage)
  stage?: JobApplicationStage;
}

export class MoveApplicationStageDto {
  @IsEnum(JobApplicationStage)
  stage!: JobApplicationStage;

  @IsOptional()
  @IsString()
  rejectReason?: string;
}

/* ---------------- Interview ---------------- */

export class CreateJobInterviewDto {
  @IsString()
  applicationId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  round?: number;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  interviewerId?: string;

  @IsOptional()
  @IsString()
  interviewerName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RecordInterviewResultDto {
  @IsEnum(InterviewResult)
  result!: InterviewResult;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  score?: number;

  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  weakness?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/* ---------------- Offer ---------------- */

export class CreateJobOfferDto {
  @IsString()
  applicationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offeredSalary!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  probationDays?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  benefitNote?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateJobOfferStatusDto {
  @IsEnum(JobOfferStatus)
  status!: JobOfferStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

/* ---------------- Hire ---------------- */

export class HireApplicantDto {
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
  positionId?: string;

  @IsOptional()
  @IsString()
  supervisorId?: string;

  /** ถ้าไม่ส่งมาจะใช้วันเริ่มงานจากใบเสนอจ้าง */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** ถ้าไม่ส่งมาจะใช้จำนวนวันทดลองงานจากใบเสนอจ้าง */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  probationDays?: number;
}
