import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { UserStatus } from "../../../generated/prisma/client";

export class UpdateUserDto {
  /**
   * ชื่อที่แสดงของบัญชี
   * บัญชีผู้ดูแลบริษัทไม่ได้ผูกพนักงาน จึงไม่มีชื่อจากแฟ้มพนักงานให้ดึง
   * ถ้าแก้ไม่ได้ก็ตั้งชื่อผิดแล้วแก้ไม่ได้เลย
   */
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(UserStatus, { message: "สถานะผู้ใช้งานไม่ถูกต้อง" })
  status?: UserStatus;

  /** เปลี่ยน tenant scope ของผู้ใช้ (ต้องอยู่ในลำดับชั้นของผู้แก้ไข) */
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