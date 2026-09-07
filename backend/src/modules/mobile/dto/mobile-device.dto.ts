import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { MobileInstallationDto } from './mobile-installation.dto';

const PUSH_PERMISSION_STATES = [
  'UNKNOWN',
  'GRANTED',
  'DENIED',
  'UNDETERMINED',
] as const;

export class MobileRegisterDeviceDto {
  @ValidateNested()
  @Type(() => MobileInstallationDto)
  installation!: MobileInstallationDto;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  expoPushToken?: string;

  @IsOptional()
  @IsIn(PUSH_PERMISSION_STATES)
  notificationPermission?: (typeof PUSH_PERMISSION_STATES)[number];
}

export class MobileUpdateCurrentDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  expoPushToken?: string;

  @IsOptional()
  @IsIn(PUSH_PERMISSION_STATES)
  notificationPermission?: (typeof PUSH_PERMISSION_STATES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
