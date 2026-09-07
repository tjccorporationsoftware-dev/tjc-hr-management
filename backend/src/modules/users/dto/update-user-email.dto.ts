import { IsBoolean, IsOptional, MaxLength } from "class-validator";
import { EmailField } from '../../../common/decorators/email-field.decorator';

export class UpdateUserEmailDto {
  @EmailField('รูปแบบอีเมลไม่ถูกต้อง')
  @MaxLength(190, { message: "อีเมลต้องไม่เกิน 190 ตัวอักษร" })
  email!: string;

  @IsOptional()
  @IsBoolean({ message: "syncEmployeeEmail ต้องเป็น true หรือ false" })
  syncEmployeeEmail?: boolean;
}
