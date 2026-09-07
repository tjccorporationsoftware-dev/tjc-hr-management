import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateOvertimeRequestDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsString()
  @IsNotEmpty()
  workDate!: string;

  /** รับได้ทั้ง datetime เต็ม (2026-07-15T18:00:00+07:00) และเวลาอย่างเดียว (18:00) */
  @IsString()
  @IsNotEmpty()
  startTime!: string;

  /** รับได้ทั้ง datetime เต็มและเวลาอย่างเดียว ดู startTime */
  @IsString()
  @IsNotEmpty()
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  /**
   * @deprecated ระบบจับประเภทวันจากปฏิทินวันหยุดเองแล้ว ค่านี้ถูกละทิ้ง
   * ยังรับไว้เพื่อไม่ให้ไคลเอนต์รุ่นเก่า (แอปมือถือ) ถูก validation ตีกลับ
   */
  @IsOptional()
  @IsIn(['WORKDAY', 'HOLIDAY', 'SPECIAL_HOLIDAY'])
  workType?: 'WORKDAY' | 'HOLIDAY' | 'SPECIAL_HOLIDAY';

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}