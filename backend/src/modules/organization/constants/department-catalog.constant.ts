/**
 * รายการแผนกมาตรฐานของระบบ
 * -----------------------------------------------------------------------------
 * ไฟล์นี้คือแหล่งความจริง OrganizationCatalogBootstrapService ซิงก์ลงตาราง
 * `department_catalog` ตอนบูต บริษัทกด "เปิดใช้" แล้วระบบคัดลอกเป็น Department
 * ของบริษัทนั้น (branchId = null คือแผนกระดับบริษัทที่ใช้ร่วมได้ทุกสาขา)
 *
 * เรื่องชื่อ: ในระบบนี้ entity ชื่อ "แผนก" แต่ข้อมูลจริงตั้งชื่อว่า "ฝ่ายXXX"
 * มาตั้งแต่ต้น (ฝ่ายทรัพยากรบุคคล / ฝ่ายบัญชีและการเงิน) จึงคงธรรมเนียมเดิมไว้
 * ส่วนหน่วยย่อยใต้แผนกคือ Division ที่ UI เรียกว่า "ฝ่าย/กลุ่มงาน"
 *
 * `referenceCode` ห้ามเปลี่ยนหลังปล่อยใช้ เพราะเป็นกุญแจจับคู่ตอนซิงก์
 */

export type DepartmentCatalogEntry = {
  referenceCode: string;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  /** true = แผนกพื้นฐานที่บริษัทส่วนใหญ่ต้องมี ขึ้นป้าย "แนะนำ" ในหน้าเลือก */
  isDefault: boolean;
};

export const DEPARTMENT_CATALOG: DepartmentCatalogEntry[] = [
  {
    referenceCode: 'D01',
    code: 'MGT',
    nameTh: 'ฝ่ายบริหาร',
    nameEn: 'Management',
    description: 'ผู้บริหารระดับสูงและสำนักกรรมการผู้จัดการ',
    isDefault: true,
  },
  {
    referenceCode: 'D02',
    code: 'HR',
    nameTh: 'ฝ่ายทรัพยากรบุคคล',
    nameEn: 'Human Resources',
    description: 'สรรหา ค่าตอบแทน สวัสดิการ และแรงงานสัมพันธ์',
    isDefault: true,
  },
  {
    referenceCode: 'D03',
    code: 'FIN',
    nameTh: 'ฝ่ายบัญชีและการเงิน',
    nameEn: 'Finance & Accounting',
    description: 'บัญชี การเงิน งบประมาณ และภาษี',
    isDefault: true,
  },
  {
    referenceCode: 'D04',
    code: 'SALES',
    nameTh: 'ฝ่ายขายและการตลาด',
    nameEn: 'Sales & Marketing',
    description: 'งานขาย การตลาด และดูแลลูกค้า',
    isDefault: true,
  },
  {
    referenceCode: 'D05',
    code: 'OPS',
    nameTh: 'ฝ่ายปฏิบัติการ',
    nameEn: 'Operations',
    description: 'งานปฏิบัติการประจำวันและการส่งมอบ',
    isDefault: true,
  },
  {
    referenceCode: 'D06',
    code: 'IT',
    nameTh: 'ฝ่ายเทคโนโลยีสารสนเทศ',
    nameEn: 'Information Technology',
    description: 'ระบบสารสนเทศ โครงสร้างพื้นฐาน และความปลอดภัยข้อมูล',
    isDefault: true,
  },
  {
    referenceCode: 'D07',
    code: 'PUR',
    nameTh: 'ฝ่ายจัดซื้อ',
    nameEn: 'Purchasing',
    description: 'จัดซื้อจัดจ้างและบริหารคู่ค้า',
    isDefault: false,
  },
  {
    referenceCode: 'D08',
    code: 'WH',
    nameTh: 'ฝ่ายคลังสินค้าและโลจิสติกส์',
    nameEn: 'Warehouse & Logistics',
    description: 'รับ-จ่ายสินค้า ควบคุมสต๊อก และขนส่ง',
    isDefault: false,
  },
  {
    referenceCode: 'D09',
    code: 'PROD',
    nameTh: 'ฝ่ายผลิต',
    nameEn: 'Production',
    description: 'วางแผนและควบคุมการผลิต',
    isDefault: false,
  },
  {
    referenceCode: 'D10',
    code: 'QA',
    nameTh: 'ฝ่ายควบคุมคุณภาพ',
    nameEn: 'Quality Assurance',
    description: 'ตรวจสอบและประกันคุณภาพสินค้าหรือบริการ',
    isDefault: false,
  },
  {
    referenceCode: 'D11',
    code: 'ENG',
    nameTh: 'ฝ่ายวิศวกรรมและซ่อมบำรุง',
    nameEn: 'Engineering & Maintenance',
    description: 'งานวิศวกรรม ซ่อมบำรุงเครื่องจักรและอาคาร',
    isDefault: false,
  },
  {
    referenceCode: 'D12',
    code: 'ADM',
    nameTh: 'ฝ่ายธุรการ',
    nameEn: 'Administration',
    description: 'ธุรการทั่วไป อาคารสถานที่ และยานพาหนะ',
    isDefault: false,
  },
  {
    referenceCode: 'D13',
    code: 'LEGAL',
    nameTh: 'ฝ่ายกฎหมายและกำกับดูแล',
    nameEn: 'Legal & Compliance',
    description: 'นิติกรรมสัญญาและการกำกับการปฏิบัติตามกฎเกณฑ์',
    isDefault: false,
  },
  {
    referenceCode: 'D14',
    code: 'RND',
    nameTh: 'ฝ่ายวิจัยและพัฒนา',
    nameEn: 'Research & Development',
    description: 'วิจัยและพัฒนาผลิตภัณฑ์หรือบริการใหม่',
    isDefault: false,
  },
  {
    referenceCode: 'D15',
    code: 'CS',
    nameTh: 'ฝ่ายบริการลูกค้า',
    nameEn: 'Customer Service',
    description: 'รับเรื่องและดูแลลูกค้าหลังการขาย',
    isDefault: false,
  },
];

/**
 * จับคู่รหัสแผนกเดิมเข้ากับ referenceCode
 *
 * ใช้ผูกแผนกที่บริษัทมีอยู่แล้วเข้ากับรายการมาตรฐานโดยไม่แตะชื่อหรือพนักงานที่สังกัด
 * รับรหัสยาวด้วย เพราะแต่ละบริษัทตั้งไม่เหมือนกัน (ACC / ACCOUNTING / FIN)
 */
export const LEGACY_DEPARTMENT_CODE_TO_REFERENCE_CODE: Record<string, string> =
  {
    MGT: 'D01',
    MGMT: 'D01',
    MANAGEMENT: 'D01',
    EXEC: 'D01',

    HR: 'D02',
    HRM: 'D02',
    PERSONNEL: 'D02',

    FIN: 'D03',
    FINANCE: 'D03',
    ACC: 'D03',
    ACCOUNTING: 'D03',

    SALES: 'D04',
    SALE: 'D04',
    MKT: 'D04',
    MARKETING: 'D04',

    OPS: 'D05',
    OPERATION: 'D05',
    OPERATIONS: 'D05',

    IT: 'D06',
    MIS: 'D06',

    PUR: 'D07',
    PURCHASE: 'D07',
    PURCHASING: 'D07',

    WH: 'D08',
    WAREHOUSE: 'D08',
    LOGISTIC: 'D08',
    LOGISTICS: 'D08',

    PROD: 'D09',
    PRODUCTION: 'D09',

    QA: 'D10',
    QC: 'D10',

    ENG: 'D11',
    ENGINEERING: 'D11',
    MAINTENANCE: 'D11',

    ADM: 'D12',
    ADMIN: 'D12',
    GA: 'D12',

    LEGAL: 'D13',
    COMPLIANCE: 'D13',

    RND: 'D14',
    'R&D': 'D14',
    RD: 'D14',

    CS: 'D15',
    SERVICE: 'D15',
  };
