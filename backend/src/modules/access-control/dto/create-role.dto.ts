import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class CreateRoleDto {
  /** ใช้เฉพาะ GLOBAL admin ระบุบริษัทปลายทาง; company admin จะถูกล็อกเป็นบริษัทตน */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  @Matches(/^[A-Z0-9_]+$/, {
    message: "รหัส Role ต้องเป็นตัวอักษรภาษาอังกฤษตัวใหญ่ ตัวเลข หรือ _ เท่านั้น",
  })
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];
}