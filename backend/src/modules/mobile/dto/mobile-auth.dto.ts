import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { MobileInstallationDto } from './mobile-installation.dto';
import { EmailField } from '../../../common/decorators/email-field.decorator';

export class MobileLoginDto {
  @EmailField()
  email!: string;

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
