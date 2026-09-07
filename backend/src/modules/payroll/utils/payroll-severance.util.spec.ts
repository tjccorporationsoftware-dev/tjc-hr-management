import {
  calculateSeverance,
  isEligibleForStatutorySeverance,
  resolveSeveranceDays,
  serviceMonthsBetween,
  STATUTORY_SEVERANCE_TIERS,
  type SeverancePayTier,
} from './payroll-severance.util';

/** บันไดตามมาตรา 118 ที่ระบบใช้เป็นค่าตั้งต้น */
const STATUTORY_TIERS: SeverancePayTier[] = [
  { minServiceMonths: 4, payDays: 30 },
  { minServiceMonths: 12, payDays: 90 },
  { minServiceMonths: 36, payDays: 180 },
  { minServiceMonths: 72, payDays: 240 },
  { minServiceMonths: 120, payDays: 300 },
  { minServiceMonths: 240, payDays: 400 },
];

describe('resolveSeveranceDays', () => {
  it('อายุงานไม่ถึงขั้นต่ำสุด ไม่ได้ค่าชดเชย', () => {
    expect(resolveSeveranceDays(3, STATUTORY_TIERS)).toBe(0);
    expect(resolveSeveranceDays(0, STATUTORY_TIERS)).toBe(0);
  });

  it('ได้ขั้นสูงสุดที่อายุงานถึง', () => {
    expect(resolveSeveranceDays(4, STATUTORY_TIERS)).toBe(30);
    expect(resolveSeveranceDays(11, STATUTORY_TIERS)).toBe(30);
    expect(resolveSeveranceDays(12, STATUTORY_TIERS)).toBe(90);
    expect(resolveSeveranceDays(35, STATUTORY_TIERS)).toBe(90);
    expect(resolveSeveranceDays(36, STATUTORY_TIERS)).toBe(180);
    expect(resolveSeveranceDays(72, STATUTORY_TIERS)).toBe(240);
    expect(resolveSeveranceDays(120, STATUTORY_TIERS)).toBe(300);
    expect(resolveSeveranceDays(240, STATUTORY_TIERS)).toBe(400);
    expect(resolveSeveranceDays(600, STATUTORY_TIERS)).toBe(400);
  });

  it('บันไดเรียงสลับก็ได้ผลเท่ากัน', () => {
    const shuffled = [...STATUTORY_TIERS].reverse();
    expect(resolveSeveranceDays(80, shuffled)).toBe(240);
  });

  it('ไม่มีบันไดเลย ได้ศูนย์ ไม่พัง', () => {
    expect(resolveSeveranceDays(120, [])).toBe(0);
  });
});

describe('isEligibleForStatutorySeverance', () => {
  it('เลิกจ้างและเกษียณได้ค่าชดเชย', () => {
    expect(isEligibleForStatutorySeverance('TERMINATION')).toBe(true);
    expect(isEligibleForStatutorySeverance('RETIREMENT')).toBe(true);
  });

  it('ลาออกเองและเลิกจ้างเพราะทำผิดร้ายแรง ไม่ได้ค่าชดเชย', () => {
    expect(isEligibleForStatutorySeverance('RESIGNATION')).toBe(false);
    expect(isEligibleForStatutorySeverance('TERMINATION_WITH_CAUSE')).toBe(
      false,
    );
  });
});

describe('calculateSeverance', () => {
  it('เลิกจ้างอายุงาน 5 ปี ได้ค่าชดเชย 180 วัน', () => {
    const result = calculateSeverance({
      reason: 'TERMINATION',
      monthlyWage: 30000,
      serviceMonths: 60,
      tiers: STATUTORY_TIERS,
    });

    expect(result.dailyWage).toBe(1000);
    expect(result.severanceDays).toBe(180);
    expect(result.statutorySeveranceAmount).toBe(180000);
    expect(result.totalAmount).toBe(180000);
  });

  it('ลาออกเอง ไม่ได้ค่าชดเชย แต่ยังได้ค่าวันลาคงเหลือ', () => {
    const result = calculateSeverance({
      reason: 'RESIGNATION',
      monthlyWage: 30000,
      serviceMonths: 60,
      tiers: STATUTORY_TIERS,
      unusedLeaveDays: 5,
    });

    expect(result.severanceDays).toBe(0);
    expect(result.statutorySeveranceAmount).toBe(0);
    expect(result.totalAmount).toBe(5000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].code).toBe('UNUSED_LEAVE');
  });

  it('เลิกจ้างเพราะทำผิดร้ายแรง ไม่ได้ค่าชดเชยและไม่ได้ค่าบอกกล่าว', () => {
    const result = calculateSeverance({
      reason: 'TERMINATION_WITH_CAUSE',
      monthlyWage: 30000,
      serviceMonths: 120,
      tiers: STATUTORY_TIERS,
    });

    expect(result.severanceDays).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it('รวมค่าบอกกล่าวล่วงหน้า วันลาคงเหลือ และค่าชดเชยพิเศษ', () => {
    const result = calculateSeverance({
      reason: 'TERMINATION',
      monthlyWage: 30000,
      serviceMonths: 12,
      tiers: STATUTORY_TIERS,
      noticePayDays: 30,
      unusedLeaveDays: 6,
      specialSeveranceDays: 30,
      otherSeparationPay: 10000,
    });

    // 90 + 30 + 6 + 30 = 156 วัน × 1,000 + เงินอื่น 10,000
    expect(result.totalAmount).toBe(166000);
    // สิทธิยกเว้นภาษีนับเฉพาะค่าชดเชยตามกฎหมาย 90 วัน
    expect(result.statutorySeveranceAmount).toBe(90000);
    expect(result.lines.map((line) => line.code)).toEqual([
      'SEVERANCE',
      'NOTICE_PAY',
      'UNUSED_LEAVE',
      'SPECIAL_SEVERANCE',
      'OTHER',
    ]);
  });

  it('ใช้ตัวหารค่าจ้างต่อวันของบริษัทได้', () => {
    const result = calculateSeverance({
      reason: 'TERMINATION',
      monthlyWage: 31000,
      serviceMonths: 12,
      tiers: STATUTORY_TIERS,
      salaryDivisorDays: 31,
    });

    expect(result.dailyWage).toBe(1000);
    expect(result.statutorySeveranceAmount).toBe(90000);
  });

  it('ค่าจ้างเป็นศูนย์หรือติดลบ ไม่ทำให้ยอดติดลบ', () => {
    const result = calculateSeverance({
      reason: 'TERMINATION',
      monthlyWage: -5000,
      serviceMonths: 60,
      tiers: STATUTORY_TIERS,
      unusedLeaveDays: -3,
    });

    expect(result.dailyWage).toBe(0);
    expect(result.totalAmount).toBe(0);
  });
});

describe('serviceMonthsBetween', () => {
  it('นับครบเดือนพอดี', () => {
    expect(
      serviceMonthsBetween(new Date('2020-01-15'), new Date('2021-01-15')),
    ).toBe(12);
  });

  it('ยังไม่ถึงวันครบเดือน ตัดเดือนสุดท้ายทิ้ง', () => {
    expect(
      serviceMonthsBetween(new Date('2020-01-15'), new Date('2021-01-14')),
    ).toBe(11);
  });

  it('วันสุดท้ายอยู่ก่อนวันเริ่มงาน ได้ศูนย์', () => {
    expect(
      serviceMonthsBetween(new Date('2021-01-15'), new Date('2020-01-15')),
    ).toBe(0);
  });

  it('อายุงานยาว 20 ปี', () => {
    expect(
      serviceMonthsBetween(new Date('2004-03-01'), new Date('2024-03-01')),
    ).toBe(240);
  });
});

/*
 * กันการถอยหลัง: ก่อนหน้านี้ระบบไม่เคยมีบันไดตั้งต้น ทำให้บริษัทที่ยังไม่ได้
 * ตั้งค่าเองได้ค่าชดเชย 0 บาททุกกรณี ซึ่งผิดมาตรา 118
 */
describe('STATUTORY_SEVERANCE_TIERS — ค่าตั้งต้นตามมาตรา 118', () => {
  it('ตรงกับบันไดที่กฎหมายกำหนดทุกขั้น', () => {
    expect(resolveSeveranceDays(3, STATUTORY_SEVERANCE_TIERS)).toBe(0);
    expect(resolveSeveranceDays(4, STATUTORY_SEVERANCE_TIERS)).toBe(30);
    expect(resolveSeveranceDays(12, STATUTORY_SEVERANCE_TIERS)).toBe(90);
    expect(resolveSeveranceDays(36, STATUTORY_SEVERANCE_TIERS)).toBe(180);
    expect(resolveSeveranceDays(72, STATUTORY_SEVERANCE_TIERS)).toBe(240);
    expect(resolveSeveranceDays(120, STATUTORY_SEVERANCE_TIERS)).toBe(300);
    expect(resolveSeveranceDays(240, STATUTORY_SEVERANCE_TIERS)).toBe(400);
  });

  it('เคสจริง: อายุงาน 10 ปี เงินเดือน 30,000 ต้องได้ 300,000 ไม่ใช่ 0', () => {
    const result = calculateSeverance({
      monthlyWage: 30000,
      serviceMonths: 120,
      reason: 'TERMINATION',
      tiers: STATUTORY_SEVERANCE_TIERS,
    });

    expect(result.severanceDays).toBe(300);
    expect(result.statutorySeveranceAmount).toBe(300000);
  });
});
