import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetUserPasswordDto {
  @IsString({ message: "รหัสผ่านต้องเป็นข้อความ" })
  @MinLength(10, { message: "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร" })
  @MaxLength(128, { message: "รหัสผ่านต้องไม่เกิน 128 ตัวอักษร" })
  newPassword!: string;
}
