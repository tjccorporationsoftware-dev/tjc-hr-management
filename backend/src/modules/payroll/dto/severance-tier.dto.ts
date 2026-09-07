import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * บันไดค่าชดเชยของบริษัท
 *
 * ระบบใช้ขั้นต่ำตามมาตรา 118 ให้อัตโนมัติเมื่อบริษัทยังไม่ได้ตั้งเอง
 * หน้านี้มีไว้สำหรับบริษัทที่จ่าย "มากกว่า" ที่กฎหมายกำหนด
 * จ่ายน้อยกว่าตั้งไม่ได้ ตัวตรวจฝั่งเซิร์ฟเวอร์จะปฏิเสธ
 */
export class SeveranceTierItemDto {
  /** อายุงานขั้นต่ำเป็นเดือนที่ได้ขั้นนี้ */
  @IsInt()
  @Min(0)
  // 600 เดือน = 50 ปี เกินอายุงานที่เป็นไปได้จริงของลูกจ้างคนหนึ่ง
  @Max(600)
  minServiceMonths!: number;

  /** จำนวนวันค่าจ้างที่ได้รับ */
  @IsInt()
  @Min(0)
  // 1,095 วัน = 3 ปีของค่าจ้าง เผื่อบริษัทที่ให้ดีกว่ากฎหมายมาก
  @Max(1095)
  payDays!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReplaceSeveranceTiersDto {
  /** ระบุเมื่อผู้ใช้มีสิทธิ์ข้ามบริษัท */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsArray()
  // 20 ขั้นเกินพอ — บันไดตามกฎหมายมี 6 ขั้น
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SeveranceTierItemDto)
  tiers!: SeveranceTierItemDto[];
}
