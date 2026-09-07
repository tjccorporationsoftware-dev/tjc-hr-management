import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { MasterStatus } from "../../../generated/prisma/client";
import { EmailField } from '../../../common/decorators/email-field.decorator';

/**
 * ช่องที่ใช้ทำหัวสลิป/เอกสารของสาขา
 * ประกาศครั้งเดียวแล้วให้ทั้ง create/update สืบทอด จะได้ไม่หลุดกันทีละช่อง
 */
class BranchDocumentProfileDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @EmailField('รูปแบบอีเมลไม่ถูกต้อง')
  email?: string;

  /** ใช้ข้อมูลสาขาเป็นหัวสลิปแทนบริษัท (ช่องที่เว้นว่างจะถอยไปใช้ของบริษัท) */
  @IsOptional()
  @IsBoolean()
  usePayslipHeader?: boolean;

  /** เลขประจำตัวผู้เสียภาษีที่พิมพ์บนเอกสารของสาขา */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;

  /** เลขที่สาขาในระบบภาษี 5 หลัก (00000 = สำนักงานใหญ่) */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  taxBranchNo?: string;

  /** ลำดับที่สาขาของนายจ้างในระบบประกันสังคม */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  socialSecurityBranchNo?: string;

  /** ข้อความท้ายสลิปเฉพาะสาขา */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  payslipNote?: string;
}

export class CreateBranchDto extends BranchDocumentProfileDto {
  @IsString()
  companyId!: string;

  @IsString()
  code!: string;

  @IsString()
  nameTh!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;
}

export class UpdateBranchDto extends BranchDocumentProfileDto {
  @IsOptional()
  @IsString()
  nameTh?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsEnum(MasterStatus, { message: "สถานะไม่ถูกต้อง" })
  status?: MasterStatus;
}
