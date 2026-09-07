import {
  LEAVE_TYPE_CATALOG,
  LEGACY_LEAVE_CODE_TO_REFERENCE_CODE,
} from './leave-type-catalog.constant';

/**
 * ตาข่ายกันค่าคงที่ประเภทการลาพังเงียบ
 *
 * รายการนี้ถูกซิงก์ลงฐานข้อมูลตอนแอปบูตด้วย `referenceCode` เป็นกุญแจ
 * ถ้ามีคนเผลอใส่รหัสซ้ำ หรือแก้รหัสในตารางจับคู่ให้ชี้ไปที่รายการที่ไม่มีอยู่
 * ผลจะไม่ฟ้องตอนบูต แต่จะกลายเป็นประเภทลาหาย/ผูกไม่ติดที่หน้าตั้งค่าแทน
 */
describe('LEAVE_TYPE_CATALOG', () => {
  it('referenceCode ห้ามซ้ำ เพราะเป็นกุญแจที่ใช้ upsert', () => {
    const codes = LEAVE_TYPE_CATALOG.map((item) => item.referenceCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('code ห้ามซ้ำ เพราะถูกใช้ตั้งรหัสประเภทลาของบริษัทตอนกดเปิดใช้', () => {
    const codes = LEAVE_TYPE_CATALOG.map((item) => item.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ทุกรายการต้องมีชื่อไทย ไม่งั้นหน้าตั้งค่าจะขึ้นบรรทัดว่าง', () => {
    for (const item of LEAVE_TYPE_CATALOG) {
      expect(item.nameTh.trim()).not.toBe('');
    }
  });

  it('โควตาตั้งต้นต้องไม่ติดลบ', () => {
    for (const item of LEAVE_TYPE_CATALOG) {
      expect(item.defaultAnnualQuotaDays).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('LEGACY_LEAVE_CODE_TO_REFERENCE_CODE', () => {
  it('ทุกรหัสปลายทางต้องมีอยู่จริงใน catalog', () => {
    const known = new Set(LEAVE_TYPE_CATALOG.map((item) => item.referenceCode));

    for (const [legacyCode, referenceCode] of Object.entries(
      LEGACY_LEAVE_CODE_TO_REFERENCE_CODE,
    )) {
      expect({ legacyCode, exists: known.has(referenceCode) }).toEqual({
        legacyCode,
        exists: true,
      });
    }
  });

  /*
   * ประเภทลาเดิมของบริษัทหลายใบชี้ไปที่ catalog แถวเดียวกันไม่ได้
   * ตัวซิงก์กันไว้อีกชั้นด้วย `taken` แต่ถ้าตารางนี้ตั้งใจจับคู่ซ้ำตั้งแต่ต้น
   * จะกลายเป็นว่าใบหนึ่งผูกติด อีกใบเงียบหายจากหน้าตั้งค่าโดยไม่มีอะไรบอก
   */
  it('รหัสเดิมของระบบต้องไม่จับคู่ไปที่ catalog แถวเดียวกัน', () => {
    const systemLegacyCodes = [
      'PERSONAL',
      'UNPAID',
      'SICK',
      'MATERNITY',
      'ANNUAL',
      'TRAINING',
      'FUNERAL',
      'ORDINATION',
    ];

    const targets = systemLegacyCodes.map(
      (code) => LEGACY_LEAVE_CODE_TO_REFERENCE_CODE[code],
    );

    expect(new Set(targets).size).toBe(targets.length);
  });
});
