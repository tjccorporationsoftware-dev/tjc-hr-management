import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MOBILE_REQUEST_TYPES } from '../mappers/mobile-request.mapper';

const REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export class MobileRequestListQueryDto {
  /** ไม่ระบุ = รวมทุกประเภทในรายการเดียว ซึ่งเป็นค่าเริ่มต้นของแอป */
  @IsOptional()
  @IsIn(MOBILE_REQUEST_TYPES)
  type?: (typeof MOBILE_REQUEST_TYPES)[number];

  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: (typeof REQUEST_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class MobileCancelRequestDto {
  /**
   * เหตุผลที่ยกเลิก
   *
   * ไม่บังคับ เพราะการบังคับให้พิมพ์เหตุผลตอนยกเลิกใบของตัวเอง
   * ทำให้คนกดยกเลิกไม่ลงแล้วปล่อยใบค้างในคิวหัวหน้าแทน
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
