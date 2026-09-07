/**
 * รายการตำแหน่งมาตรฐานของระบบ
 * -----------------------------------------------------------------------------
 * นี่คือ "แหล่งความจริง" ของตำแหน่งมาตรฐาน ไม่ใช่ข้อมูล seed
 * OrganizationCatalogBootstrapService จะซิงก์ลงตาราง `position_catalog` ทุกครั้งที่บูต
 *
 * บริษัทไม่ได้ใช้แถวพวกนี้โดยตรง — กด "เปิดใช้" แล้วระบบจะคัดลอกเป็น Position
 * ของบริษัทนั้น (ผูกกลับด้วย catalogId) จากนั้นบริษัทแก้ชื่อ/ระดับ/ลำดับต่อได้เอง
 * โดยไม่กระทบบริษัทอื่น
 *
 * แก้รายการที่ไฟล์นี้ที่เดียว รีสตาร์ตแล้วมีผลทั้งระบบ
 *
 * กติกา
 *  - `referenceCode` ห้ามเปลี่ยนหลังปล่อยใช้ เพราะเป็นกุญแจจับคู่ตอนซิงก์
 *    (จะเรียงใหม่/เพิ่มแทรกกลางก็ได้ ขอแค่รหัสเดิมยังชี้ของเดิม)
 *  - `code` คือรหัสตั้งต้นที่บริษัทจะได้ ถ้าชนกับของเดิมระบบจะเติมเลขท้ายให้
 *  - `level` 1 = สูงสุด ไล่ลงถึง 9 ตรงกับตัวเลือก "ระดับตำแหน่ง" ในฟอร์ม
 */

/** กลุ่มสายงาน — ใช้จัดหมวดในหน้าเลือก */
export const POSITION_CATEGORIES = {
  GENERAL: 'ทั่วไป (ทุกสายงาน)',
  EXECUTIVE: 'ผู้บริหาร',
  HR: 'ทรัพยากรบุคคล',
  ACCOUNTING: 'บัญชีและการเงิน',
  SALES: 'ขายและการตลาด',
  IT: 'เทคโนโลยีสารสนเทศ',
  OPERATION: 'ปฏิบัติการและคลังสินค้า',
  SUPPORT: 'ธุรการและสนับสนุน',
} as const;

export type PositionCategory = keyof typeof POSITION_CATEGORIES;

export type PositionCatalogEntry = {
  referenceCode: string;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  level: number;
  category: PositionCategory;
};

export const POSITION_CATALOG: PositionCatalogEntry[] = [
  /* ---- ผู้บริหาร (ระดับ 1-3) ---- */
  {
    referenceCode: 'P01',
    code: 'PRESIDENT',
    nameTh: 'ประธานกรรมการ',
    nameEn: 'President',
    description: 'ผู้บริหารสูงสุดขององค์กร',
    level: 1,
    category: 'EXECUTIVE',
  },
  {
    referenceCode: 'P02',
    code: 'MANAGING_DIRECTOR',
    nameTh: 'กรรมการผู้จัดการ',
    nameEn: 'Managing Director',
    description: 'รับผิดชอบผลประกอบการและทิศทางธุรกิจโดยรวม',
    level: 1,
    category: 'EXECUTIVE',
  },
  {
    referenceCode: 'P03',
    code: 'DEPUTY_MANAGING_DIRECTOR',
    nameTh: 'รองกรรมการผู้จัดการ',
    nameEn: 'Deputy Managing Director',
    description: 'รองจากกรรมการผู้จัดการ ดูแลกลุ่มสายงานที่ได้รับมอบหมาย',
    level: 2,
    category: 'EXECUTIVE',
  },
  {
    referenceCode: 'P04',
    code: 'EXECUTIVE',
    nameTh: 'ผู้บริหารระดับสูง',
    nameEn: 'Executive',
    description: 'ผู้บริหารที่ดูแลภาพรวมหลายสายงาน',
    level: 2,
    category: 'EXECUTIVE',
  },
  {
    referenceCode: 'P05',
    code: 'DIRECTOR',
    nameTh: 'ผู้อำนวยการ',
    nameEn: 'Director',
    description: 'กำกับดูแลหลายฝ่ายหรือหลายแผนก',
    level: 3,
    category: 'EXECUTIVE',
  },
  {
    referenceCode: 'P06',
    code: 'ASSISTANT_DIRECTOR',
    nameTh: 'ผู้ช่วยผู้อำนวยการ',
    nameEn: 'Assistant Director',
    description: 'ช่วยผู้อำนวยการกำกับดูแลงานในสายงาน',
    level: 3,
    category: 'EXECUTIVE',
  },

  /* ---- ทั่วไป ใช้ได้ทุกสายงาน (ระดับ 4-9) ---- */
  {
    referenceCode: 'P07',
    code: 'MANAGER',
    nameTh: 'ผู้จัดการ',
    nameEn: 'Manager',
    description: 'ผู้จัดการประจำแผนกหรือหน่วยธุรกิจ',
    level: 4,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P08',
    code: 'ASSISTANT_MANAGER',
    nameTh: 'ผู้ช่วยผู้จัดการ',
    nameEn: 'Assistant Manager',
    description: 'ช่วยผู้จัดการดูแลงานประจำวันของแผนก',
    level: 4,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P09',
    code: 'SUPERVISOR',
    nameTh: 'หัวหน้างาน',
    nameEn: 'Supervisor',
    description: 'ควบคุมงานประจำวันและดูแลทีมหน้างาน',
    level: 5,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P10',
    code: 'TEAM_LEAD',
    nameTh: 'หัวหน้าทีม',
    nameEn: 'Team Lead',
    description: 'นำทีมย่อยและกระจายงานภายในทีม',
    level: 5,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P11',
    code: 'SENIOR_OFFICER',
    nameTh: 'เจ้าหน้าที่อาวุโส',
    nameEn: 'Senior Officer',
    description: 'เจ้าหน้าที่ที่มีประสบการณ์ รับงานที่ต้องใช้ดุลพินิจ',
    level: 6,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P12',
    code: 'OFFICER',
    nameTh: 'เจ้าหน้าที่',
    nameEn: 'Officer',
    description: 'เจ้าหน้าที่ปฏิบัติงานประจำ',
    level: 7,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P13',
    code: 'STAFF',
    nameTh: 'พนักงาน',
    nameEn: 'Staff',
    description: 'พนักงานทั่วไป',
    level: 7,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P14',
    code: 'OPERATOR',
    nameTh: 'พนักงานปฏิบัติการ',
    nameEn: 'Operator',
    description: 'พนักงานหน้างาน ปฏิบัติงานตามขั้นตอนที่กำหนด',
    level: 8,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P15',
    code: 'INTERN',
    nameTh: 'นักศึกษาฝึกงาน',
    nameEn: 'Intern',
    description: 'นักศึกษาฝึกงานตามระยะเวลาที่ตกลง',
    level: 9,
    category: 'GENERAL',
  },
  {
    referenceCode: 'P16',
    code: 'TEMPORARY',
    nameTh: 'พนักงานชั่วคราว',
    nameEn: 'Temporary Staff',
    description: 'พนักงานชั่วคราวหรือจ้างเหมาตามช่วงงาน',
    level: 9,
    category: 'GENERAL',
  },

  /* ---- ทรัพยากรบุคคล ---- */
  {
    referenceCode: 'P17',
    code: 'HR_MANAGER',
    nameTh: 'ผู้จัดการฝ่ายทรัพยากรบุคคล',
    nameEn: 'HR Manager',
    description: 'ดูแลระบบงานบุคคลทั้งหมดขององค์กร',
    level: 4,
    category: 'HR',
  },
  {
    referenceCode: 'P18',
    code: 'HR_SUPERVISOR',
    nameTh: 'หัวหน้าแผนกทรัพยากรบุคคล',
    nameEn: 'HR Supervisor',
    description: 'ควบคุมงานสรรหา ค่าจ้าง และแรงงานสัมพันธ์',
    level: 5,
    category: 'HR',
  },
  {
    referenceCode: 'P19',
    code: 'HR_OFFICER',
    nameTh: 'เจ้าหน้าที่ทรัพยากรบุคคล',
    nameEn: 'HR Officer',
    description: 'งานบุคคลทั่วไป ทะเบียนพนักงาน สวัสดิการ',
    level: 6,
    category: 'HR',
  },
  {
    referenceCode: 'P20',
    code: 'RECRUITER',
    nameTh: 'เจ้าหน้าที่สรรหาว่าจ้าง',
    nameEn: 'Recruiter',
    description: 'สรรหา คัดเลือก และประสานงานผู้สมัคร',
    level: 6,
    category: 'HR',
  },
  {
    referenceCode: 'P21',
    code: 'PAYROLL_OFFICER',
    nameTh: 'เจ้าหน้าที่เงินเดือน',
    nameEn: 'Payroll Officer',
    description: 'คำนวณเงินเดือน ภาษี และนำส่งประกันสังคม',
    level: 6,
    category: 'HR',
  },

  /* ---- บัญชีและการเงิน ---- */
  {
    referenceCode: 'P22',
    code: 'ACCOUNTING_MANAGER',
    nameTh: 'ผู้จัดการฝ่ายบัญชีและการเงิน',
    nameEn: 'Accounting Manager',
    description: 'ดูแลงานบัญชี การเงิน และงบการเงิน',
    level: 4,
    category: 'ACCOUNTING',
  },
  {
    referenceCode: 'P23',
    code: 'ACCOUNTING_SUPERVISOR',
    nameTh: 'หัวหน้าแผนกบัญชี',
    nameEn: 'Accounting Supervisor',
    description: 'ควบคุมงานบัญชีรับ-จ่ายและปิดงบประจำงวด',
    level: 5,
    category: 'ACCOUNTING',
  },
  {
    referenceCode: 'P24',
    code: 'ACCOUNTING_OFFICER',
    nameTh: 'เจ้าหน้าที่บัญชี',
    nameEn: 'Accounting Officer',
    description: 'บันทึกบัญชีและจัดทำเอกสารทางบัญชี',
    level: 6,
    category: 'ACCOUNTING',
  },
  {
    referenceCode: 'P25',
    code: 'FINANCE_OFFICER',
    nameTh: 'เจ้าหน้าที่การเงิน',
    nameEn: 'Finance Officer',
    description: 'ดูแลรับ-จ่ายเงิน กระแสเงินสด และธุรกรรมธนาคาร',
    level: 6,
    category: 'ACCOUNTING',
  },
  {
    referenceCode: 'P26',
    code: 'CASHIER',
    nameTh: 'พนักงานการเงิน / แคชเชียร์',
    nameEn: 'Cashier',
    description: 'รับชำระเงินและสรุปยอดประจำวัน',
    level: 7,
    category: 'ACCOUNTING',
  },

  /* ---- ขายและการตลาด ---- */
  {
    referenceCode: 'P27',
    code: 'SALES_MANAGER',
    nameTh: 'ผู้จัดการฝ่ายขาย',
    nameEn: 'Sales Manager',
    description: 'รับผิดชอบเป้าขายและทีมขาย',
    level: 4,
    category: 'SALES',
  },
  {
    referenceCode: 'P28',
    code: 'SALES_SUPERVISOR',
    nameTh: 'หัวหน้าแผนกขาย',
    nameEn: 'Sales Supervisor',
    description: 'ควบคุมทีมขายและติดตามยอดขายรายพื้นที่',
    level: 5,
    category: 'SALES',
  },
  {
    referenceCode: 'P29',
    code: 'SALES_OFFICER',
    nameTh: 'เจ้าหน้าที่ขาย',
    nameEn: 'Sales Officer',
    description: 'ดูแลลูกค้าและปิดการขายตามเป้าหมาย',
    level: 6,
    category: 'SALES',
  },
  {
    referenceCode: 'P30',
    code: 'MARKETING_OFFICER',
    nameTh: 'เจ้าหน้าที่การตลาด',
    nameEn: 'Marketing Officer',
    description: 'วางแผนและดำเนินกิจกรรมการตลาด',
    level: 6,
    category: 'SALES',
  },
  {
    referenceCode: 'P31',
    code: 'CUSTOMER_SERVICE',
    nameTh: 'เจ้าหน้าที่บริการลูกค้า',
    nameEn: 'Customer Service Officer',
    description: 'รับเรื่องและดูแลลูกค้าหลังการขาย',
    level: 7,
    category: 'SALES',
  },

  /* ---- เทคโนโลยีสารสนเทศ ---- */
  {
    referenceCode: 'P32',
    code: 'IT_MANAGER',
    nameTh: 'ผู้จัดการฝ่ายเทคโนโลยีสารสนเทศ',
    nameEn: 'IT Manager',
    description: 'ดูแลระบบสารสนเทศและโครงสร้างพื้นฐานไอที',
    level: 4,
    category: 'IT',
  },
  {
    referenceCode: 'P33',
    code: 'IT_DEVELOPER',
    nameTh: 'นักพัฒนาระบบ',
    nameEn: 'Software Developer',
    description: 'พัฒนาและดูแลซอฟต์แวร์ภายในองค์กร',
    level: 6,
    category: 'IT',
  },
  {
    referenceCode: 'P34',
    code: 'IT_SUPPORT',
    nameTh: 'เจ้าหน้าที่สนับสนุนไอที',
    nameEn: 'IT Support',
    description: 'ดูแลอุปกรณ์และแก้ปัญหาการใช้งานให้ผู้ใช้',
    level: 7,
    category: 'IT',
  },
  {
    referenceCode: 'P35',
    code: 'DATA_ANALYST',
    nameTh: 'นักวิเคราะห์ข้อมูล',
    nameEn: 'Data Analyst',
    description: 'วิเคราะห์ข้อมูลและจัดทำรายงานเชิงบริหาร',
    level: 6,
    category: 'IT',
  },

  /* ---- ปฏิบัติการและคลังสินค้า ---- */
  {
    referenceCode: 'P36',
    code: 'OPERATION_MANAGER',
    nameTh: 'ผู้จัดการฝ่ายปฏิบัติการ',
    nameEn: 'Operation Manager',
    description: 'ดูแลงานปฏิบัติการและประสิทธิภาพการผลิต/บริการ',
    level: 4,
    category: 'OPERATION',
  },
  {
    referenceCode: 'P37',
    code: 'WAREHOUSE_SUPERVISOR',
    nameTh: 'หัวหน้าคลังสินค้า',
    nameEn: 'Warehouse Supervisor',
    description: 'ควบคุมการรับ-จ่ายสินค้าและสต๊อกคงคลัง',
    level: 5,
    category: 'OPERATION',
  },
  {
    referenceCode: 'P38',
    code: 'WAREHOUSE_STAFF',
    nameTh: 'พนักงานคลังสินค้า',
    nameEn: 'Warehouse Staff',
    description: 'จัดเก็บ เบิกจ่าย และตรวจนับสินค้า',
    level: 8,
    category: 'OPERATION',
  },
  {
    referenceCode: 'P39',
    code: 'DRIVER',
    nameTh: 'พนักงานขับรถ',
    nameEn: 'Driver',
    description: 'ขับรถส่งสินค้าหรือรับส่งผู้บริหาร',
    level: 8,
    category: 'OPERATION',
  },
  {
    referenceCode: 'P40',
    code: 'TECHNICIAN',
    nameTh: 'ช่างเทคนิค',
    nameEn: 'Technician',
    description: 'ซ่อมบำรุงเครื่องจักรและอุปกรณ์',
    level: 7,
    category: 'OPERATION',
  },

  /* ---- ธุรการและสนับสนุน ---- */
  {
    referenceCode: 'P41',
    code: 'ADMIN_OFFICER',
    nameTh: 'เจ้าหน้าที่ธุรการ',
    nameEn: 'Admin Officer',
    description: 'งานธุรการทั่วไปและงานเอกสารของสำนักงาน',
    level: 7,
    category: 'SUPPORT',
  },
  {
    referenceCode: 'P42',
    code: 'PURCHASING_OFFICER',
    nameTh: 'เจ้าหน้าที่จัดซื้อ',
    nameEn: 'Purchasing Officer',
    description: 'จัดซื้อและประสานงานคู่ค้า',
    level: 6,
    category: 'SUPPORT',
  },
  {
    referenceCode: 'P43',
    code: 'SECRETARY',
    nameTh: 'เลขานุการ',
    nameEn: 'Secretary',
    description: 'สนับสนุนงานผู้บริหารและจัดตารางนัดหมาย',
    level: 6,
    category: 'SUPPORT',
  },
  {
    referenceCode: 'P44',
    code: 'SECURITY',
    nameTh: 'พนักงานรักษาความปลอดภัย',
    nameEn: 'Security Guard',
    description: 'ดูแลความปลอดภัยของสถานประกอบการ',
    level: 8,
    category: 'SUPPORT',
  },
  {
    referenceCode: 'P45',
    code: 'HOUSEKEEPER',
    nameTh: 'แม่บ้าน',
    nameEn: 'Housekeeper',
    description: 'ดูแลความสะอาดของสถานที่ทำงาน',
    level: 8,
    category: 'SUPPORT',
  },
];

/**
 * จับคู่รหัสตำแหน่งเดิมที่เคยใช้ก่อนมี catalog เข้ากับ referenceCode
 *
 * ใช้ตอนบูตครั้งแรกเพื่อผูกตำแหน่งที่บริษัทมีอยู่แล้วเข้ากับรายการมาตรฐาน
 * โดยไม่แตะชื่อหรือข้อมูลเดิม — รหัสไหนไม่มีในนี้ถือว่าบริษัทสร้างเอง
 */
export const LEGACY_POSITION_CODE_TO_REFERENCE_CODE: Record<string, string> = {
  PRESIDENT: 'P01',
  MD: 'P02',
  EXECUTIVE: 'P04',
  DIRECTOR: 'P05',
  DIR: 'P05',
  MGR: 'P07',
  MANAGER: 'P07',
  DEPT_MANAGER: 'P07',
  SUP: 'P09',
  SUPERVISOR: 'P09',
  TEAM_LEAD: 'P10',
  SR: 'P11',
  SENIOR_OFFICER: 'P11',
  STAFF: 'P13',
  /*
   * "พนักงานปฏิบัติการ" ตรงกับ OPERATOR (ระดับ 8) ไม่ใช่ "เจ้าหน้าที่" (ระดับ 7)
   * ข้อมูลจริงใช้รหัส OPR ส่วน seed รุ่นก่อนใช้ OFFICER — รับทั้งสองแบบ
   */
  OPR: 'P14',
  OFFICER: 'P14',
  OPERATOR: 'P14',
  INTERN: 'P15',
  HR_MANAGER: 'P17',
  HR_OFFICER: 'P19',
  ACCOUNTING_OFFICER: 'P24',
  SALES_OFFICER: 'P29',
  IT_DEVELOPER: 'P33',
  DATA_ANALYST: 'P35',
  PURCHASING_OFFICER: 'P42',
};
