import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class PayrollRunQueryDto {
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
  periodId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  pageSize?: number;
}

export class CreatePayrollRunDto {
  @IsString()
  companyId!: string;

  @IsString()
  periodId!: string;

  /**
   * สาขาที่รอบนี้ครอบคลุม
   *
   * **ไม่ส่งหรือส่งมาว่าง = ทั้งบริษัท** ซึ่งเป็นพฤติกรรมเดิมก่อนมีตัวเลือกนี้
   * ผู้เรียกเดิมที่ไม่รู้จักฟิลด์นี้จึงได้ผลลัพธ์เหมือนเดิมทุกประการ
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  runNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CalculatePayrollRunDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];
}

export class CancelPayrollRunDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
