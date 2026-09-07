import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * รอบลงเวลาใช้ "คำเดียวกับ core" ตั้งใจไม่แปลงเป็น CHECK_IN/CHECK_OUT แบบ 2 ค่า
 * เพราะนโยบายจริงมีรอบเช้า/บ่ายแยกกัน ถ้า MobileModule ยุบเองจะกลายเป็นการ
 * ตัดสินใจเชิงธุรกิจใน adapter ซึ่ง ADR-001 ห้ามไว้
 */
const MOBILE_PUNCH_TYPES = [
  'MORNING_IN',
  'AFTERNOON_IN',
  'CHECK_OUT',
  'OFFSITE_IN',
  'OFFSITE_OUT',
  'CUSTOM',
] as const;

export type MobilePunchType = (typeof MOBILE_PUNCH_TYPES)[number];

export class MobilePunchClientDto {
  /** เวลาที่เครื่องจับได้ตอนกดปุ่ม — ใช้เป็นหลักฐาน ไม่ใช่เวลาที่บันทึกจริง */
  @IsISO8601()
  capturedAt!: string;

  /** เวลาที่เข้าคิว offline (ถ้ามี) */
  @IsOptional()
  @IsISO8601()
  queuedAt?: string;

  @IsString()
  @MaxLength(128)
  installationId!: string;
}

export class MobilePunchLocationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  /** สัญญาณว่าเครื่องอาจปลอมพิกัด — เก็บเป็น risk signal ไม่ใช่ตัวตัดสินเดียว */
  @IsOptional()
  @IsBoolean()
  isMockedSignal?: boolean;
}

export class MobilePunchDto {
  @IsOptional()
  @IsIn(MOBILE_PUNCH_TYPES)
  punchType?: MobilePunchType;

  @ValidateNested()
  @Type(() => MobilePunchClientDto)
  client!: MobilePunchClientDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobilePunchLocationDto)
  location?: MobilePunchLocationDto;

  @IsOptional()
  @IsString()
  offsiteRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MobileAttendanceHistoryQueryDto {
  /**
   * เดือนที่ต้องการดู รูปแบบ YYYY-MM
   *
   * บังคับเป็นเดือนแทน dateFrom/dateTo อิสระ เพราะหน้าจอมือถือดูทีละเดือน
   * และการเปิดช่วงอิสระให้ client กำหนดเองแปลว่าเครื่องเดียวขอทีละสามปีได้
   */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month ต้องอยู่ในรูปแบบ YYYY-MM',
  })
  month!: string;

  /**
   * นับช่วงยังไง — เดือนปฏิทิน (ค่าเริ่มต้น) หรือรอบเงินเดือนของบริษัท
   *
   * `payroll` = ใช้วันเริ่ม/วันตัดที่ตั้งไว้ใน CompanyPayrollSetting เช่นเริ่ม 26
   * ตัด 25 งวดสิงหาคมจะกิน 26 ก.ค.–25 ส.ค. — ตัวเลขที่ผู้ใช้เอาไปเทียบกับสลิป
   * ต้องนับตามนี้ ไม่งั้นจะไม่ตรงกันแล้วผู้ใช้สรุปว่าระบบคำนวณผิด
   *
   * ยังคงบังคับส่ง month มาเหมือนเดิม ไม่เปิดให้ client กำหนดช่วงเองอิสระ
   * (เหตุผลเดิม: กันเครื่องเดียวขอทีละสามปี)
   */
  @IsOptional()
  @IsIn(['calendar', 'payroll'])
  range?: 'calendar' | 'payroll';

  /**
   * วันอ้างอิงสำหรับ range=payroll — ใช้ตอบว่า "งวดที่ครอบวันนี้" คืองวดไหน
   *
   * จำเป็นเพราะงวดไม่ตรงกับเดือนปฏิทิน: บริษัทที่ตัดวันที่ 25 พอถึงวันที่ 26
   * สิงหาคม วันนั้นอยู่ในงวดกันยายนแล้ว ไม่ใช่งวดสิงหาคม ถ้าดูจากเลขเดือน
   * อย่างเดียวจะดึงงวดที่ไม่มีวันนี้อยู่ แล้วหน้าแรกจะไม่เห็นเวลาที่เพิ่งลงไป
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'anchorDate ต้องอยู่ในรูปแบบ YYYY-MM-DD',
  })
  anchorDate?: string;
}

export class MobilePunchContextQueryDto {
  @IsOptional()
  @IsIn(MOBILE_PUNCH_TYPES)
  punchType?: MobilePunchType;

  @IsOptional()
  @IsISO8601()
  punchedAt?: string;
}
