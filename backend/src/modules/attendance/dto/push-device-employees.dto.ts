import { ArrayMaxSize, IsArray, IsOptional, IsString } from "class-validator";

/**
 * ส่งทะเบียนพนักงานลงเครื่องสแกน
 *
 * ไม่ส่ง employeeIds มา = ทั้งสาขาที่เครื่องสังกัดอยู่
 * ส่งมา = เฉพาะคนที่เลือก (ยังต้องอยู่ในขอบเขตของผู้สั่งอยู่ดี)
 */
export class PushDeviceEmployeesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  employeeIds?: string[];
}
