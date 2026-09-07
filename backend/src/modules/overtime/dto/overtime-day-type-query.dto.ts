import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** ถามระบบว่าวันที่นี้เป็นวันประเภทไหนตามปฏิทินวันหยุด ก่อนจะยื่นใบ OT */
export class OvertimeDayTypeQueryDto {
  @IsString()
  @IsNotEmpty()
  workDate!: string;

  /** ฝั่ง HR ยื่นแทนพนักงานคนอื่นได้ ฝั่ง ESS ไม่ต้องส่ง */
  @IsOptional()
  @IsString()
  employeeId?: string;
}
