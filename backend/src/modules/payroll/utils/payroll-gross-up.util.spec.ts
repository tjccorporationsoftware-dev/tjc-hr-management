import { calculateGrossUp, grossUpAtFlatRate } from './payroll-gross-up.util';
import {
  calculateTaxFromBrackets,
  type SeparationTaxBracket,
} from './payroll-separation-tax.util';

const THAI_BRACKETS: SeparationTaxBracket[] = [
  { minIncome: 0, maxIncome: 150000, rate: 0 },
  { minIncome: 150000, maxIncome: 300000, rate: 0.05 },
  { minIncome: 300000, maxIncome: 500000, rate: 0.1 },
  { minIncome: 500000, maxIncome: 750000, rate: 0.15 },
  { minIncome: 750000, maxIncome: 1000000, rate: 0.2 },
  { minIncome: 1000000, maxIncome: null, rate: 0.25 },
];

describe('grossUpAtFlatRate', () => {
  it('อัตราคงที่ใช้สูตรตรง', () => {
    // ต้องการสุทธิ 95,000 ที่อัตรา 5% → 100,000
    const result = grossUpAtFlatRate(95000, 0.05);
    expect(result.grossAmount).toBe(100000);
    expect(result.taxAmount).toBe(5000);
    expect(result.netAmount).toBe(95000);
  });

  it('อัตรา 0 หรือติดลบ ไม่ต้อง gross-up', () => {
    expect(grossUpAtFlatRate(50000, 0).grossAmount).toBe(50000);
    expect(grossUpAtFlatRate(50000, -0.1).grossAmount).toBe(50000);
  });

  it('อัตรา 100% ขึ้นไป หาคำตอบไม่ได้ คืนยอดเดิมแทนการหารด้วยศูนย์', () => {
    const result = grossUpAtFlatRate(50000, 1);
    expect(Number.isFinite(result.grossAmount)).toBe(true);
    expect(result.grossAmount).toBe(50000);
  });

  it('ยอดสุทธิศูนย์ ได้ศูนย์', () => {
    expect(grossUpAtFlatRate(0, 0.05).grossAmount).toBe(0);
  });
});

describe('calculateGrossUp', () => {
  it('อัตราคงที่ ได้ผลตรงกับสูตรตรง', () => {
    const result = calculateGrossUp({
      targetNet: 95000,
      taxOf: (gross) => gross * 0.05,
    });

    expect(result.grossAmount).toBeCloseTo(100000, 2);
    expect(result.taxAmount).toBeCloseTo(5000, 2);
    expect(result.converged).toBe(true);
  });

  it('อัตราขั้นบันได ยอดสุทธิที่ได้ตรงกับที่ต้องการ', () => {
    const targetNet = 500000;
    const result = calculateGrossUp({
      targetNet,
      taxOf: (gross) => calculateTaxFromBrackets(gross, THAI_BRACKETS),
    });

    expect(result.converged).toBe(true);
    expect(result.netAmount).toBeCloseTo(targetNet, 1);
    // ต้องตั้งจ่ายมากกว่ายอดสุทธิ เพราะบริษัทออกภาษีให้
    expect(result.grossAmount).toBeGreaterThan(targetNet);
    expect(result.employerExtraCost).toBeCloseTo(
      result.grossAmount - targetNet,
      2,
    );
  });

  it('ยอดสุทธิอยู่ในขั้นยกเว้นภาษี ไม่ต้อง gross-up', () => {
    const result = calculateGrossUp({
      targetNet: 100000,
      taxOf: (gross) => calculateTaxFromBrackets(gross, THAI_BRACKETS),
    });

    expect(result.grossAmount).toBeCloseTo(100000, 2);
    expect(result.taxAmount).toBe(0);
  });

  it('ยอดใหญ่ที่ข้ามหลายขั้นภาษี ก็ยังลู่เข้า', () => {
    const targetNet = 3000000;
    const result = calculateGrossUp({
      targetNet,
      taxOf: (gross) => calculateTaxFromBrackets(gross, THAI_BRACKETS),
    });

    expect(result.converged).toBe(true);
    expect(result.netAmount).toBeCloseTo(targetNet, 1);
  });

  it('ยอดสุทธิศูนย์หรือติดลบ ได้ศูนย์ ไม่วนซ้ำ', () => {
    const zero = calculateGrossUp({ targetNet: 0, taxOf: () => 100 });
    expect(zero.grossAmount).toBe(0);
    expect(zero.iterations).toBe(0);

    expect(
      calculateGrossUp({ targetNet: -5000, taxOf: () => 0 }).grossAmount,
    ).toBe(0);
  });

  it('ฟังก์ชันภาษีคืนค่าเพี้ยน ก็ไม่ทำให้ผลลัพธ์พัง', () => {
    const result = calculateGrossUp({
      targetNet: 50000,
      taxOf: () => Number.NaN,
    });

    expect(Number.isFinite(result.grossAmount)).toBe(true);
    expect(result.grossAmount).toBeCloseTo(50000, 2);
  });

  it('ภาษีสูงกว่ายอดที่จ่าย ถูกจำกัดไม่ให้สุทธิติดลบ', () => {
    const result = calculateGrossUp({
      targetNet: 10000,
      taxOf: (gross) => gross * 2,
    });

    expect(Number.isFinite(result.grossAmount)).toBe(true);
    expect(result.netAmount).toBeGreaterThanOrEqual(0);
  });
});
