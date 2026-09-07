import { IsString, MaxLength, MinLength } from "class-validator";

/**
 * เปลี่ยนรหัสผ่านด้วยตัวเอง
 * ต้องยืนยันรหัสเดิมเสมอ กันกรณีมีคนมาใช้เครื่องที่เปิดค้างไว้แล้วยึดบัญชี
 */
export class ChangeOwnPasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: "รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร" })
  @MaxLength(128, { message: "รหัสผ่านต้องไม่เกิน 128 ตัวอักษร" })
  newPassword!: string;
}
