/**
 * Leave type catalog — ประเภทการลามาตรฐาน "ค่าคงที่ของระบบ"
 * ---------------------------------------------------------------------------
 * ข้อมูลอ้างอิงจากเอกสารมาตรฐานการลา รหัสอ้างอิง 01–16
 *
 * รายการชุดนี้เป็นของระบบ ไม่ใช่ของบริษัทใด และไม่ใช่ข้อมูลที่ผู้ใช้สร้าง
 * บริษัทไหนจะใช้ประเภทไหนก็ไปกด "เปิดใช้" ที่หน้า ตั้งค่า > นโยบายการทำงาน > การลา
 * แล้วตั้งโควตา/เงื่อนไขของตัวเองได้อิสระ — บริษัทใหม่ที่เพิ่งสร้างจะเห็นตัวเลือก
 * ครบทุกประเภททันทีโดยไม่ต้องทำอะไรเพิ่ม
 *
 * ทำไมเป็นค่าคงที่ในโค้ด ไม่ใช่ seed
 * -----------------------------------
 * เดิมข้อมูลชุดนี้อยู่ในสคริปต์ seed แยกที่ต้องสั่งรันเอง และไม่เคยถูกเรียกจาก
 * seed ตัวหลักเลย ผลคือทุกครั้งที่ตั้งฐานข้อมูลใหม่หรือ reset ตาราง
 * `leave_type_catalog` จะว่างเปล่า หน้าตั้งค่านโยบายการลาขึ้น
 * "เปิดใช้ 0/0 · ไม่พบประเภทการลา" ทั้งที่บริษัทมีประเภทลาที่ใช้งานจริงอยู่
 *
 * ตอนนี้จึงประกาศไว้ในโค้ดแอป แล้วให้ `LeaveTypeCatalogBootstrapService`
 * ซิงก์ลงฐานข้อมูลตอนแอปบูตทุกครั้ง (ดู `services/leave-type-catalog-bootstrap.service.ts`)
 * ฐานข้อมูลเป็นแค่ที่เก็บสำเนา ไม่ใช่แหล่งความจริง — ต่อให้ถูกล้างก็กลับมาเองรอบถัดไป
 *
 * ตารางยังต้องมีอยู่เพราะ `LeaveType.catalogId` ของบริษัทเป็น foreign key ชี้มาที่นี่
 *
 * ถ้าจะเพิ่ม/แก้ประเภทลามาตรฐาน ให้แก้ที่ไฟล์นี้ที่เดียว แล้วรีสตาร์ตแอป
 */

export type LeaveTypeCatalogEntry = {
  referenceCode: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  /** รายการที่เอกสารตั้งไว้เป็น "ปิด" — ลงฐานข้อมูลเป็น INACTIVE */
  enabled: boolean;

  /** คอลัมน์ ลาล่วงหน้า / ลาย้อนหลัง / ลาติดต่อกันสูงสุด / จำนวนปีสะสม */
  advanceNoticeDays: number;
  maxBackdatedDays: number;
  maxConsecutiveDays: number | null;
  quotaAccrualYears: number;

  isPaid: boolean;
  /** คอลัมน์ ค่าปรับ : หักค่าจ้างกี่เท่าต่อวันลา */
  unpaidDeductionMultiplier: number;
  /** คอลัมน์ นำไปคำนวณ */
  includeInTax: boolean;
  includeInSocialSecurity: boolean;

  /** คอลัมน์ เงื่อนไข */
  enforceQuotaLimit: boolean;
  /**
   * เอกสารต้นฉบับระบุ "ปัดให้เต็มครึ่งชั่วโมงลา" ไว้หลายประเภท
   * แต่ seed ตั้งต้นเป็น NONE ทั้งหมดโดยตั้งใจ เพื่อให้ผลคำนวณเท่าระบบเดิม
   * ให้ HR ไปเปิดเองที่หน้า ตั้งค่า > นโยบายการทำงาน > การลา เมื่อพร้อม
   */
  roundingMode: 'NONE' | 'HALF_HOUR_UP' | 'HALF_DAY_UP';
  /** ลาครึ่งวัน/รายชั่วโมงได้หรือไม่ — ไม่ระบุ = ลาเป็นวันเท่านั้น */
  allowPartialDay?: boolean;
  genderEligibility: 'ALL' | 'MALE' | 'FEMALE';
  serviceStartBasis: 'HIRE_DATE' | 'PROBATION_PASS_DATE';
  /** ต้องผ่านการบรรจุก่อนถึงจะยื่นลาประเภทนี้ได้ — ไม่ระบุ = ไม่กั้น */
  requireProbationPassed?: boolean;
  prorateFirstYear: boolean;
  quotaDisplayUnit: 'DAY' | 'HOUR';
  includeHoliday: boolean;
  allowCarryForward: boolean;

  requiresAttachment: boolean;
  /** โควตาตั้งต้นของพนักงานรายเดือน (วัน) ใช้ตอนบริษัทกดเปิดใช้ */
  defaultAnnualQuotaDays: number;
  description: string | null;
};

/*
 * หมายเหตุความครบถ้วนของข้อมูลอ้างอิง
 *  - รหัส 09 ไม่ปรากฏในเอกสารต้นฉบับ จึงข้ามไป
 *  - รหัส 14 / 15 / 16 เป็นช่องว่างสำรอง seed เป็นรายการปิดไว้ให้ตั้งชื่อเองภายหลัง
 */
export const LEAVE_TYPE_CATALOG: LeaveTypeCatalogEntry[] = [
  {
    referenceCode: '01',
    code: 'PERSONAL_PAID',
    nameTh: 'ลากิจได้รับค่าจ้าง',
    nameEn: 'Leave with paid',
    enabled: true,
    advanceNoticeDays: 3,
    maxBackdatedDays: 0,
    maxConsecutiveDays: 1,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    allowPartialDay: true,
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: true,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 3,
    description: 'ลากิจโดยได้รับค่าจ้าง ต้องยื่นล่วงหน้าอย่างน้อย 3 วัน',
  },
  {
    referenceCode: '02',
    code: 'PERSONAL_UNPAID',
    nameTh: 'ลากิจไม่ได้รับค่าจ้าง',
    nameEn: 'Leave without paid',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: 1,
    quotaAccrualYears: 1,
    isPaid: false,
    unpaidDeductionMultiplier: 1,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    allowPartialDay: true,
    genderEligibility: 'ALL',
    serviceStartBasis: 'PROBATION_PASS_DATE',
    prorateFirstYear: true,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 7,
    description: 'ลากิจโดยไม่ได้รับค่าจ้าง หักค่าจ้าง 1 เท่าต่อวันลา',
  },
  {
    referenceCode: '03',
    code: 'SICK_CERTIFIED',
    nameTh: 'ลาป่วยมีใบรับรองแพทย์',
    nameEn: 'Medical Leave',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: 30,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    allowPartialDay: true,
    genderEligibility: 'ALL',
    serviceStartBasis: 'PROBATION_PASS_DATE',
    prorateFirstYear: true,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: true,
    defaultAnnualQuotaDays: 30,
    description: 'ลาป่วยพร้อมใบรับรองแพทย์ ลาติดต่อกันได้สูงสุด 30 วัน',
  },
  {
    referenceCode: '04',
    code: 'MATERNITY_PAID',
    nameTh: 'ลาคลอดได้รับค่าจ้าง',
    nameEn: 'Maternity Leave with paid',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: 45,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'FEMALE',
    serviceStartBasis: 'PROBATION_PASS_DATE',
    prorateFirstYear: true,
    quotaDisplayUnit: 'DAY',
    includeHoliday: true,
    allowCarryForward: false,
    requiresAttachment: true,
    defaultAnnualQuotaDays: 45,
    description: 'ลาคลอดช่วงที่ได้รับค่าจ้าง เฉพาะพนักงานหญิง',
  },
  {
    referenceCode: '05',
    code: 'MATERNITY_UNPAID',
    nameTh: 'ลาคลอดไม่ได้รับค่าจ้าง',
    nameEn: 'Maternity Leave without paid',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: 45,
    quotaAccrualYears: 1,
    isPaid: false,
    unpaidDeductionMultiplier: 1,
    includeInTax: true,
    includeInSocialSecurity: true,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'FEMALE',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: true,
    allowCarryForward: false,
    requiresAttachment: true,
    defaultAnnualQuotaDays: 60,
    description: 'ลาคลอดช่วงที่ไม่ได้รับค่าจ้าง นำไปคำนวณภาษีและประกันสังคม',
  },
  {
    referenceCode: '06',
    code: 'ANNUAL',
    nameTh: 'ลาพักร้อน',
    nameEn: 'Annual Leave',
    enabled: true,
    advanceNoticeDays: 1,
    maxBackdatedDays: 0,
    maxConsecutiveDays: 2,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    allowPartialDay: true,
    genderEligibility: 'ALL',
    serviceStartBasis: 'PROBATION_PASS_DATE',
    requireProbationPassed: true,
    prorateFirstYear: true,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: true,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 6,
    description: 'ลาพักร้อนประจำปี ได้สิทธิ์เมื่ออายุงานครบ 12 เดือน',
  },
  {
    referenceCode: '07',
    code: 'TRAINING',
    nameTh: 'ลาฝึกอบรม',
    nameEn: 'Training Leave',
    enabled: false,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: true,
    defaultAnnualQuotaDays: 0,
    description: 'ลาเพื่อฝึกอบรมหรือพัฒนาความรู้',
  },
  {
    referenceCode: '08',
    code: 'STERILIZATION',
    nameTh: 'ลาเพื่อทำหมัน',
    nameEn: 'Sterilization Leave',
    enabled: false,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: true,
    defaultAnnualQuotaDays: 0,
    description: 'ลาเพื่อทำหมันตามระยะเวลาที่แพทย์กำหนด',
  },
  {
    referenceCode: '10',
    code: 'FUNERAL',
    nameTh: 'การลาเพื่อจัดงานขาวดำ',
    nameEn: 'Funeral Leave',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: 3,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: true,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 3,
    description: 'ลาเพื่อจัดงานศพของบุคคลในครอบครัว',
  },
  {
    referenceCode: '11',
    code: 'SICK_UNPAID',
    nameTh: 'ลาป่วยไม่ได้รับค่าจ้าง',
    nameEn: 'Sick Leave without paid',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: false,
    unpaidDeductionMultiplier: 1,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'ALL',
    serviceStartBasis: 'PROBATION_PASS_DATE',
    prorateFirstYear: true,
    quotaDisplayUnit: 'DAY',
    includeHoliday: true,
    allowCarryForward: false,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 31,
    description:
      'ลาป่วยส่วนที่เกินสิทธิ์ได้รับค่าจ้าง หักค่าจ้าง 1 เท่าต่อวันลา',
  },
  {
    referenceCode: '12',
    code: 'ORDINATION_PAID',
    nameTh: 'ลาอุปสมบทได้รับค่าจ้าง',
    nameEn: 'Ordination Leave with paid',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: false,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'MALE',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: true,
    defaultAnnualQuotaDays: 7,
    description:
      'ลาอุปสมบทช่วงที่ได้รับค่าจ้าง เฉพาะพนักงานชาย อายุงานครบ 12 เดือน',
  },
  {
    referenceCode: '13',
    code: 'ORDINATION_UNPAID',
    nameTh: 'ลาอุปสมบทไม่ได้รับค่าจ้าง',
    nameEn: 'Ordination Leave without paid',
    enabled: true,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: false,
    unpaidDeductionMultiplier: 1,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'MALE',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: true,
    defaultAnnualQuotaDays: 8,
    description:
      'ลาอุปสมบทช่วงที่ไม่ได้รับค่าจ้าง เฉพาะพนักงานชาย อายุงานครบ 12 เดือน',
  },
  {
    referenceCode: '14',
    code: 'RESERVED_14',
    nameTh: 'ประเภทลาสำรอง 14',
    nameEn: null,
    enabled: false,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 0,
    description: 'ช่องสำรองสำหรับกำหนดประเภทลาเพิ่มเติม',
  },
  {
    referenceCode: '15',
    code: 'RESERVED_15',
    nameTh: 'ประเภทลาสำรอง 15',
    nameEn: null,
    enabled: false,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 0,
    description: 'ช่องสำรองสำหรับกำหนดประเภทลาเพิ่มเติม',
  },
  {
    referenceCode: '16',
    code: 'RESERVED_16',
    nameTh: 'ประเภทลาสำรอง 16',
    nameEn: null,
    enabled: false,
    advanceNoticeDays: 0,
    maxBackdatedDays: 0,
    maxConsecutiveDays: null,
    quotaAccrualYears: 1,
    isPaid: true,
    unpaidDeductionMultiplier: 0,
    includeInTax: true,
    includeInSocialSecurity: false,
    enforceQuotaLimit: true,
    roundingMode: 'NONE',
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    quotaDisplayUnit: 'DAY',
    includeHoliday: false,
    allowCarryForward: false,
    requiresAttachment: false,
    defaultAnnualQuotaDays: 0,
    description: 'ช่องสำรองสำหรับกำหนดประเภทลาเพิ่มเติม',
  },
];

/**
 * ประเภทลาที่บริษัทมีอยู่ก่อนจะมี catalog — ผูกกลับเข้ารายการมาตรฐานด้วย `code`
 *
 * ระบบเดิม seed ประเภทลาให้บริษัทด้วยรหัสสั้น ๆ (SICK / PERSONAL / ANNUAL ...)
 * ซึ่งไม่มี `catalogId` หน้าตั้งค่านโยบายการลาจึงมองไม่เห็นเลย และถ้าผู้ใช้ไปกด
 * "เปิดใช้" ในรายการมาตรฐาน ระบบจะสร้างประเภทใหม่ซ้อนขึ้นมาอีกใบ (`ANNUAL_2`)
 * แยกจากใบเดิมที่มีใบลาและโควตาผูกอยู่จริง
 *
 * ตารางนี้จึงจับคู่รหัสเดิม -> `referenceCode` ของรายการมาตรฐาน เพื่อผูกใบเดิม
 * เข้ากับ catalog แทนการสร้างใหม่ ข้อมูลใบลา/โควตาเดิมอยู่ครบเหมือนเดิม
 *
 * รหัสที่ไม่มีในตารางนี้ (เช่น OTHER) ถือเป็นประเภทที่บริษัทสร้างเอง ปล่อยไว้ตามเดิม
 */
export const LEGACY_LEAVE_CODE_TO_REFERENCE_CODE: Record<string, string> = {
  // รหัสเดิมของระบบ
  PERSONAL: '01',
  UNPAID: '02',
  SICK: '03',
  MATERNITY: '04',
  ANNUAL: '06',
  TRAINING: '07',
  FUNERAL: '10',
  ORDINATION: '12',

  // รหัสเดียวกับ catalog อยู่แล้ว — เผื่อกรณีที่ catalogId หลุดไป
  PERSONAL_PAID: '01',
  PERSONAL_UNPAID: '02',
  SICK_CERTIFIED: '03',
  MATERNITY_PAID: '04',
  MATERNITY_UNPAID: '05',
  STERILIZATION: '08',
  SICK_UNPAID: '11',
  ORDINATION_PAID: '12',
  ORDINATION_UNPAID: '13',
};
