import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { MOBILE_PLATFORMS, type MobilePlatform } from '../mobile.constants';

/**
 * ข้อมูลเครื่องที่แอปส่งมาตอน login/refresh/ลงทะเบียนเครื่อง
 * เก็บเป็น metadata อย่างเดียว ไม่มีผลต่อสิทธิ์การเข้าถึงข้อมูล
 */
export class MobileInstallationDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  installationId!: string;

  @IsIn(MOBILE_PLATFORMS)
  platform!: MobilePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  appBuild?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
