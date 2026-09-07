import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * ใบโยกย้าย/ปรับตำแหน่ง
 *
 * ช่องปลายทางทุกช่องเป็น optional — ส่งมาเฉพาะสิ่งที่เปลี่ยน
 * ส่งค่าว่าง ("") มาหมายถึง "ถอดออก" (เช่น ย้ายออกจากฝ่ายโดยไม่เข้าฝ่ายใหม่)
 * ไม่ส่งช่องนั้นมาเลย = ไม่เปลี่ยนค่านั้น
 */
export class CreateEmployeeTransferDto {
  @IsString()
  employeeId!: string;

  /** วันแรกที่ให้ถือว่าอยู่สังกัดใหม่ ตั้งล่วงหน้าได้ */
  @IsDateString({}, { message: 'วันที่มีผลไม่ถูกต้อง' })
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  toBranchId?: string;

  @IsOptional()
  @IsString()
  toDepartmentId?: string;

  @IsOptional()
  @IsString()
  toDivisionId?: string;

  @IsOptional()
  @IsString()
  toPositionId?: string;

  /** ชื่อตำแหน่งแบบข้อความ สำหรับบริษัทที่ยังไม่ได้ผูกทะเบียนตำแหน่ง */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  toPositionTitle?: string;

  @IsOptional()
  @IsString()
  toEmployeeTypeId?: string;

  @IsOptional()
  @IsString()
  toSupervisorId?: string;

  /** เลขที่คำสั่ง/บันทึกข้อความ ไว้อ้างอิงกับเอกสารตัวจริง */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
