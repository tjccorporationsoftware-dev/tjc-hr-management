import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ListLeaveCatalogQueryDto {
  /** GLOBAL scope เท่านั้นที่เลือกบริษัทเองได้ */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** true = แสดงเฉพาะรายการที่บริษัทนี้เปิดใช้แล้ว */
  @IsOptional()
  @IsIn(['true', 'false'])
  enabledOnly?: 'true' | 'false';
}

export class ToggleLeaveCatalogDto {
  @IsOptional()
  @IsString()
  companyId?: string;
}

/**
 * โควตาแบบขั้นบันไดตามอายุงาน — คอลัมน์ "ระยะเวลาทำงาน / โควตา"
 */
export class LeaveQuotaTierDto {
  @IsInt()
  @Min(0)
  @Max(600)
  minServiceMonths!: number;

  @IsNumber()
  @Min(0)
  quotaDays!: number;
}

/**
 * นโยบายของประเภทพนักงาน 1 แถวในตาราง
 */
export class LeavePolicyMatrixRowDto {
  /** null = ใช้กับพนักงานทุกประเภท */
  @IsOptional()
  @IsString()
  employeeTypeId?: string | null;

  @IsNumber()
  @Min(0)
  annualQuotaDays!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxConsecutiveDays?: number | null;

  @IsOptional()
  @IsBoolean()
  allowCarryForward?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carryForwardLimitDays?: number;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  /** ค่าปรับ : หักค่าจ้างกี่เท่าต่อวันลา */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unpaidDeductionMultiplier?: number;

  @IsOptional()
  @IsBoolean()
  includeInTax?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInSocialSecurity?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveQuotaTierDto)
  quotaTiers?: LeaveQuotaTierDto[];
}

/**
 * บันทึกประเภทลา + นโยบายทุกประเภทพนักงาน + tier ในครั้งเดียว
 * ใช้แทนการยิงหลาย request จากหน้าเดียว
 */
export class SaveLeaveTypeMatrixDto {
  /** ขอบเขตสาขา : null = ค่ามาตรฐานของบริษัท */
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameTh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  attachmentRequiredAfterDays?: number | null;

  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @IsOptional()
  @IsBoolean()
  allowHourly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  minLeaveUnitMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxLeaveDaysPerRequest?: number | null;

  @IsOptional()
  @IsBoolean()
  deductQuota?: boolean;

  @IsOptional()
  @IsBoolean()
  affectAttendance?: boolean;

  @IsOptional()
  @IsBoolean()
  affectPayroll?: boolean;

  /** ลาล่วงหน้า (วัน) */
  @IsOptional()
  @IsInt()
  @Min(0)
  advanceNoticeDays?: number;

  @IsOptional()
  @IsBoolean()
  allowBackdated?: boolean;

  /** ลาย้อนหลัง (วัน) */
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

  /** ห้ามลาเกินโควตา */
  @IsOptional()
  @IsBoolean()
  enforceQuotaLimit?: boolean;

  @IsOptional()
  @IsBoolean()
  includeHoliday?: boolean;

  @IsOptional()
  @IsBoolean()
  includeWeekend?: boolean;

  /** จำนวนปีสะสม */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeavePolicyMatrixRowDto)
  policies?: LeavePolicyMatrixRowDto[];
}

/**
 * คัดลอกนโยบายการลาข้ามบริษัท / ข้ามสาขา
 */
export class CopyLeavePolicyDto {
  @IsString()
  @IsNotEmpty()
  fromCompanyId!: string;

  @IsOptional()
  @IsString()
  fromBranchId?: string | null;

  @IsString()
  @IsNotEmpty()
  toCompanyId!: string;

  @IsOptional()
  @IsString()
  toBranchId?: string | null;

  /**
   * MERGE   = เขียนทับเฉพาะประเภทลาที่ต้นทางมี ปลายทางที่เหลือคงไว้
   * REPLACE = ปิดใช้ประเภทลาของปลายทางที่ต้นทางไม่มีด้วย
   */
  @IsOptional()
  @IsIn(['MERGE', 'REPLACE'])
  mode?: 'MERGE' | 'REPLACE';

  /** จำกัดเฉพาะบางประเภทลา (ว่าง = ทั้งหมด) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  catalogIds?: string[];
}
