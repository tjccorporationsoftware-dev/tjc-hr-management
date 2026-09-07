import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  ALLOWANCE_PERCENT_BASES,
  type AllowancePercentBase,
} from "../utils/payroll-tax-allowance-limit.util";

export class PayrollTaxListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  taxYearId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  pageSize?: number;
}

export class CreatePayrollTaxYearDto {
  @IsString()
  companyId!: string;

  @IsInt()
  taxYear!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  personalExpenseRate?: string;

  @IsOptional()
  @IsString()
  personalExpenseMax?: string;

  @IsOptional()
  @IsString()
  standardPersonalAllowance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roundingMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxAveragingMethod?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePayrollTaxYearDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  personalExpenseRate?: string;

  @IsOptional()
  @IsString()
  personalExpenseMax?: string;

  @IsOptional()
  @IsString()
  standardPersonalAllowance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roundingMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxAveragingMethod?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePayrollTaxBracketDto {
  @IsString()
  taxYearId!: string;

  @IsString()
  minIncome!: string;

  @IsOptional()
  @IsString()
  maxIncome?: string;

  @IsString()
  rate!: string;

  @IsOptional()
  @IsString()
  quickDeduction?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePayrollTaxBracketDto {
  @IsOptional()
  @IsString()
  minIncome?: string;

  @IsOptional()
  @IsString()
  maxIncome?: string;

  @IsOptional()
  @IsString()
  rate?: string;

  @IsOptional()
  @IsString()
  quickDeduction?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePayrollTaxAllowanceTypeDto {
  @IsString()
  taxYearId!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(255)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  defaultAmount?: string;

  @IsOptional()
  @IsString()
  maxAmount?: string;

  /** เพดานเป็นสัดส่วนของเงินได้ เช่น "0.15" = 15% */
  @IsOptional()
  @IsString()
  maxPercentOfIncome?: string;

  @IsOptional()
  @IsIn(ALLOWANCE_PERCENT_BASES)
  percentBase?: AllowancePercentBase;

  /** ตัวคูณยอดที่หักได้ เช่น "2" สำหรับบริจาคเพื่อการศึกษา */
  @IsOptional()
  @IsString()
  deductionMultiplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  limitGroupCode?: string;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePayrollTaxAllowanceTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameTh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  defaultAmount?: string;

  @IsOptional()
  @IsString()
  maxAmount?: string;

  /** เพดานเป็นสัดส่วนของเงินได้ เช่น "0.15" = 15% */
  @IsOptional()
  @IsString()
  maxPercentOfIncome?: string;

  @IsOptional()
  @IsIn(ALLOWANCE_PERCENT_BASES)
  percentBase?: AllowancePercentBase;

  /** ตัวคูณยอดที่หักได้ เช่น "2" สำหรับบริจาคเพื่อการศึกษา */
  @IsOptional()
  @IsString()
  deductionMultiplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  limitGroupCode?: string;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateEmployeeTaxProfileDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsString()
  taxYearId!: string;

  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  maritalStatus?: string;

  @IsOptional()
  @IsBoolean()
  spouseHasIncome?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateEmployeeTaxProfileDto {
  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  maritalStatus?: string;

  @IsOptional()
  @IsBoolean()
  spouseHasIncome?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpsertEmployeeTaxAllowanceDto {
  @IsString()
  allowanceTypeId!: string;

  @IsString()
  declaredAmount!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

export class UpdateEmployeeTaxAllowanceDto {
  @IsOptional()
  @IsString()
  declaredAmount?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

/** ยกค่าลดหย่อนของพนักงานจากปีภาษีหนึ่งมาตั้งต้นอีกปีหนึ่ง */
export class CopyEmployeeTaxProfilesDto {
  @IsString()
  companyId!: string;

  /** ปีภาษีต้นทาง — ไม่ระบุจะใช้ปีภาษีก่อนหน้าปีปลายทางของบริษัทเดียวกัน */
  @IsOptional()
  @IsString()
  fromTaxYearId?: string;

  @IsString()
  toTaxYearId!: string;

  /** ทับข้อมูลที่ปีปลายทางมีอยู่แล้ว — ค่าเริ่มต้นคือข้ามคนที่มีข้อมูลแล้ว */
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

export class PayrollTaxPreviewDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  taxYearId?: string;

  @IsOptional()
  monthlyIncome?: number;

  @IsOptional()
  bonusIncome?: number;

  @IsOptional()
  otherTaxableIncome?: number;

  @IsOptional()
  taxableIncomeYtd?: number;

  @IsOptional()
  socialSecurityYtd?: number;

  @IsOptional()
  taxWithheldYtd?: number;

  @IsOptional()
  remainingPeriods?: number;
}

export class PayrollRunTaxPreviewDto {
  @IsOptional()
  @IsString()
  taxYearId?: string;

  @IsOptional()
  remainingPeriods?: number;
}

export class PayrollTaxReportQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  taxYearId?: string;

  @IsOptional()
  @IsString()
  payrollRunId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  year?: number;

  @IsOptional()
  month?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  pageSize?: number;
}

export class PayrollTaxPnd1ReportQueryDto extends PayrollTaxReportQueryDto {}

export class PayrollTaxPnd1AReportQueryDto extends PayrollTaxReportQueryDto {
  /**
   * วันที่ออกเอกสาร ที่ผู้ใช้เลือกในกล่อง "ระบุวันออกเอกสาร"
   *
   * รูปแบบ yyyy-MM-dd เป็น ค.ศ. ตามที่ปฏิทินฝั่งหน้าจอส่งมา แล้วแปลงเป็น พ.ศ.
   * ตอนพิมพ์ลงแบบฟอร์ม ไม่ส่งมา = "ไม่ระบุ" เอกสารจะเว้นช่องวันที่ไว้เขียนเอง
   */
  @IsOptional()
  @IsDateString()
  issueDate?: string;
}

export class PayrollTaxWithholdingCertificateQueryDto extends PayrollTaxReportQueryDto {}

/**
 * ยอดสะสมยกมาต้นงวดของปีภาษี (opening balance)
 *
 * จำเป็นเมื่อเริ่มใช้ระบบกลางปี เพราะ tax engine ประมาณรายได้ทั้งปีจาก
 * "ยอดสะสม + รายได้งวดนี้ x จำนวนงวดที่เหลือ" ถ้ายอดสะสมเป็น 0 ภาษีหัก ณ
 * ที่จ่ายจะต่ำกว่าความจริงมาก และไปโผล่เป็นยอดค้างชำระตอนยื่นภาษีปลายปี
 *
 * ตัวเลขที่กรอกคือยอดจากระบบเดิมตั้งแต่ต้นปีภาษีจนถึงก่อนงวดแรกที่รันในระบบนี้
 */
export class UpsertEmployeeTaxOpeningBalanceDto {
  @IsString()
  companyId!: string;

  @IsString()
  employeeId!: string;

  @IsString()
  taxYearId!: string;

  /** เงินได้พึงประเมินสะสม */
  @IsOptional()
  @IsString()
  totalTaxableIncome?: string;

  /** ภาษีหัก ณ ที่จ่ายสะสม */
  @IsOptional()
  @IsString()
  totalTaxWithheld?: string;

  /** เงินสมทบประกันสังคมสะสม */
  @IsOptional()
  @IsString()
  totalSocialSecurity?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
