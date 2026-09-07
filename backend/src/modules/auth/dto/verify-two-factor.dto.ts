import { IsNotEmpty, IsString, Matches } from "class-validator";

export class VerifyTwoFactorDto {
  @IsString()
  @IsNotEmpty({ message: "ไม่พบ Token สำหรับยืนยัน 2FA" })
  twoFactorToken!: string;

  @IsString()
  @IsNotEmpty({ message: "กรุณากรอกรหัสยืนยัน 2FA" })
  @Matches(/^\d{6}$/, {
    message: "รหัสยืนยัน 2FA ต้องเป็นตัวเลข 6 หลัก",
  })
  code!: string;
}