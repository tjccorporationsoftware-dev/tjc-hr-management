import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  MasterStatus,
  WithholdingCondition,
  WithholdingPayeeType,
} from '../../../generated/prisma/client';

/**
 * ผู้รับเงินที่ไม่ใช่ลูกจ้าง
 *
 * บุคคลธรรมดากรอกคำนำหน้า/ชื่อ/สกุลแยกช่อง เพราะใบแนบ ภ.ง.ด.3 มีช่องแยก
 * ส่วนนิติบุคคลกรอกชื่อเต็มช่องเดียว ระบบประกอบ name ให้เองตามชนิดผู้รับเงิน
 */
export class CreateWithholdingPayeeDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsEnum(WithholdingPayeeType)
  type?: WithholdingPayeeType;

  /** เลขประจำตัวผู้เสียภาษี 13 หลัก — ตัวเลขล้วน ไม่ใส่ขีด */
  @IsString()
  @Length(13, 13, { message: 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก' })
  taxId!: string;

  /** สาขาที่ของผู้รับเงิน 5 หลัก สำนักงานใหญ่ = 00000 */
  @IsOptional()
  @IsString()
  @Length(5, 5, { message: 'สาขาที่ต้องมี 5 หลัก' })
  branchNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  /** ชื่อเต็ม — บังคับเฉพาะนิติบุคคล บุคคลธรรมดาระบบประกอบให้จากสามช่องข้างบน */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateWithholdingPayeeDto {
  @IsOptional()
  @IsEnum(WithholdingPayeeType)
  type?: WithholdingPayeeType;

  @IsOptional()
  @IsString()
  @Length(13, 13, { message: 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก' })
  taxId?: string;

  @IsOptional()
  @IsString()
  @Length(5, 5, { message: 'สาขาที่ต้องมี 5 หลัก' })
  branchNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

/**
 * รายการจ่ายเงินหนึ่งครั้ง = หนึ่งบรรทัดบนใบแนบ ภ.ง.ด.3
 *
 * ภาษีที่หัก (taxAmount) ให้ส่งมาด้วย ไม่ได้คำนวณจากอัตราให้อัตโนมัติ เพราะ
 * ยอดที่หักจริงอาจปัดเศษต่างจากที่คูณตรง ๆ และต้องตรงกับที่จ่ายจริงเสมอ
 * ถ้าไม่ส่งมา ระบบคำนวณให้จาก amount x อัตรา แล้วปัดสองตำแหน่ง
 */
export class CreateWithholdingPaymentDto {
  @IsString()
  companyId!: string;

  @IsString()
  payeeId!: string;

  @IsDateString({}, { message: 'วันที่จ่ายไม่ถูกต้อง' })
  paidOn!: string;

  @IsString()
  incomeTypeCode!: string;

  /** ข้อความบนช่อง "ประเภทเงินได้" — ไม่ส่งมาก็ใช้ชื่อจากรายการมาตรฐาน */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  incomeTypeLabel?: string;

  /** อัตราภาษีร้อยละ — ไม่ส่งมาก็ใช้อัตราตั้งต้นของประเภทเงินได้ */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsEnum(WithholdingCondition)
  condition?: WithholdingCondition;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateWithholdingPaymentDto {
  @IsOptional()
  @IsString()
  payeeId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'วันที่จ่ายไม่ถูกต้อง' })
  paidOn?: string;

  @IsOptional()
  @IsString()
  incomeTypeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  incomeTypeLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsEnum(WithholdingCondition)
  condition?: WithholdingCondition;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** ตัวกรองรายการจ่าย — แบบยื่นดึงตามบริษัทและเดือนที่จ่าย */
export class WithholdingPaymentQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  payeeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsEnum(WithholdingPayeeType)
  payeeType?: WithholdingPayeeType;

  @IsOptional()
  @IsString()
  search?: string;
}

/** แบบยื่น ภ.ง.ด.3 ของเดือนหนึ่ง */
export class WithholdingFilingQueryDto {
  @IsString()
  companyId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  /** วันที่ออกเอกสาร (yyyy-MM-dd ค.ศ.) ไม่ส่ง = ไม่ระบุ */
  @IsOptional()
  @IsDateString()
  issueDate?: string;
}
