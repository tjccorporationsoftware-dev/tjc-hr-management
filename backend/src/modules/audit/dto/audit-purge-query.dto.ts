import { Transform } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

/**
 * ล้างประวัติการใช้งานที่เก่ากว่า N วัน
 *
 * บังคับให้ส่ง olderThanDays มาเสมอ ไม่มีค่าเริ่มต้น — การลบทั้งตารางต้อง
 * ตั้งใจส่ง 0 มาเอง ไม่ใช่ลืมใส่พารามิเตอร์แล้วหายหมด
 */
export class AuditPurgeQueryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(3650)
  olderThanDays!: number;
}
