import {
  isStatutoryLeave,
  isUnschedulableLeave,
} from './statutory-leave.util';

/**
 * สิทธิลาตามกฎหมายต้องถูกระบุได้ ไม่ว่าจะตั้งรหัสไว้แบบไหน
 *
 * เคสที่เคยพังจริง: หน้าตั้งค่าประเภทลามีตัวเลือก "นับอายุงานจากวันบรรจุ"
 * ซึ่งบล็อกแข็ง (โยน error ไม่ใช่ให้โควตา 0) ถ้าสลับค่านี้กับลาป่วย
 * พนักงานทดลองงานทั้งบริษัทจะยื่นลาป่วยไม่ได้เลย ขัด พ.ร.บ.คุ้มครองแรงงาน ม.32
 */
describe('isStatutoryLeave', () => {
  it('ลาป่วย ม.32 เป็นสิทธิตามกฎหมาย', () => {
    expect(isStatutoryLeave({ code: 'SICK' })).toBe(true);
  });

  it('ลาคลอด ม.41 · ลากิจธุระจำเป็น ม.34 · ลาทหาร ม.35 · ลาทำหมัน ม.33', () => {
    expect(isStatutoryLeave({ code: 'MATERNITY' })).toBe(true);
    expect(isStatutoryLeave({ code: 'PERSONAL' })).toBe(true);
    expect(isStatutoryLeave({ code: 'MILITARY' })).toBe(true);
    expect(isStatutoryLeave({ code: 'STERILIZATION' })).toBe(true);
  });

  it('ลาพักร้อนไม่ใช่ — ผูกกับการผ่านทดลองงานได้ตามที่บริษัทตั้ง', () => {
    expect(isStatutoryLeave({ code: 'ANNUAL' })).toBe(false);
    expect(isStatutoryLeave({ code: 'TRAINING' })).toBe(false);
    expect(isStatutoryLeave({ code: 'OTHER' })).toBe(false);
  });

  it('บริษัทตั้งรหัสเอง แต่ผูกกับรายการมาตรฐาน ก็ยังจับได้', () => {
    expect(isStatutoryLeave({ code: 'LV-001', referenceCode: 'SICK' })).toBe(
      true,
    );
  });

  it('ตัวพิมพ์เล็กและช่องว่าง ไม่ทำให้หลุด', () => {
    expect(isStatutoryLeave({ code: ' sick ' })).toBe(true);
  });

  /*
   * เคสที่หลุดมาจริงจนถึงงวดแรกของลูกค้า
   *
   * seed สร้างรหัสแบบมีส่วนต่อท้าย (SICK_CERTIFIED / MATERNITY_PAID /
   * PERSONAL_UNPAID) ส่วน referenceCode เป็นเลขลำดับ ("01" "02" "03")
   * เทสเดิมทดสอบแต่รหัสเปล่า ๆ ('SICK') ซึ่งไม่มีอยู่จริงในฐานข้อมูล
   * เพดานล่างตามกฎหมายทั้งไฟล์จึงไม่เคยทำงาน และพนักงานทดลองงาน
   * ยื่นลาป่วยไม่ได้เลย
   */
  it('รหัสจริงที่ seed สร้าง ต้องจับได้ทุกตัว', () => {
    expect(isStatutoryLeave({ code: 'SICK_CERTIFIED', referenceCode: '03' })).toBe(true);
    expect(isStatutoryLeave({ code: 'SICK_UNPAID', referenceCode: '11' })).toBe(true);
    expect(isStatutoryLeave({ code: 'MATERNITY_PAID', referenceCode: '04' })).toBe(true);
    expect(isStatutoryLeave({ code: 'MATERNITY_UNPAID', referenceCode: '05' })).toBe(true);
    expect(isStatutoryLeave({ code: 'PERSONAL_PAID', referenceCode: '01' })).toBe(true);
    expect(isStatutoryLeave({ code: 'PERSONAL_UNPAID', referenceCode: '02' })).toBe(true);
  });

  it('รหัสที่ขึ้นต้นคล้ายกันแต่คนละตระกูล ต้องไม่หลุดเข้ามา', () => {
    // ANNUAL / TRAINING / ORDINATION ไม่ใช่สิทธิตามกฎหมาย ผูกกับการบรรจุได้
    expect(isStatutoryLeave({ code: 'ANNUAL_EXTRA', referenceCode: '06' })).toBe(false);
    expect(isStatutoryLeave({ code: 'ORDINATION_PAID', referenceCode: '12' })).toBe(false);
    expect(isStatutoryLeave({ code: 'TRAINING', referenceCode: '07' })).toBe(false);
    // ขึ้นต้นด้วย SICK แต่ไม่มีขีดคั่น = คนละคำ ไม่นับ
    expect(isStatutoryLeave({ code: 'SICKNESSFUND' })).toBe(false);
  });

  it('ไม่มีรหัสเลย ไม่ถือว่าเป็นสิทธิตามกฎหมาย', () => {
    expect(isStatutoryLeave({})).toBe(false);
    expect(isStatutoryLeave({ code: null, referenceCode: null })).toBe(false);
  });
});

describe('isUnschedulableLeave', () => {
  it('ป่วยและคลอด บังคับยื่นล่วงหน้าไม่ได้', () => {
    expect(isUnschedulableLeave({ code: 'SICK' })).toBe(true);
    expect(isUnschedulableLeave({ code: 'MATERNITY' })).toBe(true);
  });

  it('ลาพักร้อนและลากิจ ยังบังคับยื่นล่วงหน้าได้ตามปกติ', () => {
    expect(isUnschedulableLeave({ code: 'ANNUAL' })).toBe(false);
    expect(isUnschedulableLeave({ code: 'PERSONAL' })).toBe(false);
  });

  /* พังด้วยเหตุผลเดียวกับ isStatutoryLeave — เทียบรหัสตรงตัวจนไม่แมตช์ของจริง */
  it('รหัสจริงที่ seed สร้าง ก็ต้องบังคับยื่นล่วงหน้าไม่ได้', () => {
    expect(isUnschedulableLeave({ code: 'SICK_CERTIFIED' })).toBe(true);
    expect(isUnschedulableLeave({ code: 'MATERNITY_PAID' })).toBe(true);
  });
});
