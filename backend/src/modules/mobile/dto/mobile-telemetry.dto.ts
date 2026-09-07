import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const MOBILE_TELEMETRY_LEVELS = [
  'debug',
  'info',
  'warning',
  'error',
] as const;

export type MobileTelemetryLevel = (typeof MOBILE_TELEMETRY_LEVELS)[number];

/** กันแบตช์ใหญ่เกินจนกลายเป็นช่องทางถล่ม log ของ server */
export const MOBILE_TELEMETRY_MAX_EVENTS = 50;

export class MobileTelemetryEventDto {
  @IsIn(MOBILE_TELEMETRY_LEVELS)
  level!: MobileTelemetryLevel;

  @IsString()
  @MaxLength(500)
  message!: string;

  @IsISO8601()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  route?: string;

  /**
   * บริบทเพิ่มเติมของเหตุการณ์
   *
   * ฝั่งแอป redact มาแล้วชั้นหนึ่ง แต่ server ยัง redact ซ้ำอีกชั้น
   * เพราะแอปเวอร์ชันเก่าที่ยังไม่ได้แก้ก็ยิงเข้ามาที่ endpoint เดียวกันนี้
   */
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class MobileTelemetryDto {
  @ArrayNotEmpty()
  @ArrayMaxSize(MOBILE_TELEMETRY_MAX_EVENTS)
  @ValidateNested({ each: true })
  @Type(() => MobileTelemetryEventDto)
  events!: MobileTelemetryEventDto[];
}
