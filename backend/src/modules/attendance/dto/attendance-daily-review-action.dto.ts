import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * DTO สำหรับ action ของ HR Daily Review
 * -----------------------------------
 * ใช้กับปุ่ม Mark Reviewed / Ready for Payroll / Lock Day
 * โดยยังไม่เปลี่ยนข้อมูลต้นทาง เช่น AttendanceLog, LeaveRequest, OT
 */
export class AttendanceDailyReviewActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class BulkAttendanceDailyReviewActionDto extends AttendanceDailyReviewActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
