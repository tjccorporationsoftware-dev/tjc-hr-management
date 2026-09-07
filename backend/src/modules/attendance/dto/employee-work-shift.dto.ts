import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

/** ผูกพนักงานหลายคนเข้ากะเดียวกันในครั้งเดียว */
export class AssignEmployeeWorkShiftDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  employeeIds!: string[];

  /** เว้นว่าง = เริ่มมีผลวันนี้ */
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  /** เว้นว่าง = ไม่มีวันสิ้นสุด */
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class ListEmployeeWorkShiftsQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** ASSIGNED = เฉพาะคนที่ถูกผูกกะแล้ว / UNASSIGNED = คนที่ยังใช้กะตามสาขา */
  @IsOptional()
  @IsIn(['ALL', 'ASSIGNED', 'UNASSIGNED'])
  assignment?: 'ALL' | 'ASSIGNED' | 'UNASSIGNED';
}

/**
 * ตั้งการยกเว้นการลงเวลาให้พนักงานหลายคนพร้อมกัน
 *
 * ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน — ฟิลด์ที่ไม่ส่งมาจะคงค่าเดิมไว้
 * เพื่อให้หน้าเว็บติ๊กทีละเรื่องได้โดยไม่เผลอล้างอีกเรื่องทิ้ง
 */
export class UpdateEmployeeAttendanceExemptionDto {
  @IsArray()
  @IsString({ each: true })
  employeeIds!: string[];

  /** false = ไม่ต้องลงเวลาเข้าออกเลย (ผู้บริหาร / เหมาจ่าย) */
  @IsOptional()
  @IsBoolean()
  trackingRequired?: boolean;

  /** ช่วงที่ยกเว้น เช่น ['AFTERNOON_IN'] = ไม่ต้องกดเข้างานบ่าย */
  @IsOptional()
  @IsArray()
  @IsIn(['MORNING_IN', 'AFTERNOON_IN', 'CHECK_OUT'], { each: true })
  exemptSessions?: string[];
}
