import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RunLeaveCarryForwardDto {
  /** GLOBAL scope เท่านั้นที่ระบุบริษัทเองได้ */
  @IsOptional()
  @IsString()
  companyId?: string;

  /** ปีที่จะตัดยอดไปให้ปีถัดไป (เว้นว่าง = ปีที่แล้ว) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  fromYear?: number;

  @IsOptional()
  @IsString()
  employeeId?: string;

  /** true = คำนวณให้ดูอย่างเดียว ยังไม่เขียนข้อมูล */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class RunLeaveCarryForwardExpiryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  /** ปีของยอดสะสมที่จะตรวจว่าหมดอายุหรือยัง (เว้นว่าง = ปีนี้) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
