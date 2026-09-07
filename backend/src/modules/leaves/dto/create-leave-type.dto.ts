import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @IsOptional()
  @IsBoolean()
  allowHourly?: boolean;

  @IsOptional()
  @IsBoolean()
  deductQuota?: boolean;

  @IsOptional()
  @IsBoolean()
  affectAttendance?: boolean;

  @IsOptional()
  @IsBoolean()
  affectPayroll?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  minLeaveUnitMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxLeaveDaysPerRequest?: number;

  /** ลาล่วงหน้า — ต้องยื่นก่อนวันลาอย่างน้อยกี่วัน (0 = ไม่บังคับ) */
  @IsOptional()
  @IsInt()
  @Min(0)
  advanceNoticeDays?: number;

  @IsOptional()
  @IsBoolean()
  allowBackdated?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBackdatedDays?: number;

  @IsOptional()
  @IsBoolean()
  backdatedRequiresAttachment?: boolean;

  @IsOptional()
  @IsBoolean()
  backdatedRequiresHrApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @IsOptional()
  @IsIn(['BLOCK', 'ALLOW_WITH_WARNING', 'CONVERT_TO_UNPAID'])
  negativeBalanceMode?: 'BLOCK' | 'ALLOW_WITH_WARNING' | 'CONVERT_TO_UNPAID';

  @IsOptional()
  @IsBoolean()
  includeHoliday?: boolean;

  @IsOptional()
  @IsBoolean()
  includeWeekend?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  attachmentRequiredAfterDays?: number;

  /** ห้ามลาเกินโควตา */
  @IsOptional()
  @IsBoolean()
  enforceQuotaLimit?: boolean;

  /** จำนวนปีสะสม */
  @IsOptional()
  @IsInt()
  @Min(1)
  quotaAccrualYears?: number;

  @IsOptional()
  @IsIn(['ALL', 'MALE', 'FEMALE'])
  genderEligibility?: 'ALL' | 'MALE' | 'FEMALE';

  @IsOptional()
  @IsIn(['HIRE_DATE', 'PROBATION_PASS_DATE'])
  serviceStartBasis?: 'HIRE_DATE' | 'PROBATION_PASS_DATE';

  /**
   * ต้องผ่านการบรรจุก่อนถึงจะยื่นลาประเภทนี้ได้หรือไม่
   *
   * คนละเรื่องกับ serviceStartBasis ที่ใช้แค่คิดโควตา
   * สิทธิลาตามกฎหมาย (ลาป่วย ลาคลอด ลากิจจำเป็น ฯลฯ) เปิดค่านี้ก็ไม่มีผล
   */
  @IsOptional()
  @IsBoolean()
  requireProbationPassed?: boolean;

  /** เฉลี่ยโควตาในปี */
  @IsOptional()
  @IsBoolean()
  prorateFirstYear?: boolean;

  @IsOptional()
  @IsIn(['NONE', 'HALF_HOUR_UP', 'HALF_DAY_UP'])
  roundingMode?: 'NONE' | 'HALF_HOUR_UP' | 'HALF_DAY_UP';

  @IsOptional()
  @IsIn(['DAY', 'HOUR'])
  quotaDisplayUnit?: 'DAY' | 'HOUR';

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
