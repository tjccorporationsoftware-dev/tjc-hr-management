import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EmployeeStatus } from '../../../generated/prisma/client';

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  /**
   * true = เอาคนที่พ้นสภาพแล้วมาแสดงด้วย (ลาออก / เลิกจ้าง / ปิดใช้งาน)
   *
   * ค่าเริ่มต้นคือไม่เอา เพราะทะเบียนพนักงานถูกเปิดเพื่อดูคนที่ทำงานอยู่เป็นหลัก
   * คนที่ออกไปแล้วยังค้นเจอได้ด้วยการเลือกสถานะนั้นตรง ๆ หรือกดดูทุกสถานะ
   * ไม่มีผลเมื่อระบุ status มาเจาะจง — ค่าที่ระบุชนะเสมอ
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeFormerEmployees?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
