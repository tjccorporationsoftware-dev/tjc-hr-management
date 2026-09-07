import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListDocumentRequestsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  /** กรองตามสาขาของพนักงานเจ้าของเรื่อง — ผู้ใช้ scope ระดับสาขาใช้ไม่ได้ (เห็นสาขาตัวเองอยู่แล้ว) */
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  documentTypeId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}