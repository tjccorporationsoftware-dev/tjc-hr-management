import { IsEnum, IsOptional, IsString } from "class-validator";
import { MasterStatus } from "../../../generated/prisma/client";

export class CreateDepartmentDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsString()
  code!: string;

  @IsString()
  nameTh!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  branchId?: string;

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