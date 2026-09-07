import {
  calculateSeparationTax,
  calculateTaxFromBrackets,
  separationServiceYears,
  type SeparationTaxBracket,
} from './payroll-separation-tax.util';

const THAI_BRACKETS: SeparationTaxBracket[] = [
  { minIncome: 0, maxIncome: 150000, rate: 0 },
  { minIncome: 150000, maxIncome: 300000, rate: 0.05 },
  { minIncome: 300000, maxIncome: 500000, rate: 0.1 },
  { minIncome: 500000, maxIncome: 750000, rate: 0.15 },
  { minIncome: 750000, maxIncome: 1000000, rate: 0.2 },
  { minIncome: 1000000, maxIncome: 2000000, rate: 0.25 },
  { minIncome: 2000000, maxIncome: 5000000, rate: 0.3 },
  { minIncome: 5000000, maxIncome: null, rate: 0.35 },
];

describe('separationServiceYears', () => {
  it('เศษไม่ถึง 6 เดือน ปัดทิ้ง', () => {
    expect(separationServiceYears(65)).toBe(5);
  });

  it('เศษตั้งแต่ 6 เดือน ปัดขึ้นเป็นอีกปี', () => {
    expect(separationServiceYears(66)).toBe(6);
    expect(separationServiceYears(54)).toBe(5);
  });

  it('อายุงานไม่ถึงปี ได้ศูนย์', () => {
    expect(separationServiceYears(5)).toBe(0);
    expect(separationServiceYears(0)).toBe(0);
  });
});

describe('calculateTaxFromBrackets', () => {
  it('เงินได้ในขั้นยกเว้น ไม่มีภาษี', () => {
    expect(calculateTaxFromBrackets(150000, THAI_BRACKETS)).toBe(0);
  });

  it('คิดแบบขั้นบันได ไม่ใช่อัตราเดียวทั้งก้อน', () => {
    // 300,000: 150,000 แรกยกเว้น + 150,000 ถัดไป × 5% = 7,500
    expect(calculateTaxFromBrackets(300000, THAI_BRACKETS)).toBe(7500);
    // 500,000: 7,500 + 200,000 × 10% = 27,500
    expect(calculateTaxFromBrackets(500000, THAI_BRACKETS)).toBe(27500);
  });

  it('ขั้นสูงสุดที่ไม่มีเพดาน ครอบคลุมส่วนที่เกิน', () => {
    // 5,000,000 = 965,000 แล้วบวก 1,000,000 × 35% = 350,000
    const base = calculateTaxFromBrackets(5000000, THAI_BRACKETS);
    expect(calculateTaxFromBrackets(6000000, THAI_BRACKETS)).toBe(
      base + 350000,
    );
  });

  it('เงินได้ศูนย์หรือไม่มีขั้นภาษี ได้ศูนย์', () => {
    expect(calculateTaxFromBrackets(0, THAI_BRACKETS)).toBe(0);
    expect(calculateTaxFromBrackets(500000, [])).toBe(0);
  });
});

describe('calculateSeparationTax', () => {
  it('ค่าชดเชยไม่เกินทั้งสองเพดาน ยกเว้นภาษีทั้งก้อน', () => {
    // ค่าจ้างวันละ 1,000 → เพดานวัน 300,000 · ค่าชดเชย 180,000
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 180000,
      dailyWage: 1000,
      serviceYears: 5,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
    });

    expect(result.exemptAmount).toBe(180000);
    expect(result.taxableSeparationIncome).toBe(0);
    expect(result.separateTax).toBe(0);
  });

  it('เพดาน 300,000 บาทชนะเมื่อค่าจ้างสูง', () => {
    // ค่าจ้างวันละ 5,000 → เพดานวัน 1,500,000 แต่เพดานเงิน 300,000 แคบกว่า
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 1500000,
      dailyWage: 5000,
      serviceYears: 20,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
    });

    expect(result.exemptLimitByDays).toBe(1500000);
    expect(result.exemptLimitByAmount).toBe(300000);
    expect(result.exemptAmount).toBe(300000);
    expect(result.taxableSeparationIncome).toBe(1200000);
  });

  it('เพดานจำนวนวันชนะเมื่อค่าจ้างต่ำ', () => {
    // ค่าจ้างวันละ 500 → เพดานวัน 150,000 ซึ่งแคบกว่า 300,000
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 200000,
      dailyWage: 500,
      serviceYears: 20,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
    });

    expect(result.exemptAmount).toBe(150000);
    expect(result.taxableSeparationIncome).toBe(50000);
  });

  it('ลาออกเอง ไม่ได้สิทธิยกเว้น ต้องเสียภาษีทั้งก้อน', () => {
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 0,
      otherSeparationAmount: 200000,
      dailyWage: 1000,
      serviceYears: 10,
      eligibleForExemption: false,
      brackets: THAI_BRACKETS,
    });

    expect(result.exemptAmount).toBe(0);
    expect(result.exemptLimitByDays).toBeNull();
    expect(result.taxableSeparationIncome).toBe(200000);
  });

  it('ทำงานครบ 5 ปี แยกคำนวณภาษีได้ตามใบแนบ', () => {
    // เงินได้ที่ต้องเสียภาษี 1,200,000 · ค่าใช้จ่าย 7,000 × 20 = 140,000
    // เหลือ 1,060,000 หักกึ่งหนึ่ง 530,000 → เงินได้สุทธิ 530,000
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 1500000,
      dailyWage: 5000,
      serviceYears: 20,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
    });

    expect(result.canCalculateSeparately).toBe(true);
    expect(result.serviceExpense).toBe(140000);
    expect(result.halfDeduction).toBe(530000);
    expect(result.netSeparationIncome).toBe(530000);
    // 530,000 → 27,500 + 30,000 × 15% = 32,000
    expect(result.separateTax).toBe(32000);
  });

  it('ทำงานไม่ถึง 5 ปี แยกคำนวณไม่ได้ ต้องรวมกับเงินได้อื่น', () => {
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 400000,
      dailyWage: 2000,
      serviceYears: 4,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
    });

    expect(result.canCalculateSeparately).toBe(false);
    expect(result.separateTax).toBe(0);
    // ยอดที่ต้องเสียภาษียังคำนวณให้ เพื่อเอาไปรวมกับเงินเดือนทั้งปี
    expect(result.taxableSeparationIncome).toBe(100000);
  });

  it('ค่าใช้จ่ายหักได้ไม่เกินเงินได้ ยอดไม่ติดลบ', () => {
    // ค่าใช้จ่ายตามสูตร 7,000 × 30 = 210,000 แต่เงินได้มีแค่ 50,000
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 200000,
      dailyWage: 500,
      serviceYears: 30,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
    });

    expect(result.serviceExpense).toBe(50000);
    expect(result.netSeparationIncome).toBe(0);
    expect(result.separateTax).toBe(0);
  });

  it('ตั้งเพดานยกเว้นเองได้ ไม่ต้องแก้โค้ด', () => {
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 1500000,
      dailyWage: 5000,
      serviceYears: 20,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
      settings: { exemptMaxAmount: 600000, exemptMaxDays: 400 },
    });

    expect(result.exemptLimitByDays).toBe(2000000);
    expect(result.exemptAmount).toBe(600000);
    expect(result.taxableSeparationIncome).toBe(900000);
  });

  it('ไม่มีเงินก้อนเลย ได้ศูนย์ทุกช่อง ไม่พัง', () => {
    const result = calculateSeparationTax({
      statutorySeveranceAmount: 0,
      dailyWage: 0,
      serviceYears: 0,
      eligibleForExemption: true,
      brackets: THAI_BRACKETS,
    });

    expect(result.grossSeparationIncome).toBe(0);
    expect(result.taxableSeparationIncome).toBe(0);
    expect(result.canCalculateSeparately).toBe(false);
    expect(result.separateTax).toBe(0);
  });
});
