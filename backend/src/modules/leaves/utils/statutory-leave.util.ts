/**
 * สิทธิลาที่กฎหมายให้ไว้ — บริษัทตั้งค่าให้แย่กว่านี้ไม่ได้
 * -----------------------------------------------------------------------------
 * พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541
 *   ม.32  ลาป่วย — ลาได้เท่าที่ป่วยจริง ไม่มีเงื่อนไขว่าต้องผ่านทดลองงานก่อน
 *   ม.33  ลาเพื่อทำหมัน — ตามที่แพทย์กำหนด
 *   ม.34  ลากิจธุระอันจำเป็น — ไม่น้อยกว่า 3 วันทำงานต่อปี (ฉบับที่ 7 พ.ศ. 2562)
 *   ม.35  ลาเพื่อรับราชการทหาร — ไม่เกิน 60 วันต่อปี
 *   ม.41  ลาคลอด — ไม่เกิน 98 วัน (ฉบับที่ 7 พ.ศ. 2562)
 *
 * ปัญหาเดิม: หน้าตั้งค่าประเภทลามีตัวเลือก "นับอายุงานจากวันบรรจุ"
 * (serviceStartBasis = PROBATION_PASS_DATE) ซึ่งบล็อกแข็ง — โยน error
 * ไม่ใช่แค่ให้โควตา 0 ถ้าใครสลับค่านี้กับลาป่วย พนักงานทดลองงานทั้งบริษัท
 * จะยื่นลาป่วยไม่ได้เลย ซึ่งขัดกฎหมายโดยตรงและไม่มีอะไรเตือน
 *
 * ไฟล์นี้จึงเป็นเพดานล่างที่การตั้งค่าเอาชนะไม่ได้
 */

/** ประเภทลาที่กฎหมายไม่ผูกกับการผ่านทดลองงาน */
const STATUTORY_LEAVE_CODES = [
  'SICK', // ม.32
  'STERILIZATION', // ม.33
  'PERSONAL', // ม.34 — ลากิจธุระอันจำเป็น
  'BUSINESS',
  'MILITARY', // ม.35
  'MATERNITY', // ม.41
  'PATERNITY',
];

/**
 * ประเภทลาที่บังคับให้ยื่นล่วงหน้าไม่ได้
 *
 * ป่วยกับคลอดเป็นเหตุที่คาดล่วงหน้าไม่ได้ ถ้าตั้ง advanceNoticeDays ไว้
 * พนักงานที่ป่วยวันนี้จะยื่นใบลาไม่ได้เลย ต้องขาดงานแล้วโดนหักเงินแทน
 */
const UNSCHEDULABLE_LEAVE_CODES = ['SICK', 'STERILIZATION', 'MATERNITY'];

export type StatutoryLeaveIdentity = {
  code?: string | null;
  referenceCode?: string | null;
};

function matches(leaveType: StatutoryLeaveIdentity, codes: string[]) {
  /*
   * เทียบทั้ง code ของบริษัทและ referenceCode ที่ผูกกับรายการมาตรฐานของระบบ
   * เพราะบริษัทที่สร้างประเภทลาเองอาจตั้งรหัสไม่ตรงกับของกลาง
   *
   * ต้องเทียบถึงระดับ "ตระกูลรหัส" ด้วย ไม่ใช่ตรงตัวเป๊ะ
   * ของจริงที่ seed สร้างคือ SICK_CERTIFIED / SICK_UNPAID / MATERNITY_PAID /
   * PERSONAL_UNPAID ส่วน referenceCode เป็นเลขลำดับ ("01" "02" "03")
   * เทียบตรงตัวจึงไม่แมตช์อะไรเลย เพดานล่างตามกฎหมายทั้งไฟล์นี้เลยไม่เคยทำงาน
   * ผลคือพนักงานทดลองงานยื่นลาป่วยไม่ได้ ซึ่งเป็นเคสที่ไฟล์นี้ตั้งใจกันตั้งแต่แรก
   */
  return [leaveType.code, leaveType.referenceCode]
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase())
    .some((value) =>
      codes.some((code) => value === code || value.startsWith(`${code}_`)),
    );
}

/** ประเภทลานี้เป็นสิทธิตามกฎหมายที่ห้ามผูกกับการผ่านทดลองงานหรือไม่ */
export function isStatutoryLeave(leaveType: StatutoryLeaveIdentity) {
  return matches(leaveType, STATUTORY_LEAVE_CODES);
}

/** ประเภทลานี้บังคับให้ยื่นล่วงหน้าไม่ได้หรือไม่ */
export function isUnschedulableLeave(leaveType: StatutoryLeaveIdentity) {
  return matches(leaveType, UNSCHEDULABLE_LEAVE_CODES);
}
