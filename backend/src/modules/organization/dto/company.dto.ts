import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { MasterStatus } from "../../../generated/prisma/client";
import { EmailField } from '../../../common/decorators/email-field.decorator';

export class CreateCompanyDto {
  @IsString()
  code!: string;

  @IsString()
  nameTh!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @EmailField('รูปแบบอีเมลไม่ถูกต้อง')
  email?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  /* ---- ข้อมูลนายจ้างที่ใช้ในไฟล์นำส่งหน่วยงาน ---- */

  /** เลขที่บัญชีนายจ้าง 10 หลัก ใช้ในหัวแบบ สปส.1-10 */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  socialSecurityAccountNo?: string;

  /** ลำดับที่สาขาของนายจ้าง ปกติ 000 */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  socialSecurityBranchNo?: string;


  /** รหัสกิจการของกองทุนเงินทดแทน ใช้ในแบบ กท.20 / กท.20ก */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  workmenCompensationCode?: string;

  /**
   * อัตราเงินสมทบกองทุนเงินทดแทน (ร้อยละ)
   *
   * กฎหมายกำหนดช่วง 0.2%-1.0% ตามความเสี่ยงของประเภทกิจการ จำกัดช่วงไว้กว้างกว่านั้น
   * เล็กน้อยเผื่ออัตราพิเศษ แต่ยังกันค่าที่พิมพ์ผิดเป็นหลักสิบหลักร้อย
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(10)
  workmenCompensationRate?: number;

  /** รหัสบริษัทที่ธนาคารออกให้ ใช้ในไฟล์นำเข้าระบบจ่ายเงินเดือน */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCompanyCode?: string;

  /** เลขที่บัญชีบริษัทที่ใช้ตัดจ่ายเงินเดือน */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankDebitAccountNo?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  nameTh?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @EmailField('รูปแบบอีเมลไม่ถูกต้อง')
  email?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  /* ---- ข้อมูลนายจ้างที่ใช้ในไฟล์นำส่งหน่วยงาน ---- */

  @IsOptional()
  @IsString()
  @MaxLength(20)
  socialSecurityAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  socialSecurityBranchNo?: string;

  /** รหัสกิจการของกองทุนเงินทดแทน ใช้ในแบบ กท.20 / กท.20ก */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  workmenCompensationCode?: string;

  /**
   * อัตราเงินสมทบกองทุนเงินทดแทน (ร้อยละ)
   *
   * กฎหมายกำหนดช่วง 0.2%-1.0% ตามความเสี่ยงของประเภทกิจการ จำกัดช่วงไว้กว้างกว่านั้น
   * เล็กน้อยเผื่ออัตราพิเศษ แต่ยังกันค่าที่พิมพ์ผิดเป็นหลักสิบหลักร้อย
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(10)
  workmenCompensationRate?: number;


  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCompanyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankDebitAccountNo?: string;

  @IsOptional()
  @IsEnum(MasterStatus, { message: "สถานะไม่ถูกต้อง" })
  status?: MasterStatus;
}