import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO สำหรับกดอนุมัติ/ไม่อนุมัติผ่าน Approval Center
 *
 * ใช้ร่วมกันทั้ง Leave / OT / Time Adjust
 * reason = เหตุผลหลักที่ผู้อนุมัติกรอก
 * note   = หมายเหตุเพิ่มเติมสำหรับบันทึกภายใน
 */
export class ApprovalActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
