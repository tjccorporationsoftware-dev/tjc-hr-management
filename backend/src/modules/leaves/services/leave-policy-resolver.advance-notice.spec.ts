import { BadRequestException } from '@nestjs/common';

import { LeavePolicyResolverService } from './leave-policy-resolver.service';

/**
 * ด่าน "ต้องยื่นล่วงหน้ากี่วัน" — นับเฉพาะวันเต็มระหว่างวันยื่นกับวันลา ไม่นับวันยื่น
 *
 * ลูกค้าขอ (2569-09-11): ตั้ง 1 วัน ยื่นวันที่ 10 → ลาได้เร็วสุดวันที่ 12
 * ของเดิมนับ 10→11 เป็น 1 วัน ทำให้ยื่นเย็นวันนี้แล้วหยุดพรุ่งนี้ได้เลย
 */
describe('LeavePolicyResolverService · assertEligible ด่านลาล่วงหน้า', () => {
  const service = Object.create(
    LeavePolicyResolverService.prototype,
  ) as LeavePolicyResolverService;

  const leaveType = {
    id: 'lt-1',
    nameTh: 'ลาพักร้อน',
    code: 'ANNUAL',
    referenceCode: '06',
    advanceNoticeDays: 1,
    genderEligibility: 'ALL',
    serviceStartBasis: 'HIRE_DATE',
    prorateFirstYear: false,
    enforceQuotaLimit: true,
    quotaAccrualYears: 1,
  } as never;

  const employee = {
    profile: { gender: 'FEMALE' },
    startDate: new Date(2025, 0, 1),
    probationPassedAt: new Date(2025, 3, 1),
  } as never;

  const submittedOn = new Date(2026, 8, 10, 15, 30);

  const call = (startDate: Date) =>
    service.assertEligible({
      leaveType,
      employee,
      startDate,
      isRetroactive: false,
      submittedOn,
    });

  it('ยื่นวันที่ 10 ลาวันที่ 11 → ไม่ผ่าน (ล่วงหน้า 0 วัน)', () => {
    expect(() => call(new Date(2026, 8, 11))).toThrow(BadRequestException);
  });

  it('ยื่นวันที่ 10 ลาวันที่ 12 → ผ่าน (ล่วงหน้า 1 วัน)', () => {
    expect(() => call(new Date(2026, 8, 12))).not.toThrow();
  });

  it('ยื่นวันเดียวกับวันลา → ไม่ผ่าน', () => {
    expect(() => call(new Date(2026, 8, 10))).toThrow(BadRequestException);
  });
});
