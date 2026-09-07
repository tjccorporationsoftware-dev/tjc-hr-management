import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query ของปฏิทินพนักงานบนมือถือ
 *
 * แยกจาก EssScheduleQueryDto เพื่อให้ Mobile contract version ของตัวเองได้
 * โดยยังใช้กฎปี/เดือนเดียวกับ ESS เดิมทุกประการ
 */
export class MobileScheduleQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
