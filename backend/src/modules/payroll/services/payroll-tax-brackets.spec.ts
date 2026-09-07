import { PayrollTaxCalculatorService } from './payroll-tax-calculator.service';

/**
 * ขั้นภาษีตั้งต้นต้องต่อเนื่อง ไม่มีช่องว่าง
 *
 * สูตรคิดภาษีเป็น min(รายได้, เพดาน) − ขอบล่าง ซึ่งคิดเฉพาะส่วนที่เกินอยู่แล้ว
 * การเว้น +0.01 จึงไม่ได้กันการนับซ้ำ แต่ทำให้ตัวตรวจของระบบเองแจ้งเตือน
 * TAX_BRACKET_NOT_CONTINUOUS กับทุกบริษัทที่สร้างใหม่
 */
type Calculator = {
  calculateAnnualTax(netTaxableIncome: number, brackets: unknown[]): number;
};

// ชุดเดียวกับ DEFAULT_THAI_TAX_BRACKETS ใน payroll-tax.service.ts
const BRACKETS = [
  { minIncome: 0, maxIncome: 150000, rate: 0 },
  { minIncome: 150000, maxIncome: 300000, rate: 0.05 },
  { minIncome: 300000, maxIncome: 500000, rate: 0.1 },
  { minIncome: 500000, maxIncome: 750000, rate: 0.15 },
  { minIncome: 750000, maxIncome: 1000000, rate: 0.2 },
  { minIncome: 1000000, maxIncome: 2000000, rate: 0.25 },
  { minIncome: 2000000, maxIncome: 5000000, rate: 0.3 },
  { minIncome: 5000000, maxIncome: null, rate: 0.35 },
];

describe('ขั้นภาษีเงินได้บุคคลธรรมดา', () => {
  const service = Object.create(
    PayrollTaxCalculatorService.prototype,
  ) as unknown as Calculator;

  it('ขอบขั้นต่อเนื่องกันทุกช่วง และขั้นสุดท้ายไม่มีเพดาน', () => {
    for (let i = 0; i < BRACKETS.length - 1; i += 1) {
      expect(BRACKETS[i].maxIncome).toBe(BRACKETS[i + 1].minIncome);
    }
    expect(BRACKETS[0].minIncome).toBe(0);
    expect(BRACKETS[BRACKETS.length - 1].maxIncome).toBeNull();
  });

  it.each([
    [150000, 0],
    [200000, 2500],
    [300000, 7500],
    [500000, 27500],
    [646750, 49512.5],
    [1000000, 115000],
  ])('เงินได้สุทธิ %s บาท → ภาษี %s บาท', (income, expected) => {
    expect(service.calculateAnnualTax(income, BRACKETS)).toBe(expected);
  });

  it('ไม่มีช่วงรายได้ที่หลุดการคำนวณตรงรอยต่อขั้น', () => {
    // เดิมขอบล่างเป็น 150,000.01 ทำให้เศษ 0.01 บาทตรงรอยต่อไม่ถูกคิด
    const atBoundary = service.calculateAnnualTax(150001, BRACKETS);
    expect(atBoundary).toBe(0.05);
  });
});
