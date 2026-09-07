import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EmployeeTransferStatus } from '../../../generated/prisma/client';

export class ListEmployeeTransfersQueryDto {
  /** ค้นจากชื่อ/รหัสพนักงาน หรือเลขที่คำสั่ง */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  /** กรองใบที่เกี่ยวข้องกับสาขานี้ ทั้งสาขาต้นทางและปลายทาง */
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsEnum(EmployeeTransferStatus)
  status?: EmployeeTransferStatus;

  /** ช่วงวันที่มีผล */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

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
