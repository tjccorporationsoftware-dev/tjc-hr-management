import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateLeavePolicyDto {

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  employeeTypeId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  annualQuotaDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxConsecutiveDays?: number | null;

  @IsOptional()
  @IsBoolean()
  allowCarryForward?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  carryForwardLimitDays?: number;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  /*
   * ฟิลด์ด้านล่างเคยรับเฉพาะตอนสร้าง แก้ทีหลังไม่ได้เลย
   * ต้องลบนโยบายทิ้งแล้วสร้างใหม่ ทั้งที่เป็นค่าที่เปลี่ยนกันปกติ
   * (companyId / leaveTypeId ยังไม่ให้แก้ เพราะเป็นตัวระบุนโยบาย)
   */
  @IsOptional()
  @IsIn(['YEARLY', 'MONTHLY', 'PROBATION_AFTER'])
  quotaPeriod?: 'YEARLY' | 'MONTHLY' | 'PROBATION_AFTER';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(31)
  monthlyAccrualDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  probationEligibleAfterDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  carryForwardExpireMonth?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  carryForwardExpireDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  maxBackdatedDaysOverride?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  requireAttachmentAfterDays?: number | null;

  @IsOptional()
  @IsString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}