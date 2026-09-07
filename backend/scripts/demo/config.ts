/**
 * ค่าคงที่ของชุดข้อมูลจำลอง 3 เดือน
 * ---------------------------------
 * แยกออกมาไฟล์เดียวเพื่อให้ทุกระยะของการ seed อ้างช่วงเวลาชุดเดียวกัน
 * ถ้าปล่อยให้แต่ละไฟล์คำนวณวันเอง ข้อมูลลงเวลากับงวดเงินเดือนจะเหลื่อมกันทันที
 */

/** รอบจ่ายเงินเดือนของบริษัทนี้คือวันที่ 26 ถึง 25 ของเดือนถัดไป */
export const PAYROLL_CYCLE_START_DAY = 26;

/**
 * 3 งวดที่ปิดแล้ว + 1 งวดที่กำลังเดินอยู่
 * ตั้งให้จบก่อนวันนี้ (11 ส.ค. 2026) เพื่อให้งวดที่ปิดแล้วมีข้อมูลครบจริง
 */
export const PERIODS = [
  {
    code: 'PR-2569-05',
    name: 'งวดพฤษภาคม 2569',
    year: 2026,
    month: 5,
    start: '2026-04-26',
    end: '2026-05-25',
    payment: '2026-05-28',
    /** งวดเก่าสุดปิดครบวงจรแล้ว */
    finalStatus: 'PAID' as const,
  },
  {
    code: 'PR-2569-06',
    name: 'งวดมิถุนายน 2569',
    year: 2026,
    month: 6,
    start: '2026-05-26',
    end: '2026-06-25',
    payment: '2026-06-29',
    finalStatus: 'PAID' as const,
  },
  {
    code: 'PR-2569-07',
    name: 'งวดกรกฎาคม 2569',
    year: 2026,
    month: 7,
    start: '2026-06-26',
    end: '2026-07-25',
    payment: '2026-07-29',
    /** งวดล่าสุดที่ปิด — ค้างไว้ที่อนุมัติแล้วแต่ยังไม่จ่าย จะได้เห็นหน้าจอขั้นตอนนี้ */
    finalStatus: 'APPROVED' as const,
  },
] as const;

/** งวดที่กำลังเดินอยู่ ยังไม่คำนวณ — ใช้ทดสอบหน้าตรวจสอบก่อนเข้าเงินเดือน */
export const CURRENT_PERIOD = {
  code: 'PR-2569-08',
  name: 'งวดสิงหาคม 2569',
  year: 2026,
  month: 8,
  start: '2026-07-26',
  end: '2026-08-25',
  payment: '2026-08-28',
};

/** ช่วงที่ต้องมีข้อมูลลงเวลา — คลุมทั้ง 3 งวดที่ปิด บวกงวดที่กำลังเดิน */
export const ATTENDANCE_FROM = '2026-04-26';
export const ATTENDANCE_TO = '2026-08-11';

export const COMPANY = {
  code: 'TJC',
  nameTh: 'บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด',
  nameEn: 'TJC Corporation Co., Ltd.',
  taxId: '0105558123456',
  address:
    'เลขที่ 168 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
};

export const BRANCHES = [
  {
    code: 'HQ',
    nameTh: 'สำนักงานใหญ่',
    address: 'เลขที่ 168 ถนนพระราม 9 กรุงเทพมหานคร',
    employeeCount: 24,
  },
  {
    code: 'RY',
    nameTh: 'สาขาระยอง',
    address: 'เลขที่ 99/12 นิคมอุตสาหกรรมมาบตาพุด จังหวัดระยอง',
    employeeCount: 16,
  },
] as const;

/** รหัสผ่านของทุกบัญชีในชุดข้อมูลจำลอง */
export const DEMO_PASSWORD = 'Demo@2569xyz';

export const SUPERADMIN_EMAIL = 'superadmin@tjc.local';
export const SUPERADMIN_PASSWORD = 'Admin@123456';
