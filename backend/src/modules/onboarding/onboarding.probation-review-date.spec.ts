import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

/**
 * วันที่บันทึกผลทดลองงาน = วันบรรจุของพนักงาน
 *
 * ต้องย้อนหลังได้ ไม่งั้นตอนย้ายข้อมูลพนักงานเดิมเข้าระบบ ทุกคนจะถูกนับอายุงาน
 * ใหม่ตั้งแต่วันที่กดผ่าน ทำให้โควตาลาพักร้อน/ลาป่วยถูกเฉลี่ยผิด
 */
type ReviewDateResolver = {
  resolveProbationReviewedAt(
    requested: string | undefined,
    record: { startDate: Date },
  ): Date;
};

describe('OnboardingService · วันที่บันทึกผลทดลองงาน', () => {
  const service = Object.create(
    OnboardingService.prototype,
  ) as unknown as ReviewDateResolver;

  const record = { startDate: new Date('2022-03-14T00:00:00.000Z') };

  it('ไม่ระบุ = ใช้วันนี้', () => {
    const before = Date.now();
    const result = service.resolveProbationReviewedAt(undefined, record);

    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('ระบุย้อนหลัง = ใช้วันที่นั้น', () => {
    const result = service.resolveProbationReviewedAt(
      '2022-07-11T00:00:00.000Z',
      record,
    );

    expect(result.toISOString()).toBe('2022-07-11T00:00:00.000Z');
  });

  it('วันในอนาคต = ปฏิเสธ', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    expect(() => service.resolveProbationReviewedAt(future, record)).toThrow(
      BadRequestException,
    );
  });

  it('ก่อนวันเริ่มทดลองงาน = ปฏิเสธ', () => {
    expect(() =>
      service.resolveProbationReviewedAt('2022-03-13T00:00:00.000Z', record),
    ).toThrow(BadRequestException);
  });
});
