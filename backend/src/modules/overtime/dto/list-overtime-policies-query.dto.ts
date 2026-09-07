import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListOvertimePoliciesQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsIn(['WORKDAY', 'HOLIDAY', 'SPECIAL_HOLIDAY'])
  workType?: 'WORKDAY' | 'HOLIDAY' | 'SPECIAL_HOLIDAY';

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  search?: string;

  /*
   * endpoint นี้คืนทั้งหมดในครั้งเดียว ไม่ได้แบ่งหน้า
   * แต่ยอมรับ page / pageSize ไว้เพื่อไม่ให้ client ที่ส่งมาตามแบบ endpoint อื่น
   * ถูกปฏิเสธด้วย "property pageSize should not exist"
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number;
}
