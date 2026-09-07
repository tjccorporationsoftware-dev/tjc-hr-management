import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ListOrganizationCatalogQueryDto {
  /** บัญชี GLOBAL ต้องระบุบริษัทปลายทาง ส่วน COMPANY/BRANCH ระบบล็อกให้ตาม scope */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** กรองตามกลุ่มสายงาน — ใช้กับตำแหน่งเท่านั้น */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  /** "true" = เอาเฉพาะรายการที่บริษัทเปิดใช้แล้ว */
  @IsOptional()
  @IsIn(['true', 'false'])
  enabledOnly?: string;
}

export class ToggleOrganizationCatalogDto {
  @IsOptional()
  @IsString()
  companyId?: string;
}

/**
 * เปิดใช้หลายรายการในครั้งเดียว
 *
 * บริษัทเปิดใหม่ต้องติ๊กตำแหน่งเป็นสิบรายการ ถ้ายิงทีละใบจะช้าและพังกลางทางได้
 * ตัวนี้จึงรับเป็นชุดแล้วรายงานกลับว่าตัวไหนสำเร็จ ตัวไหนข้าม
 */
export class BulkToggleOrganizationCatalogDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Type(() => String)
  catalogIds!: string[];
}
