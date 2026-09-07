import { IsEnum, IsOptional, IsString } from "class-validator";
import { MasterStatus } from "../../../generated/prisma/client";

export class CreateDivisionDto {
  @IsString()
  departmentId!: string;

  @IsString()
  code!: string;

  @IsString()
  nameTh!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;
}

export class UpdateDivisionDto {
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