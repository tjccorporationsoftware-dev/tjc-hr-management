import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  MasterStatus,
  OffboardingReasonType,
  OffboardingStatus,
  OffboardingTaskStatus,
} from '../../../generated/prisma/client';

/* ---------------------------------------------------------- */
/* Checklist                                                   */
/* ---------------------------------------------------------- */

export class CreateOffboardingChecklistItemDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  ownerRole?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class CreateOffboardingChecklistDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOffboardingChecklistItemDto)
  items!: CreateOffboardingChecklistItemDto[];
}

export class UpdateOffboardingChecklistDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOffboardingChecklistItemDto)
  items?: CreateOffboardingChecklistItemDto[];
}

export class ListOffboardingChecklistsQueryDto {
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

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

/* ---------------------------------------------------------- */
/* Case                                                        */
/* ---------------------------------------------------------- */

export class CreateOffboardingCaseDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  resignationId?: string;

  @IsOptional()
  @IsString()
  checklistId?: string;

  @IsOptional()
  @IsEnum(OffboardingReasonType)
  reasonType?: OffboardingReasonType;

  @IsDateString()
  lastWorkingDate!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateOffboardingCaseDto {
  @IsOptional()
  @IsString()
  checklistId?: string;

  @IsOptional()
  @IsEnum(OffboardingReasonType)
  reasonType?: OffboardingReasonType;

  @IsOptional()
  @IsDateString()
  lastWorkingDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unusedLeaveDays?: number;

  /** กรอกเองได้ แต่ปกติให้กดคำนวณแล้วระบบเติมให้ */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  severancePay?: number;

  /** เลิกจ้างเพราะลูกจ้างกระทำผิดร้ายแรง (มาตรา 119) — ถ้าใช่ ไม่ได้ค่าชดเชย */
  @IsOptional()
  @IsBoolean()
  terminatedWithCause?: boolean;

  /** วันค่าจ้างแทนการบอกกล่าวล่วงหน้า (มาตรา 17) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  noticePayDays?: number;

  /** ค่าชดเชยพิเศษ กรณีย้ายสถานประกอบกิจการหรือใช้เครื่องจักรแทนคน */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  specialSeveranceDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherSeparationPay?: number;

  @IsOptional()
  @IsString()
  finalPayNote?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListOffboardingCasesQueryDto {
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

  @IsOptional()
  @IsString()
  employeeId?: string;

  /** กรองตามสาขาของพนักงาน — เคสไม่ได้เก็บสาขาเอง ต้องดูผ่านตัวพนักงาน */
  @IsOptional()
  @IsString()
  branchId?: string;

  /** กรองตามแผนกของพนักงาน */
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsEnum(OffboardingStatus)
  status?: OffboardingStatus;
}

export class OffboardingCaseActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/* ---------------------------------------------------------- */
/* Task                                                        */
/* ---------------------------------------------------------- */

export class CreateOffboardingTaskDto {
  @IsString()
  caseId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  ownerRole?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class ListOffboardingTasksQueryDto {
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

  @IsOptional()
  @IsString()
  caseId?: string;

  @IsOptional()
  @IsEnum(OffboardingTaskStatus)
  status?: OffboardingTaskStatus;
}

export class OffboardingTaskActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/* ---------------------------------------------------------- */
/* Exit interview                                              */
/* ---------------------------------------------------------- */

export class SaveExitInterviewDto {
  @IsOptional()
  @IsDateString()
  interviewDate?: string;

  @IsOptional()
  @IsString()
  primaryReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  recommendScore?: number;

  @IsOptional()
  @IsBoolean()
  wouldRehire?: boolean;

  @IsOptional()
  @IsString()
  whatWorkedWell?: string;

  @IsOptional()
  @IsString()
  whatToImprove?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
