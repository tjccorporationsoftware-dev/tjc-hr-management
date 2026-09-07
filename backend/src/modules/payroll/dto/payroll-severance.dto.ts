import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

/** เหตุออกจากงานที่ใบ offboarding ใช้ */
export const offboardingReasonTypes = [
  'RESIGNATION',
  'TERMINATION',
  'END_OF_CONTRACT',
  'RETIREMENT',
  'LAYOFF',
  'OTHER',
] as const;

export class SeveranceQuoteDto {
  @IsString()
  employeeId!: string;

  @IsIn(offboardingReasonTypes)
  reasonType!: (typeof offboardingReasonTypes)[number];

  /** วันสุดท้ายที่ทำงาน ใช้นับอายุงานและหาปีภาษี */
  @IsDateString()
  lastWorkingDate!: string;

  /** เลิกจ้างเพราะกระทำผิดร้ายแรง (มาตรา 119) — ถ้าใช่ ไม่ได้ค่าชดเชย */
  @IsOptional()
  @IsBoolean()
  terminatedWithCause?: boolean;

  /** ค่าจ้างต่อเดือนที่ใช้คำนวณ ว่างไว้ = ใช้อัตราสุดท้ายในระบบ */
  @IsOptional()
  @IsString()
  monthlyWage?: string;

  @IsOptional()
  @IsString()
  noticePayDays?: string;

  @IsOptional()
  @IsString()
  unusedLeaveDays?: string;

  @IsOptional()
  @IsString()
  specialSeveranceDays?: string;

  @IsOptional()
  @IsString()
  otherSeparationPay?: string;

  /** บริษัทออกภาษีให้ — ให้ระบบหายอดตั้งจ่ายย้อนกลับจากยอดสุทธิ */
  @IsOptional()
  @IsBoolean()
  grossUpTax?: boolean;
}
