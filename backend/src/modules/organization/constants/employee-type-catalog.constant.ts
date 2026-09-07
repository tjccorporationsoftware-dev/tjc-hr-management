/**
 * รายการประเภทพนักงานมาตรฐานของระบบ
 * -----------------------------------------------------------------------------
 * แนวคิดเดียวกับ position-catalog: ไฟล์นี้คือแหล่งความจริง
 * OrganizationCatalogBootstrapService ซิงก์ลงตาราง `employee_type_catalog` ตอนบูต
 * บริษัทกด "เปิดใช้" แล้วระบบคัดลอกเป็น EmployeeType ของบริษัทนั้น
 *
 * ประเภทพนักงานสำคัญกว่าตำแหน่ง เพราะเป็นตัวแยกนโยบายการลา OT และสายอนุมัติ
 * รายการที่ `isDefault` จึงเปิดให้บริษัทใหม่อัตโนมัติ ไม่งั้นตั้งนโยบายอะไรไม่ได้เลย
 */

export type EmployeeTypeCatalogEntry = {
  referenceCode: string;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  /** true = เปิดใช้ให้บริษัทที่ยังไม่มีประเภทพนักงานเลยโดยอัตโนมัติ */
  isDefault: boolean;
};

export const EMPLOYEE_TYPE_CATALOG: EmployeeTypeCatalogEntry[] = [
  {
    referenceCode: 'T01',
    code: 'MONTHLY',
    nameTh: 'พนักงานรายเดือน',
    nameEn: 'Monthly Employee',
    description: 'พนักงานประจำ รับค่าจ้างเป็นรายเดือน',
    isDefault: true,
  },
  {
    referenceCode: 'T02',
    code: 'DAILY',
    nameTh: 'พนักงานรายวัน',
    nameEn: 'Daily Employee',
    description: 'พนักงานประจำ รับค่าจ้างตามจำนวนวันที่มาทำงาน',
    isDefault: true,
  },
  {
    referenceCode: 'T03',
    code: 'PROBATION',
    nameTh: 'พนักงานทดลองงาน',
    nameEn: 'Probation Employee',
    description: 'อยู่ระหว่างทดลองงานตามระยะเวลาที่กำหนดในสัญญา',
    isDefault: false,
  },
  {
    referenceCode: 'T04',
    code: 'CONTRACT',
    nameTh: 'พนักงานสัญญาจ้าง',
    nameEn: 'Contract Employee',
    description: 'จ้างตามสัญญาที่มีกำหนดวันเริ่มและวันสิ้นสุดชัดเจน',
    isDefault: false,
  },
  {
    referenceCode: 'T05',
    code: 'PART_TIME',
    nameTh: 'พนักงานพาร์ตไทม์',
    nameEn: 'Part-time Employee',
    description: 'ทำงานไม่เต็มเวลา คิดค่าจ้างตามชั่วโมงหรือกะที่ทำ',
    isDefault: false,
  },
  {
    referenceCode: 'T06',
    code: 'HOURLY',
    nameTh: 'พนักงานรายชั่วโมง',
    nameEn: 'Hourly Employee',
    description: 'คิดค่าจ้างตามจำนวนชั่วโมงทำงานจริง',
    isDefault: false,
  },
  {
    referenceCode: 'T07',
    code: 'INTERN',
    nameTh: 'นักศึกษาฝึกงาน',
    nameEn: 'Intern',
    description: 'นักศึกษาฝึกงานตามหลักสูตร อาจมีหรือไม่มีเบี้ยเลี้ยง',
    isDefault: false,
  },
  {
    referenceCode: 'T08',
    code: 'OUTSOURCE',
    nameTh: 'พนักงานจ้างเหมา',
    nameEn: 'Outsourced Staff',
    description:
      'บุคลากรจากผู้รับเหมาภายนอก ไม่ได้อยู่ในบัญชีเงินเดือนของบริษัท',
    isDefault: false,
  },
  {
    referenceCode: 'T09',
    code: 'EXECUTIVE',
    nameTh: 'ผู้บริหาร',
    nameEn: 'Executive',
    description: 'ผู้บริหารที่มีเงื่อนไขสวัสดิการและการลาต่างจากพนักงานทั่วไป',
    isDefault: false,
  },
  {
    referenceCode: 'T10',
    code: 'RETIREE_REHIRE',
    nameTh: 'พนักงานเกษียณจ้างต่อ',
    nameEn: 'Rehired Retiree',
    description: 'พนักงานที่เกษียณแล้วและจ้างต่อเป็นรายปีหรือรายโครงการ',
    isDefault: false,
  },
];

/**
 * จับคู่รหัสประเภทพนักงานเดิมเข้ากับ referenceCode
 * ใช้ผูกข้อมูลที่บริษัทมีอยู่แล้วโดยไม่แตะชื่อหรือนโยบายที่ตั้งไว้
 */
export const LEGACY_EMPLOYEE_TYPE_CODE_TO_REFERENCE_CODE: Record<
  string,
  string
> = {
  MONTHLY: 'T01',
  DAILY: 'T02',
  PROBATION: 'T03',
  CONTRACT: 'T04',
  PART_TIME: 'T05',
  PARTTIME: 'T05',
  HOURLY: 'T06',
  INTERN: 'T07',
  OUTSOURCE: 'T08',
};
