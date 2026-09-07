import { IsNotEmpty, IsString, MinLength } from "class-validator";
import { EmailField } from '../../../common/decorators/email-field.decorator';

export class LoginDto {
  @EmailField('รูปแบบอีเมลไม่ถูกต้อง')
  email!: string;

  @IsString()
  @IsNotEmpty({ message: "กรุณากรอกรหัสผ่าน" })
  @MinLength(8, { message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" })
  password!: string;
}