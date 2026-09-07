import { IsOptional, IsString } from 'class-validator';

/** สั่งกางเช็กลิสต์ทั้งชุดเป็นงานต้อนรับให้พนักงานคนหนึ่ง */
export class ApplyOnboardingChecklistDto {
  @IsString()
  employeeId!: string;

  /** วันครบกำหนดของทุกงานที่สร้าง (ไม่ระบุ = ไม่ตั้งกำหนด) */
  @IsOptional()
  @IsString()
  dueDate?: string;
}
