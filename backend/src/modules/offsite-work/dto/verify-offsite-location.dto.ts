import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * ชื่อ DTO เดิมคงไว้เพื่อไม่ให้ API เก่าพัง แต่ปัจจุบันตรวจเฉพาะ
 * เจ้าของคำขอ วันที่ สถานะอนุมัติ และช่วงเวลา โดยไม่ตรวจ GPS/รัศมี
 */
export class VerifyOffsiteLocationDto {
  @IsString()
  offsiteRequestId!: string;

  @IsOptional()
  @IsDateString()
  punchedAt?: string;
}
