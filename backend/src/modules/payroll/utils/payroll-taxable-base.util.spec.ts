import { splitTaxableIncome } from './payroll-taxable-base.util';

/**
 * ฐานเงินได้ที่ส่งให้ Tax Engine
 *
 * กติกา
 *   EARNING   -> บวกเข้าฐาน (แยกเป็น เงินเดือนประจำ / โบนัส / เงินก้อนอื่น)
 *   DEDUCTION -> ลบออกจากฐาน เฉพาะรายการที่ติดธง isTaxable
 *                (ลาไม่รับค่าจ้าง ขาดงาน = ลูกจ้างไม่ได้รับเงินก้อนนั้นจริง)
 */
const salary = (amount: number) => ({
  type: 'EARNING',
  sourceType: 'BASE_SALARY',
  code: 'BASE_SALARY',
  amount,
  isTaxable: true,
});

const allowance = (amount: number, isTaxable = true) => ({
  type: 'EARNING',
  sourceType: 'ALLOWANCE',
  code: 'POSITION_ALLOWANCE',
  amount,
  isTaxable,
});

const bonus = (amount: number) => ({
  type: 'EARNING',
  sourceType: 'BONUS',
  code: 'BONUS',
  amount,
  isTaxable: true,
});

/** ลาไม่รับค่าจ้าง / ขาดงาน — ลดฐานภาษี */
const wageReducingDeduction = (amount: number) => ({
  type: 'DEDUCTION',
  sourceType: 'LEAVE',
  code: 'UNPAID_LEAVE_DEDUCTION',
  amount,
  isTaxable: true,
});

/** ค่าปรับ / ภาษี / ประกันสังคม — ไม่ลดฐาน */
const netPayDeduction = (amount: number, code = 'LATE_DEDUCTION') => ({
  type: 'DEDUCTION',
  sourceType: 'ATTENDANCE',
  code,
  amount,
  isTaxable: false,
});

describe('ฐานเงินได้ที่ใช้คำนวณภาษี', () => {
  const split = splitTaxableIncome;

  describe('รายได้', () => {
    it('แยกเงินเดือนประจำ โบนัส และเงินก้อนอื่นออกจากกัน', () => {
      const result = split([salary(30000), allowance(5000), bonus(20000)]);

      expect(result.regularTaxableIncome).toBe(35000);
      expect(result.bonusIncome).toBe(20000);
      expect(result.totalTaxableIncome).toBe(55000);
    });

    it('รายได้ที่ยกเว้นภาษีไม่เข้าฐาน', () => {
      const result = split([salary(30000), allowance(5000, false)]);

      expect(result.totalTaxableIncome).toBe(30000);
    });
  });

  describe('รายการหักที่ลดฐาน', () => {
    it('ลาไม่รับค่าจ้าง ลดฐานภาษีตามจำนวนที่หัก', () => {
      // เงินเดือน 30,000 ลาไม่รับค่าจ้าง 3 วัน = 3,000
      const result = split([salary(30000), wageReducingDeduction(3000)]);

      expect(result.regularTaxableIncome).toBe(27000);
      expect(result.totalTaxableIncome).toBe(27000);
    });

    it('ค่าปรับมาสายไม่ลดฐาน เพราะค่าจ้างเกิดขึ้นครบแล้ว', () => {
      const result = split([salary(30000), netPayDeduction(500)]);

      expect(result.regularTaxableIncome).toBe(30000);
    });

    it('ภาษีและประกันสังคมที่หักไป ไม่ลดฐานของตัวเอง', () => {
      const result = split([
        salary(30000),
        netPayDeduction(750, 'SOCIAL_SECURITY'),
        netPayDeduction(1200, 'TAX'),
      ]);

      expect(result.regularTaxableIncome).toBe(30000);
    });

    it('หักหลายรายการรวมกันได้', () => {
      const result = split([
        salary(30000),
        wageReducingDeduction(3000),
        wageReducingDeduction(1000),
        netPayDeduction(500),
      ]);

      expect(result.regularTaxableIncome).toBe(26000);
    });

    it('โบนัสไม่ถูกลดจากรายการหักค่าจ้าง', () => {
      const result = split([
        salary(30000),
        bonus(20000),
        wageReducingDeduction(3000),
      ]);

      expect(result.bonusIncome).toBe(20000);
      expect(result.regularTaxableIncome).toBe(27000);
      expect(result.totalTaxableIncome).toBe(47000);
    });

    it('หักเกินเงินเดือน ฐานไม่ติดลบ', () => {
      const result = split([salary(10000), wageReducingDeduction(15000)]);

      expect(result.regularTaxableIncome).toBe(0);
      expect(result.totalTaxableIncome).toBe(0);
    });
  });

  describe('ความเข้ากันได้กับข้อมูลเดิม', () => {
    it('ไม่มีรายการหักเลย ผลเท่าเดิมทุกประการ', () => {
      const result = split([salary(30000), allowance(5000)]);

      expect(result).toEqual({
        totalTaxableIncome: 35000,
        regularTaxableIncome: 35000,
        bonusIncome: 0,
        otherOneTimeIncome: 0,
      });
    });

    it('บรรทัดข้อมูลประกอบ (INFO) ไม่กระทบฐาน', () => {
      const result = split([
        salary(30000),
        {
          type: 'INFO',
          sourceType: 'LEAVE',
          code: 'PAID_LEAVE_DAYS',
          amount: 2,
          isTaxable: false,
        },
      ]);

      expect(result.totalTaxableIncome).toBe(30000);
    });
  });
});
