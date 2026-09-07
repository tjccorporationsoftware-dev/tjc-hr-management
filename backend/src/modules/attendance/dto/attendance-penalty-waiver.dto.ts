import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * DTO สำหรับปุ่ม "ไม่หัก / หักตามเดิม" ค่าปรับลืมสแกนของวันนั้น
 * ------------------------------------------------------------
 * เป็นการตัดสินใจรายวันของ HR ไม่แตะข้อมูลต้นทาง
 * และต้องรอดจากการคำนวณใหม่ ตัวคำนวณจึงอ่านค่านี้กลับมาใส่ทุกครั้ง
 */
export class UpdateMissingLogPenaltyWaiverDto {
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  waived!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
