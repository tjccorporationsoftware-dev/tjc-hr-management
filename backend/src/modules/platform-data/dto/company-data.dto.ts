import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
} from "class-validator";

export class CompanyDataListQueryDto {
  @IsString()
  companyId!: string;

  @IsString()
  dataset!: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class DeleteCompanyDataDto {
  @IsString()
  companyId!: string;

  @IsString()
  dataset!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}

export class PurgeCompanyDataDto {
  @IsString()
  companyId!: string;

  @IsString()
  dataset!: string;

  /** ต้องพิมพ์ชื่อบริษัท (ภาษาไทย) ให้ตรงเพื่อยืนยัน */
  @IsString()
  confirmName!: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
