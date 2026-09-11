import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { MobileInstallationDto } from './mobile-installation.dto';
import { EmailField } from '../../../common/decorators/email-field.decorator';

/**
 * แอปรุ่นใหม่ส่ง `username` (รหัสพนักงาน หรืออีเมลของผู้ดูแล)
 * แอปรุ่นเก่ายังส่ง `email` — ต้องรับต่อไปจนกว่าผู้ใช้จะอัปเดตครบ
 */
export class MobileLoginDto {
  @ValidateIf((o: MobileLoginDto) => !o.email)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสพนักงาน' })
  @MaxLength(254)
  // ไม่ส่งมาเลยให้เป็นค่าว่าง จะได้ติดแค่ "กรุณากรอกรหัสพนักงาน" ไม่ใช่ error ทุกข้อพร้อมกัน
  username?: string = '';

  @ValidateIf((o: MobileLoginDto) => !o.username && typeof o.email === 'string')
  @EmailField()
  email?: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @ValidateNested()
  @Type(() => MobileInstallationDto)
  installation!: MobileInstallationDto;
}

export class MobileVerifyTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  twoFactorToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @ValidateNested()
  @Type(() => MobileInstallationDto)
  installation!: MobileInstallationDto;
}

export class MobileRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsString()
  @MaxLength(128)
  installationId!: string;
}

export class MobileLogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  installationId?: string;
}
