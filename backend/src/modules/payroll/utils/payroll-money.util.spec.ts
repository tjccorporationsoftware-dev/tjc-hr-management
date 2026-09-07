import { addMoney, toMoney, toMoneyString } from './payroll-money.util';

/**
 * เทสต์การปัดเศษเงิน — ทุกยอดในสลิปและไฟล์โอนเงินผ่านตรงนี้
 *
 * ประเด็นที่กันไว้:
 *  1. addMoney ของเดิมไม่ปัด "ผลลัพธ์" คืน 0.30000000000000004 ให้ addMoney(0.1, 0.2)
 *     ค่านั้นถูกใช้เป็นเพดานกันเงินสุทธิติดลบ และสะสมต่อในยอดรวม
 *  2. Math.round ตรง ๆ ปัด 1.005 เป็น 1.00 เพราะ double เก็บเป็น 1.00499999999999989
 */
describe('toMoney', () => {
  it('ปัด 2 ตำแหน่ง', () => {
    expect(toMoney(1.234)).toBe(1.23);
    expect(toMoney(1.235)).toBe(1.24);
  });

  it('ปัด .005 ขึ้นได้จริง ไม่ตกเป็นเหยื่อ floating-point', () => {
    expect(toMoney(1.005)).toBe(1.01);
    expect(toMoney(2.675)).toBe(2.68);
  });

  it('ค่าที่ไม่ใช่ตัวเลขได้ศูนย์', () => {
    expect(toMoney(undefined)).toBe(0);
    expect(toMoney(null)).toBe(0);
    expect(toMoney('ไม่ใช่ตัวเลข')).toBe(0);
    expect(toMoney(Infinity)).toBe(0);
  });

  it('รับค่าติดลบได้', () => {
    expect(toMoney(-1.005)).toBe(-1.01);
  });
});

describe('addMoney', () => {
  it('ผลลัพธ์ต้องถูกปัดแล้ว ไม่ใช่ทศนิยมลอย', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(addMoney(0.1, 0.2, 0.3)).toBe(0.6);
  });

  it('บวกหลายก้อนแล้วยังลงตัวพอดี', () => {
    const values = Array.from({ length: 50 }, () => 0.01);

    expect(addMoney(...values)).toBe(0.5);
  });

  it('ยอดรวมของบรรทัดต้องตรงกับที่เก็บลงฐานข้อมูลเป๊ะ', () => {
    const lines = [1234.005, 2345.675, 999.994];
    const total = addMoney(...lines);

    // เทียบเป็นสตางค์แบบเดียวกับตัวตรวจยอดใน payroll.service
    const lineSatang = lines
      .map((line) => Math.round(toMoney(line) * 100))
      .reduce((sum, value) => sum + value, 0);

    expect(Math.round(total * 100)).toBe(lineSatang);
    expect(toMoneyString(total)).toBe(total.toFixed(2));
  });
});
