/**
 * รายการฝ่าย/กลุ่มงานมาตรฐานของระบบ
 * -----------------------------------------------------------------------------
 * ฝ่ายเป็นหน่วยย่อยใต้แผนก (`Division.departmentId` เป็น required) ทุกรายการที่นี่
 * จึงต้องระบุ `departmentReferenceCode` ว่าอยู่ใต้แผนกมาตรฐานตัวไหน
 *
 * ตอนบริษัทกดเปิดใช้ฝ่าย ระบบจะเปิดแผนกแม่ให้อัตโนมัติถ้ายังไม่ได้เปิด
 * ไม่งั้นจะกดไม่ได้เลยและไม่มีอะไรบอกว่าทำไม
 *
 * รหัสใช้รูปแบบ `<รหัสแผนก>-<ลำดับ>` ให้ตรงกับที่ข้อมูลจริงใช้อยู่ (HR-1, OPS-2)
 * เพื่อให้จับคู่ฝ่ายเดิมของบริษัทได้โดยไม่ต้องมีตารางแปลงแยก
 */

export type DivisionCatalogEntry = {
  referenceCode: string;
  /** อ้างถึง referenceCode ของแผนกใน department-catalog.constant.ts */
  departmentReferenceCode: string;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
};

export const DIVISION_CATALOG: DivisionCatalogEntry[] = [
  /* ---- D01 ฝ่ายบริหาร ---- */
  {
    referenceCode: 'V01',
    departmentReferenceCode: 'D01',
    code: 'MGT-1',
    nameTh: 'สำนักกรรมการผู้จัดการ',
    nameEn: "Managing Director's Office",
    description: 'งานสนับสนุนกรรมการผู้จัดการและการประชุมผู้บริหาร',
  },
  {
    referenceCode: 'V02',
    departmentReferenceCode: 'D01',
    code: 'MGT-2',
    nameTh: 'วางแผนกลยุทธ์',
    nameEn: 'Strategic Planning',
    description: 'วางแผนธุรกิจและติดตามตัวชี้วัดระดับองค์กร',
  },

  /* ---- D02 ฝ่ายทรัพยากรบุคคล ---- */
  {
    referenceCode: 'V03',
    departmentReferenceCode: 'D02',
    code: 'HR-1',
    nameTh: 'สรรหาและพัฒนา',
    nameEn: 'Recruitment & Development',
    description: 'สรรหาว่าจ้างและพัฒนาบุคลากร',
  },
  {
    referenceCode: 'V04',
    departmentReferenceCode: 'D02',
    code: 'HR-2',
    nameTh: 'ค่าตอบแทนและสวัสดิการ',
    nameEn: 'Compensation & Benefits',
    description: 'เงินเดือน ค่าตอบแทน และสวัสดิการพนักงาน',
  },
  {
    referenceCode: 'V05',
    departmentReferenceCode: 'D02',
    code: 'HR-3',
    nameTh: 'แรงงานสัมพันธ์',
    nameEn: 'Employee Relations',
    description: 'วินัย ข้อร้องเรียน และความสัมพันธ์กับพนักงาน',
  },
  {
    referenceCode: 'V06',
    departmentReferenceCode: 'D02',
    code: 'HR-4',
    nameTh: 'ฝึกอบรม',
    nameEn: 'Training',
    description: 'จัดหลักสูตรและติดตามผลการฝึกอบรม',
  },

  /* ---- D03 ฝ่ายบัญชีและการเงิน ---- */
  {
    referenceCode: 'V07',
    departmentReferenceCode: 'D03',
    code: 'FIN-1',
    nameTh: 'บัญชี',
    nameEn: 'Accounting',
    description: 'บันทึกบัญชีและปิดงบการเงิน',
  },
  {
    referenceCode: 'V08',
    departmentReferenceCode: 'D03',
    code: 'FIN-2',
    nameTh: 'การเงิน',
    nameEn: 'Finance',
    description: 'รับ-จ่ายเงิน กระแสเงินสด และธุรกรรมธนาคาร',
  },
  {
    referenceCode: 'V09',
    departmentReferenceCode: 'D03',
    code: 'FIN-3',
    nameTh: 'งบประมาณและวิเคราะห์',
    nameEn: 'Budgeting & Analysis',
    description: 'จัดทำงบประมาณและวิเคราะห์ผลประกอบการ',
  },
  {
    referenceCode: 'V10',
    departmentReferenceCode: 'D03',
    code: 'FIN-4',
    nameTh: 'ภาษี',
    nameEn: 'Taxation',
    description: 'คำนวณและนำส่งภาษีตามกฎหมาย',
  },

  /* ---- D04 ฝ่ายขายและการตลาด ---- */
  {
    referenceCode: 'V11',
    departmentReferenceCode: 'D04',
    code: 'SALES-1',
    nameTh: 'ขายในประเทศ',
    nameEn: 'Domestic Sales',
    description: 'งานขายลูกค้าภายในประเทศ',
  },
  {
    referenceCode: 'V12',
    departmentReferenceCode: 'D04',
    code: 'SALES-2',
    nameTh: 'การตลาด',
    nameEn: 'Marketing',
    description: 'วางแผนและดำเนินกิจกรรมการตลาด',
  },
  {
    referenceCode: 'V13',
    departmentReferenceCode: 'D04',
    code: 'SALES-3',
    nameTh: 'ขายต่างประเทศ',
    nameEn: 'International Sales',
    description: 'งานขายและส่งออกไปต่างประเทศ',
  },
  {
    referenceCode: 'V14',
    departmentReferenceCode: 'D04',
    code: 'SALES-4',
    nameTh: 'สนับสนุนการขาย',
    nameEn: 'Sales Support',
    description: 'ทำใบเสนอราคา ประสานงาน และดูแลเอกสารการขาย',
  },

  /* ---- D05 ฝ่ายปฏิบัติการ ---- */
  {
    referenceCode: 'V15',
    departmentReferenceCode: 'D05',
    code: 'OPS-1',
    nameTh: 'คลังสินค้า',
    nameEn: 'Warehouse',
    description: 'จัดเก็บและควบคุมสินค้าคงคลัง',
  },
  {
    referenceCode: 'V16',
    departmentReferenceCode: 'D05',
    code: 'OPS-2',
    nameTh: 'จัดส่ง',
    nameEn: 'Delivery',
    description: 'จัดส่งสินค้าและบริหารเส้นทางขนส่ง',
  },
  {
    referenceCode: 'V17',
    departmentReferenceCode: 'D05',
    code: 'OPS-3',
    nameTh: 'วางแผนปฏิบัติการ',
    nameEn: 'Operations Planning',
    description: 'วางแผนกำลังคนและตารางงานหน้างาน',
  },

  /* ---- D06 ฝ่ายเทคโนโลยีสารสนเทศ ---- */
  {
    referenceCode: 'V18',
    departmentReferenceCode: 'D06',
    code: 'IT-1',
    nameTh: 'พัฒนาระบบ',
    nameEn: 'Software Development',
    description: 'พัฒนาและดูแลระบบงานภายในองค์กร',
  },
  {
    referenceCode: 'V19',
    departmentReferenceCode: 'D06',
    code: 'IT-2',
    nameTh: 'ซัพพอร์ต',
    nameEn: 'IT Support',
    description: 'ดูแลอุปกรณ์และแก้ปัญหาการใช้งานให้ผู้ใช้',
  },
  {
    referenceCode: 'V20',
    departmentReferenceCode: 'D06',
    code: 'IT-3',
    nameTh: 'โครงสร้างพื้นฐานและเครือข่าย',
    nameEn: 'Infrastructure & Network',
    description: 'เซิร์ฟเวอร์ เครือข่าย และระบบสำรองข้อมูล',
  },
  {
    referenceCode: 'V21',
    departmentReferenceCode: 'D06',
    code: 'IT-4',
    nameTh: 'ความปลอดภัยข้อมูล',
    nameEn: 'Information Security',
    description: 'ดูแลความปลอดภัยข้อมูลและสิทธิ์การเข้าถึง',
  },

  /* ---- D07 ฝ่ายจัดซื้อ ---- */
  {
    referenceCode: 'V22',
    departmentReferenceCode: 'D07',
    code: 'PUR-1',
    nameTh: 'จัดซื้อในประเทศ',
    nameEn: 'Domestic Purchasing',
    description: 'จัดซื้อจากคู่ค้าภายในประเทศ',
  },
  {
    referenceCode: 'V23',
    departmentReferenceCode: 'D07',
    code: 'PUR-2',
    nameTh: 'จัดซื้อต่างประเทศ',
    nameEn: 'Import Purchasing',
    description: 'จัดซื้อและนำเข้าจากต่างประเทศ',
  },

  /* ---- D08 ฝ่ายคลังสินค้าและโลจิสติกส์ ---- */
  {
    referenceCode: 'V24',
    departmentReferenceCode: 'D08',
    code: 'WH-1',
    nameTh: 'รับสินค้า',
    nameEn: 'Goods Receiving',
    description: 'ตรวจรับและบันทึกสินค้าเข้าคลัง',
  },
  {
    referenceCode: 'V25',
    departmentReferenceCode: 'D08',
    code: 'WH-2',
    nameTh: 'จ่ายสินค้า',
    nameEn: 'Goods Issuing',
    description: 'เบิกจ่ายสินค้าออกจากคลัง',
  },
  {
    referenceCode: 'V26',
    departmentReferenceCode: 'D08',
    code: 'WH-3',
    nameTh: 'ควบคุมสต๊อก',
    nameEn: 'Inventory Control',
    description: 'ตรวจนับและกระทบยอดสินค้าคงคลัง',
  },

  /* ---- D09 ฝ่ายผลิต ---- */
  {
    referenceCode: 'V27',
    departmentReferenceCode: 'D09',
    code: 'PROD-1',
    nameTh: 'สายการผลิต',
    nameEn: 'Production Line',
    description: 'ปฏิบัติงานผลิตตามแผนและมาตรฐาน',
  },
  {
    referenceCode: 'V28',
    departmentReferenceCode: 'D09',
    code: 'PROD-2',
    nameTh: 'วางแผนและควบคุมการผลิต',
    nameEn: 'Production Planning & Control',
    description: 'วางแผนกำลังการผลิตและติดตามความคืบหน้า',
  },

  /* ---- D10 ฝ่ายควบคุมคุณภาพ ---- */
  {
    referenceCode: 'V29',
    departmentReferenceCode: 'D10',
    code: 'QA-1',
    nameTh: 'ตรวจสอบคุณภาพ',
    nameEn: 'Quality Control',
    description: 'ตรวจสอบคุณภาพวัตถุดิบและสินค้าสำเร็จรูป',
  },
  {
    referenceCode: 'V30',
    departmentReferenceCode: 'D10',
    code: 'QA-2',
    nameTh: 'ประกันคุณภาพ',
    nameEn: 'Quality Assurance',
    description: 'วางระบบคุณภาพและตรวจติดตามภายใน',
  },

  /* ---- D11 ฝ่ายวิศวกรรมและซ่อมบำรุง ---- */
  {
    referenceCode: 'V31',
    departmentReferenceCode: 'D11',
    code: 'ENG-1',
    nameTh: 'ซ่อมบำรุง',
    nameEn: 'Maintenance',
    description: 'ซ่อมบำรุงเชิงป้องกันและแก้ไขเครื่องจักร',
  },
  {
    referenceCode: 'V32',
    departmentReferenceCode: 'D11',
    code: 'ENG-2',
    nameTh: 'วิศวกรรมโครงการ',
    nameEn: 'Project Engineering',
    description: 'ออกแบบและควบคุมงานโครงการทางวิศวกรรม',
  },

  /* ---- D12 ฝ่ายธุรการ ---- */
  {
    referenceCode: 'V33',
    departmentReferenceCode: 'D12',
    code: 'ADM-1',
    nameTh: 'ธุรการทั่วไป',
    nameEn: 'General Administration',
    description: 'งานเอกสารและงานธุรการของสำนักงาน',
  },
  {
    referenceCode: 'V34',
    departmentReferenceCode: 'D12',
    code: 'ADM-2',
    nameTh: 'อาคารสถานที่',
    nameEn: 'Facility',
    description: 'ดูแลอาคาร ความสะอาด และความปลอดภัย',
  },
  {
    referenceCode: 'V35',
    departmentReferenceCode: 'D12',
    code: 'ADM-3',
    nameTh: 'ยานพาหนะ',
    nameEn: 'Fleet',
    description: 'ดูแลรถยนต์ส่วนกลางและพนักงานขับรถ',
  },

  /* ---- D13 ฝ่ายกฎหมายและกำกับดูแล ---- */
  {
    referenceCode: 'V36',
    departmentReferenceCode: 'D13',
    code: 'LEGAL-1',
    nameTh: 'นิติกรรมสัญญา',
    nameEn: 'Contracts',
    description: 'ร่างและตรวจสอบสัญญาทางธุรกิจ',
  },
  {
    referenceCode: 'V37',
    departmentReferenceCode: 'D13',
    code: 'LEGAL-2',
    nameTh: 'กำกับการปฏิบัติตามกฎเกณฑ์',
    nameEn: 'Compliance',
    description: 'ติดตามให้การดำเนินงานเป็นไปตามกฎหมายและระเบียบ',
  },

  /* ---- D14 ฝ่ายวิจัยและพัฒนา ---- */
  {
    referenceCode: 'V38',
    departmentReferenceCode: 'D14',
    code: 'RND-1',
    nameTh: 'วิจัยผลิตภัณฑ์',
    nameEn: 'Product Research',
    description: 'ศึกษาและทดลองแนวทางผลิตภัณฑ์ใหม่',
  },
  {
    referenceCode: 'V39',
    departmentReferenceCode: 'D14',
    code: 'RND-2',
    nameTh: 'พัฒนาผลิตภัณฑ์',
    nameEn: 'Product Development',
    description: 'พัฒนาผลิตภัณฑ์จนพร้อมออกสู่ตลาด',
  },

  /* ---- D15 ฝ่ายบริการลูกค้า ---- */
  {
    referenceCode: 'V40',
    departmentReferenceCode: 'D15',
    code: 'CS-1',
    nameTh: 'ศูนย์บริการลูกค้า',
    nameEn: 'Customer Service Center',
    description: 'รับสายและตอบคำถามลูกค้า',
  },
  {
    referenceCode: 'V41',
    departmentReferenceCode: 'D15',
    code: 'CS-2',
    nameTh: 'รับเรื่องร้องเรียน',
    nameEn: 'Complaint Handling',
    description: 'รับเรื่องร้องเรียนและติดตามจนปิดเคส',
  },
];

/**
 * จับคู่รหัสฝ่ายเดิมเข้ากับ referenceCode
 *
 * รหัสในข้อมูลจริงใช้รูปแบบเดียวกับ catalog อยู่แล้ว (HR-1, OPS-2) ตารางนี้จึง
 * สร้างจาก catalog ตรง ๆ ไม่ต้องไล่พิมพ์เอง — ลดโอกาสพิมพ์รหัสผิดจนผูกไม่ติด
 */
export const LEGACY_DIVISION_CODE_TO_REFERENCE_CODE: Record<string, string> =
  Object.fromEntries(
    DIVISION_CATALOG.map((entry) => [entry.code, entry.referenceCode]),
  );
