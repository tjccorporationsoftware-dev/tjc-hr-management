import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * สร้างยอดวันลาให้พนักงานหลายคนในครั้งเดียว
 *
 * ของเดิมสร้างได้ทีละคน และตัวที่เรียกจริงมีแค่ตอนพนักงานเปิดดูสิทธิ์ตัวเอง
 * ผลคือคนที่ยังไม่เคยล็อกอินจะไม่มียอดวันลาในระบบเลย HR มองไม่เห็นว่าใครมีสิทธิ์เท่าไร
 * และการแก้โควตาในหน้านโยบายก็ไม่ย้อนไปแก้ยอดที่สร้างไปแล้ว
 */
export class GenerateLeaveBalancesBulkDto {
  /**
   * ระบุตัวพนักงานเอง — ไม่ส่งมา = ทุกคนที่ยังทำงานอยู่ในขอบเขตของผู้ใช้
   *
   * จำกัดที่ 2000 คนต่อครั้ง เพราะงานนี้วนสร้างทีละคนแบบ synchronous
   * ถ้าองค์กรใหญ่กว่านี้ควรแบ่งยิงเป็นรอบ ไม่ใช่ปล่อยให้คำขอเดียวค้างยาว
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  employeeIds?: string[];

  /** จำกัดเฉพาะสาขา — ใช้ตอน HR ทำทีละสาขา */
  @IsOptional()
  @IsString()
  branchId?: string;

  /** จำกัดเฉพาะแผนก */
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  /**
   * เขียนทับสิทธิ์ที่คำนวณไว้เดิมด้วยค่าจากนโยบายปัจจุบัน
   *
   * **ระวัง** เปิดแล้วยอด "สิทธิ์ตามนโยบาย" ของทุกคนที่เลือกจะถูกคำนวณใหม่
   * ส่วนที่ HR ปรับเพิ่ม/ลดรายคนไว้ (adjustedDays) และวันที่ใช้ไปแล้วไม่ถูกแตะ
   * ไม่เปิด = เติมให้เฉพาะคนที่ยังไม่มียอด ของเดิมไม่ขยับ
   */
  @IsOptional()
  @IsBoolean()
  overwriteEntitlement?: boolean;
}
