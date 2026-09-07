import {
  resolveDeductionForPeriod,
  resolveDeductionsForPeriod,
  resolveOutstandingBalance,
} from './payroll-deduction-plan.util';

/**
 * สูตรหักเงินเดือนแบบผ่อนงวด — กยศ. เงินกู้พนักงาน สหกรณ์
 *
 * ตัวเลขนี้ไปโผล่ในสลิปและแบบนำส่ง ถ้าหักผิดคือหนี้ของพนักงานผิดตาม
 */
describe('payroll-deduction-plan.util', () => {
  const plan = (
    overrides: Partial<Parameters<typeof resolveDeductionForPeriod>[0]> = {},
  ) => ({
    totalAmount: 12000,
    installmentAmount: 1000,
    paidAmount: 0,
    allowPartialDeduction: true,
    ...overrides,
  });

  describe('resolveOutstandingBalance', () => {
    it('ยอดคงเหลือ = ยอดเต็ม ลบที่หักไปแล้ว', () => {
      expect(
        resolveOutstandingBalance({ totalAmount: 12000, paidAmount: 3000 }),
      ).toBe(9000);
    });

    it('หักเกินยอดเต็ม ไม่ติดลบ', () => {
      expect(
        resolveOutstandingBalance({ totalAmount: 12000, paidAmount: 15000 }),
      ).toBe(0);
    });

    it('ไม่กำหนดยอดเต็ม = หักไปเรื่อย ๆ', () => {
      expect(
        resolveOutstandingBalance({ totalAmount: null, paidAmount: 5000 }),
      ).toBeNull();
    });
  });

  describe('หักปกติ', () => {
    it('หักตามงวดที่ตั้งไว้ และลดยอดคงเหลือ', () => {
      const result = resolveDeductionForPeriod(plan(), 30000);

      expect(result.amount).toBe(1000);
      expect(result.balanceBefore).toBe(12000);
      expect(result.balanceAfter).toBe(11000);
      expect(result.isPartial).toBe(false);
      expect(result.completed).toBe(false);
    });

    it('งวดสุดท้ายหักเท่าที่เหลือ ไม่หักเกินหนี้', () => {
      const result = resolveDeductionForPeriod(
        plan({ paidAmount: 11600 }),
        30000,
      );

      expect(result.amount).toBe(400);
      expect(result.balanceAfter).toBe(0);
      expect(result.completed).toBe(true);
    });

    it('หักครบแล้ว ไม่หักซ้ำอีก', () => {
      const result = resolveDeductionForPeriod(
        plan({ paidAmount: 12000 }),
        30000,
      );

      expect(result.amount).toBe(0);
      expect(result.skippedReason).toBe('NO_BALANCE');
      expect(result.completed).toBe(true);
    });

    it('ไม่กำหนดยอดเต็ม หักตามงวดไปเรื่อย ๆ', () => {
      const result = resolveDeductionForPeriod(
        plan({ totalAmount: null, paidAmount: 50000 }),
        30000,
      );

      expect(result.amount).toBe(1000);
      expect(result.completed).toBe(false);
    });
  });

  describe('เงินเดือนเหลือไม่พอ', () => {
    it('หักเท่าที่หักได้ เมื่ออนุญาตให้หักบางส่วน', () => {
      const result = resolveDeductionForPeriod(plan(), 600);

      expect(result.amount).toBe(600);
      expect(result.isPartial).toBe(true);
      expect(result.balanceAfter).toBe(11400);
    });

    it('ข้ามงวดไปเลย เมื่อไม่อนุญาตให้หักบางส่วน', () => {
      const result = resolveDeductionForPeriod(
        plan({ allowPartialDeduction: false }),
        600,
      );

      expect(result.amount).toBe(0);
      expect(result.skippedReason).toBe('PARTIAL_NOT_ALLOWED');
      expect(result.balanceAfter).toBe(12000);
    });

    it('ไม่เหลือเงินให้หักเลย', () => {
      const result = resolveDeductionForPeriod(plan(), 0);

      expect(result.amount).toBe(0);
      expect(result.skippedReason).toBe('NO_NET_PAY');
    });

    it('เงินสุทธิไม่ติดลบจากการหักหนี้', () => {
      const result = resolveDeductionForPeriod(
        plan({ installmentAmount: 5000 }),
        1200,
      );

      expect(result.amount).toBe(1200);
      expect(result.amount).toBeLessThanOrEqual(1200);
    });
  });

  describe('หักหลายแผนพร้อมกัน', () => {
    const studentLoan = {
      id: 'loan-กยศ',
      priority: 10,
      totalAmount: 50000,
      installmentAmount: 2000,
      paidAmount: 0,
      allowPartialDeduction: true,
    };
    const employeeLoan = {
      id: 'loan-พนักงาน',
      priority: 50,
      totalAmount: 20000,
      installmentAmount: 3000,
      paidAmount: 0,
      allowPartialDeduction: true,
    };

    it('เงินพอ หักครบทุกแผน', () => {
      const { results, totalDeducted, remainingNetPay } =
        resolveDeductionsForPeriod([employeeLoan, studentLoan], 20000);

      expect(totalDeducted).toBe(5000);
      expect(remainingNetPay).toBe(15000);
      expect(results.map((item) => item.plan.id)).toEqual([
        'loan-กยศ',
        'loan-พนักงาน',
      ]);
    });

    it('เงินไม่พอ แผนที่ priority ต่ำกว่าได้หักก่อน', () => {
      // เหลือ 2,500 : กยศ. หัก 2,000 ก่อน เหลือ 500 ให้เงินกู้พนักงาน
      const { results, totalDeducted } = resolveDeductionsForPeriod(
        [employeeLoan, studentLoan],
        2500,
      );

      const byId = new Map(results.map((item) => [item.plan.id, item.result]));

      expect(byId.get('loan-กยศ')?.amount).toBe(2000);
      expect(byId.get('loan-กยศ')?.isPartial).toBe(false);
      expect(byId.get('loan-พนักงาน')?.amount).toBe(500);
      expect(byId.get('loan-พนักงาน')?.isPartial).toBe(true);
      expect(totalDeducted).toBe(2500);
    });

    it('ไม่เหลือเงินเลย ทุกแผนถูกข้าม', () => {
      const { totalDeducted, results } = resolveDeductionsForPeriod(
        [employeeLoan, studentLoan],
        0,
      );

      expect(totalDeducted).toBe(0);
      expect(
        results.every((item) => item.result.skippedReason === 'NO_NET_PAY'),
      ).toBe(true);
    });

    it('ไม่มีแผนเลย ไม่หักอะไร', () => {
      const { totalDeducted, remainingNetPay } = resolveDeductionsForPeriod(
        [],
        20000,
      );

      expect(totalDeducted).toBe(0);
      expect(remainingNetPay).toBe(20000);
    });
  });
});
