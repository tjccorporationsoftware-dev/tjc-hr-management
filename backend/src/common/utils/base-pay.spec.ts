import {
  resolveBasePayForPeriod,
  salaryBasisOf,
} from './salary-rate.util';

/**
 * ค่าจ้างที่จ่ายจริงในงวด ตามฐานค่าจ้าง
 *
 * ก่อนแก้ ระบบไม่มีแนวคิด "ฐานค่าจ้าง" เลย พนักงานรายวันค่าแรงวันละ 500
 * ที่มาทำงาน 29 วัน จึงได้เงินเดือน 500 บาท เพราะระบบเอา baseSalary
 * ไปใส่สลิปตรง ๆ เหมือนเป็นเงินเดือนรายเดือน
 *
 * เคสอ้างอิงคือ 670030 กรุงรัตนะ งวด 26 มิ.ย. – 25 ก.ค. 2026
 * ค่าแรง 500 บาท/วัน มาทำงาน 29 วัน = 14,500 บาท ตรงกับไฟล์ต้นทาง
 */
describe('salaryBasisOf', () => {
  it('อ่านค่าจากบันทึกค่าจ้าง', () => {
    expect(salaryBasisOf({ salaryBasis: 'DAILY' })).toBe('DAILY');
    expect(salaryBasisOf({ salaryBasis: 'HOURLY' })).toBe('HOURLY');
  });

  it('ข้อมูลเก่าที่ไม่มีฟิลด์นี้ ต้องเป็นรายเดือน', () => {
    expect(salaryBasisOf({})).toBe('MONTHLY');
    expect(salaryBasisOf({ salaryBasis: null })).toBe('MONTHLY');
  });
});

describe('resolveBasePayForPeriod', () => {
  const base = { workedDays: 29, workingHoursPerDay: 8 };

  describe('รายเดือน (พฤติกรรมเดิม ห้ามเปลี่ยน)', () => {
    it('จ่ายเต็มตามฐาน ไม่สนจำนวนวันที่มาทำงาน', () => {
      expect(
        resolveBasePayForPeriod({ ...base, basis: 'MONTHLY', baseSalary: 15000 }),
      ).toBe(15000);
    });

    it('มาทำงาน 0 วันก็ยังได้เต็ม เพราะการขาดงานหักด้วยรายการหักแยกต่างหาก', () => {
      expect(
        resolveBasePayForPeriod({
          ...base,
          basis: 'MONTHLY',
          baseSalary: 15000,
          workedDays: 0,
        }),
      ).toBe(15000);
    });

    it('ยอดที่คิดสัดส่วนวันเข้า/ออกกลางงวดมาแล้ว ต้องผ่านไปตามนั้น', () => {
      expect(
        resolveBasePayForPeriod({ ...base, basis: 'MONTHLY', baseSalary: 4333.33 }),
      ).toBe(4333.33);
    });
  });

  describe('รายวัน', () => {
    /* เคสจริง 670030 */
    it('ค่าแรงวันละ 500 มาทำงาน 29 วัน ต้องได้ 14,500', () => {
      expect(
        resolveBasePayForPeriod({ ...base, basis: 'DAILY', baseSalary: 500 }),
      ).toBe(14500);
    });

    it('เข้างานกลางงวด มาทำงาน 9 วัน ต้องได้ตามวันที่มาจริง', () => {
      expect(
        resolveBasePayForPeriod({
          ...base,
          basis: 'DAILY',
          baseSalary: 500,
          workedDays: 9,
        }),
      ).toBe(4500);
    });

    it('ไม่มาทำงานเลย ต้องได้ 0 ไม่ใช่อัตราต่อวัน', () => {
      expect(
        resolveBasePayForPeriod({
          ...base,
          basis: 'DAILY',
          baseSalary: 500,
          workedDays: 0,
        }),
      ).toBe(0);
    });

    it('ค่าแรงมีเศษสตางค์ ต้องปัดครั้งเดียวตอนจบ', () => {
      expect(
        resolveBasePayForPeriod({
          ...base,
          basis: 'DAILY',
          baseSalary: 333.33,
          workedDays: 3,
        }),
      ).toBe(999.99);
    });
  });

  describe('รายชั่วโมง (พาร์ทไทม์)', () => {
    it('ชั่วโมงละ 60 มาทำงาน 20 วัน วันละ 8 ชั่วโมง ต้องได้ 9,600', () => {
      expect(
        resolveBasePayForPeriod({
          basis: 'HOURLY',
          baseSalary: 60,
          workedDays: 20,
          workingHoursPerDay: 8,
        }),
      ).toBe(9600);
    });

    it('บริษัทตั้งวันละ 7 ชั่วโมง ต้องคิดตามนั้น', () => {
      expect(
        resolveBasePayForPeriod({
          basis: 'HOURLY',
          baseSalary: 60,
          workedDays: 20,
          workingHoursPerDay: 7,
        }),
      ).toBe(8400);
    });
  });

  describe('ค่าเสีย', () => {
    it('วันติดลบต้องถือเป็น 0', () => {
      expect(
        resolveBasePayForPeriod({
          ...base,
          basis: 'DAILY',
          baseSalary: 500,
          workedDays: -5,
        }),
      ).toBe(0);
    });

    it('ค่าจ้างเป็น NaN ต้องได้ 0 ไม่ใช่ NaN', () => {
      expect(
        resolveBasePayForPeriod({
          ...base,
          basis: 'DAILY',
          baseSalary: Number.NaN,
        }),
      ).toBe(0);
    });
  });
});
