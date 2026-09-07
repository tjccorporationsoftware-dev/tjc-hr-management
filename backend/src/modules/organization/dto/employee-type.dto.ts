import { IsEnum, IsOptional, IsString } from "class-validator";
import { MasterStatus } from "../../../generated/prisma/client";

export class CreateEmployeeTypeDto {
  /** ใช้เฉพาะ GLOBAL admin ระบุบริษัทปลายทาง; company admin จะถูกล็อกเป็นบริษัทตน */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  code!: string;

  @IsString()
  nameTh!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateEmployeeTypeDto {
  @IsOptional()
  @IsString()
  nameTh?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus, { message: "สถานะไม่ถูกต้อง" })
  status?: MasterStatus;
}