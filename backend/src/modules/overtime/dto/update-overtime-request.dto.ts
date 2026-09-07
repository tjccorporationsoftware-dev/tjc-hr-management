import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateOvertimeRequestDto {
  @IsOptional()
  @IsString()
  workDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

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

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string | null;
}