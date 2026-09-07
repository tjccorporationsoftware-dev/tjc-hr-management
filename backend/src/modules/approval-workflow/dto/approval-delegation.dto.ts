import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { SUPPORTED_APPROVAL_TARGET_TYPES } from '../utils/supported-target-types.util';

export class CreateApprovalDelegationDto {
  /** ระบุเมื่อผู้ใช้มีสิทธิ์ข้ามบริษัท */
  @IsOptional()
  @IsString()
  companyId?: string;

  /** ผู้อนุมัติตัวจริงที่ไม่อยู่ */
  @IsString()
  delegatorUserId!: string;

  /** ผู้ที่กดแทนได้ในช่วงเวลานี้ */
  @IsString()
  delegateUserId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  /** ว่าง = มอบอำนาจทุกประเภทที่ระบบรองรับ */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SUPPORTED_APPROVAL_TARGET_TYPES.length)
  @IsIn([...SUPPORTED_APPROVAL_TARGET_TYPES], { each: true })
  targetTypes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListApprovalDelegationsQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  /** true = เอาเฉพาะใบที่ยังมีผลวันนี้ */
  @IsOptional()
  @IsString()
  activeOnly?: string;
}
