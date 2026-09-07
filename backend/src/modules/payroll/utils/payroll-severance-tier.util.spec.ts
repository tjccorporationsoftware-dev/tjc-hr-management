import { BadRequestException } from '@nestjs/common';

import { assertTiersMeetStatutoryMinimum } from './payroll-severance-tier.util';
import { STATUTORY_SEVERANCE_TIERS } from './payroll-severance.util';

/**
 * บันไดค่าชดเชยที่บริษัทตั้ง ต้องไม่แย่กว่ามาตรา 118
 *
 * ม.118 เป็น "ขั้นต่ำ" บริษัทจ่ายมากกว่าได้ น้อยกว่าไม่ได้
 * ถ้าไม่ตรวจ หน้าตั้งค่าจะกลายเป็นช่องทางทำให้ระบบจ่ายผิดกฎหมายอย่างเป็นทางการ
 */
describe('assertTiersMeetStatutoryMinimum', () => {
  it('ไม่ตั้งเลย ผ่าน — ระบบใช้ขั้นต่ำตามกฎหมายให้อยู่แล้ว', () => {
    expect(() => assertTiersMeetStatutoryMinimum([])).not.toThrow();
  });

  it('ตั้งตรงตามกฎหมายเป๊ะ ผ่าน', () => {
    expect(() =>
      assertTiersMeetStatutoryMinimum(STATUTORY_SEVERANCE_TIERS),
    ).not.toThrow();
  });

  it('ตั้งดีกว่ากฎหมายทุกขั้น ผ่าน', () => {
    const generous = STATUTORY_SEVERANCE_TIERS.map((tier) => ({
      ...tier,
      payDays: tier.payDays + 30,
    }));

    expect(() => assertTiersMeetStatutoryMinimum(generous)).not.toThrow();
  });

  it('ขั้นเดียวต่ำกว่ากฎหมาย ต้องปฏิเสธ', () => {
    const tiers = STATUTORY_SEVERANCE_TIERS.map((tier) =>
      tier.minServiceMonths === 120 ? { ...tier, payDays: 200 } : tier,
    );

    expect(() => assertTiersMeetStatutoryMinimum(tiers)).toThrow(
      BadRequestException,
    );
  });

  it('ข้อความบอกชัดว่าขั้นไหนขาดเท่าไร', () => {
    const tiers = STATUTORY_SEVERANCE_TIERS.map((tier) =>
      tier.minServiceMonths === 120 ? { ...tier, payDays: 200 } : tier,
    );

    try {
      assertTiersMeetStatutoryMinimum(tiers);
      throw new Error('ควรจะโยน error');
    } catch (error) {
      const message = (error as BadRequestException).message;

      expect(message).toContain('มาตรา 118');
      expect(message).toContain('10 ปี');
      expect(message).toContain('300');
      // ตัวเลขที่ได้จริงคือ 240 ไม่ใช่ 200 เพราะขั้น 6 ปีให้ 240 วัน
      // และการหาค่าชดเชยเลือกขั้นที่ดีที่สุดที่อายุงานถึง ไม่ใช่ขั้นที่ตรงพอดี
      expect(message).toContain('240');
    }
  });

  it('ตั้งขั้นหยาบกว่ากฎหมาย จนทำให้ช่วงกลางขาด ต้องจับได้', () => {
    // มีแค่ขั้นเดียวที่ 4 เดือน = ทุกอายุงานได้ 30 วัน ซึ่งต่ำกว่ากฎหมายตั้งแต่ปีที่ 1
    expect(() =>
      assertTiersMeetStatutoryMinimum([{ minServiceMonths: 4, payDays: 30 }]),
    ).toThrow(BadRequestException);
  });

  it('ตั้งขั้นละเอียดกว่ากฎหมาย และให้ไม่น้อยกว่าทุกจุด ผ่าน', () => {
    expect(() =>
      assertTiersMeetStatutoryMinimum([
        { minServiceMonths: 4, payDays: 30 },
        { minServiceMonths: 6, payDays: 60 },
        { minServiceMonths: 12, payDays: 90 },
        { minServiceMonths: 24, payDays: 120 },
        { minServiceMonths: 36, payDays: 180 },
        { minServiceMonths: 48, payDays: 210 },
        { minServiceMonths: 72, payDays: 240 },
        { minServiceMonths: 120, payDays: 300 },
        { minServiceMonths: 240, payDays: 400 },
      ]),
    ).not.toThrow();
  });

  it('ลืมขั้นบนสุด (20 ปี) ต้องปฏิเสธ ไม่ใช่ปล่อยผ่านเพราะขั้นล่างถูก', () => {
    const missingTop = STATUTORY_SEVERANCE_TIERS.filter(
      (tier) => tier.minServiceMonths < 240,
    );

    expect(() => assertTiersMeetStatutoryMinimum(missingTop)).toThrow(
      BadRequestException,
    );
  });
});
