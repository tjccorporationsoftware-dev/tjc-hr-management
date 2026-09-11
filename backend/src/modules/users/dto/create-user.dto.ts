import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { EmailField } from '../../../common/decorators/email-field.decorator';

export class CreateUserDto {
  @IsOptional()
  @EmailField('รูปแบบอีเมลไม่ถูกต้อง')
  email?: string;

  @IsString()
  @MinLength(10, { message: "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร" })
  password!: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  /** ระดับ tenant scope: GLOBAL = ทุกบริษัท, COMPANY = บริษัทเดียว, BRANCH = สาขาเดียว */
  @IsOptional()
  @IsIn(["GLOBAL", "COMPANY", "BRANCH"], { message: "scopeLevel ไม่ถูกต้อง" })
  scopeLevel?: "GLOBAL" | "COMPANY" | "BRANCH";

  @IsOptional()
  @IsString()
  scopedCompanyId?: string;

  @IsOptional()
  @IsString()
  scopedBranchId?: string;
}