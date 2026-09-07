import {
  deductsWholeDayAbsence,
  normalizeSalaryBasis,
  resolveMonthlyEquivalentWage,
  resolveSalaryRates,
} from './salary-rate.util';

/**
 * ฐานค่าจ้าง — ที่มาของบั๊กพนักงานรายวัน
 *
 * ระบบเดิมเหมาว่า baseSalary เป็นเงินเดือนรายเดือนเสมอ พนักงานรายวันที่เก็บ
 * ค่าแรงวันละ 500 จึงได้อัตรา OT 500/30/8 = 2.08 บาท/ชม. แทนที่จะเป็น 62.50
 *
 * ข้อกำหนดที่ห้ามพังคือ "ข้อมูลเก่าที่ไม่มีฐานต้องคำนวณเหมือนเดิมทุกบาท"
 */
const SETTINGS = { salaryDivisorDays: 30, workingHoursPerDay: 8 };

describe('normalizeSalaryBasis', () => {
  it('ค่าที่ระบบรู้จัก ต้องคงไว้', () => {
    expect(normalizeSalaryBasis('DAILY')).toBe('DAILY');
    expect(normalizeSalaryBasis('HOURLY')).toBe('HOURLY');
    expect(normalizeSalaryBasis('MONTHLY')).toBe('MONTHLY');
  });

  it('ไม่มีค่า / ค่าแปลก ต้องถอยไป MONTHLY', () => {
    expect(normalizeSalaryBasis(null)).toBe('MONTHLY');
    expect(normalizeSalaryBasis(undefined)).toBe('MONTHLY');
    expect(normalizeSalaryBasis('WEEKLY')).toBe('MONTHLY');
    expect(normalizeSalaryBasis(0)).toBe('MONTHLY');
  });
});

describe('resolveSalaryRates', () => {
  it('รายเดือน 15,000 -> วันละ 500 ชั่วโมงละ 62.50', () => {
    const r = resolveSalaryRates(15000, SETTINGS, 'MONTHLY');

    expect(r.exactDailyRate).toBe(500);
    expect(r.exactHourlyRate).toBe(62.5);
  });

  it('รายวัน 500 -> วันละ 500 ชั่วโมงละ 62.50 (ไม่หารด้วย 30 ซ้ำ)', () => {
    const r = resolveSalaryRates(500, SETTINGS, 'DAILY');

    expect(r.exactDailyRate).toBe(500);
    expect(r.exactHourlyRate).toBe(62.5);
  });

  it('รายชั่วโมง 60 -> ชั่วโมงละ 60 วันละ 480', () => {
    const r = resolveSalaryRates(60, SETTINGS, 'HOURLY');

    expect(r.exactHourlyRate).toBe(60);
    expect(r.exactDailyRate).toBe(480);
  });

  it('ไม่ส่งฐานมา ต้องได้ผลเท่ากับรายเดือนเป๊ะ ๆ', () => {
    expect(resolveSalaryRates(23500, SETTINGS)).toEqual(
      resolveSalaryRates(23500, SETTINGS, 'MONTHLY'),
    );
  });

  it('ไม่ส่ง settings มา ต้องใช้ 30 วัน 8 ชั่วโมงตามค่าเดิมของระบบ', () => {
    const r = resolveSalaryRates(24000);

    expect(r.exactDailyRate).toBe(800);
    expect(r.exactHourlyRate).toBe(100);
  });

  it('settings ที่เป็น 0 หรือค่าเสีย ต้องไม่ทำให้หารด้วยศูนย์', () => {
    const r = resolveSalaryRates(24000, {
      salaryDivisorDays: 0,
      workingHoursPerDay: Number.NaN,
    });

    expect(r.exactDailyRate).toBe(800);
    expect(r.exactHourlyRate).toBe(100);
  });

  it('ไม่มีค่าจ้าง ต้องได้ 0 ไม่ใช่ NaN', () => {
    expect(resolveSalaryRates(null, SETTINGS, 'DAILY')).toEqual({
      basis: 'DAILY',
      exactDailyRate: 0,
      exactHourlyRate: 0,
    });
  });

  it('ไม่ปัดเศษระหว่างทาง เพื่อให้ยอด OT ไม่เพี้ยนหลักสตางค์', () => {
    // 55,000 OT 4.5 ชม. อัตรา 1.5 เท่า ต้องได้ 1,546.88
    const r = resolveSalaryRates(55000, SETTINGS, 'MONTHLY');

    expect(Math.round(4.5 * r.exactHourlyRate * 1.5 * 100) / 100).toBe(1546.88);
  });
});

describe('deductsWholeDayAbsence', () => {
  /*
   * รายวัน/รายชั่วโมงได้ค่าจ้างตามวันที่มาทำงานจริง วันที่ขาดงานไม่มีเงินตั้งต้น
   * ถ้ายังหักค่าขาดงานอีกจะเสียสองเท่า
   */
  it('รายเดือนยังหักค่าขาดงานเหมือนเดิม', () => {
    expect(deductsWholeDayAbsence('MONTHLY')).toBe(true);
    expect(deductsWholeDayAbsence(null)).toBe(true);
  });

  it('รายวัน/รายชั่วโมงต้องไม่หักค่าขาดงานซ้ำ', () => {
    expect(deductsWholeDayAbsence('DAILY')).toBe(false);
    expect(deductsWholeDayAbsence('HOURLY')).toBe(false);
  });
});

/**
 * ค่าจ้างเทียบเท่ารายเดือน — ใช้กับค่าชดเชย หนังสือรับรอง และหน้าประมาณการ
 *
 * ถ้าไม่แปลง หนังสือรับรองของพนักงานรายวันจะเขียนว่าเงินเดือน 500 บาท
 * และค่าชดเชยเลิกจ้างจะเหลือ 1/30 ของที่กฎหมายกำหนด
 */
describe('resolveMonthlyEquivalentWage', () => {
  it('รายเดือน คืนค่าเดิมไม่แตะ', () => {
    expect(resolveMonthlyEquivalentWage(15000, SETTINGS, 'MONTHLY')).toBe(15000);
    expect(resolveMonthlyEquivalentWage(23500, SETTINGS)).toBe(23500);
  });

  /* เคสจริง 670030 ค่าแรงวันละ 500 */
  it('รายวัน 500 -> เทียบเท่าเดือนละ 15,000', () => {
    expect(resolveMonthlyEquivalentWage(500, SETTINGS, 'DAILY')).toBe(15000);
  });

  it('รายชั่วโมง 60 -> เทียบเท่าเดือนละ 14,400', () => {
    expect(resolveMonthlyEquivalentWage(60, SETTINGS, 'HOURLY')).toBe(14400);
  });

  it('ตัวหารของบริษัทไม่ใช่ 30 ต้องใช้ตามที่ตั้งไว้', () => {
    expect(
      resolveMonthlyEquivalentWage(500, { salaryDivisorDays: 26, workingHoursPerDay: 8 }, 'DAILY'),
    ).toBe(13000);
  });

  it('ไม่มีค่าจ้าง ต้องได้ 0 ไม่ใช่ NaN', () => {
    expect(resolveMonthlyEquivalentWage(null, SETTINGS, 'DAILY')).toBe(0);
    expect(resolveMonthlyEquivalentWage(0, SETTINGS, 'MONTHLY')).toBe(0);
  });

  /*
   * ค่าชดเชยตาม ม.118 คิดเป็นจำนวนวันของค่าจ้างอัตราสุดท้าย
   * ทำงานครบ 3 ปี = ค่าจ้าง 180 วัน = 6 เท่าของค่าจ้างรายเดือน
   * พนักงานรายวัน 500 บาท จึงต้องได้ 500 x 180 = 90,000 เท่ากับ 15,000 x 6
   */
  it('ฐานค่าชดเชยของรายวันต้องเท่ากับอัตราต่อวันคูณจำนวนวันตามกฎหมาย', () => {
    const monthly = resolveMonthlyEquivalentWage(500, SETTINGS, 'DAILY');

    expect(monthly * 6).toBe(500 * 180);
  });
});
