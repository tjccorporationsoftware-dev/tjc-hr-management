import { IsOptional, IsString } from 'class-validator';

/**
 * บริษัทปลายทางสำหรับการตั้งค่าระดับบริษัท
 *
 * ใช้เฉพาะบัญชีระดับ GLOBAL ที่ไม่ได้ผูกกับบริษัทใด บัญชีระดับ COMPANY/BRANCH
 * จะถูกล็อกเป็นบริษัทของตัวเองเสมอ ค่าที่ส่งมาจะไม่มีผล
 */
export class SystemSettingsScopeQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;
}

/**
 * เวอร์ชันที่ใช้กับ endpoint ซึ่งแบ่งหน้าด้วย
 *
 * ValidationPipe ตั้ง forbidNonWhitelisted ไว้ และ @Query() ตรวจ query ทั้งก้อน
 * ถ้าใช้ DTO ที่ไม่มี page/pageSize กับ endpoint ที่รับสองตัวนี้ จะถูกตีตกเป็น 400
 * ทั้งที่คำขอถูกต้อง จึงต้องประกาศให้ครบทุกพารามิเตอร์ที่ endpoint นั้นรับจริง
 */
export class SystemSettingsAuditQueryDto extends SystemSettingsScopeQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
