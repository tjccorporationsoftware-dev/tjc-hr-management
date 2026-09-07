import {
  PayrollSocialSecurityService,
  resolveAnnualSocialSecurityCeiling,
} from './payroll-social-security.service';

/**
 * ฐานประกันสังคมและเงินสมทบ
 *
 * ตัวเลขนี้ไปโผล่ทั้งในสลิป ในแบบยื่นประกันสังคม และเป็นค่าลดหย่อนภาษีของลูกจ้าง
 */
describe('PayrollSocialSecurityService', () => {
  const service = new PayrollSocialSecurityService();

  const settings = {
    socialSecurityEmployeeRate: 5,
    socialSecurityEmployerRate: 5,
    socialSecurityMinBase: 1650,
    socialSecurityMaxBase: 17500,
  };

  type Line = { amount: number; isSocialSecurityBase: boolean };

  const earning = (amount: number, isSocialSecurityBase = true): Line => ({
    amount,
    isSocialSecurityBase,
  });

  const run = (
    earningLines: Line[],
    deductionLines: Line[] = [],
    override: Partial<typeof settings> = {},
  ) =>
    service.collectEmployeeSocialSecurityLines({
      enabled: true,
      earningLines,
      deductionLines,
      settings: { ...settings, ...override },
    });

  describe('ฐานคำนวณ', () => {
    it('รวมเฉพาะรายได้ที่ติดธงว่าเป็นฐานประกันสังคม', () => {
      const result = run([earning(20000), earning(5000, false)]);

      expect(result.socialSecurityBase).toBe(20000);
    });

    it('เงินเดือนต่ำกว่าเพดานล่าง ใช้เพดานล่างเป็นฐาน', () => {
      const result = run([earning(1000)]);

      expect(result.cappedBase).toBe(1650);
    });

    it('เงินเดือนสูงกว่าเพดานบน ใช้เพดานบนเป็นฐาน', () => {
      const result = run([earning(80000)]);

      expect(result.cappedBase).toBe(17500);
      expect(result.employeeContribution).toBe(875);
      expect(result.employerContribution).toBe(875);
    });
  });

  describe('รายการหักที่ทำให้ค่าจ้างลดลงจริง', () => {
    it('ลาไม่รับค่าจ้าง ลดฐานประกันสังคมด้วย', () => {
      // เงินเดือน 30,000 ลาไม่รับค่าจ้าง 3,000 -> ฐานจริง 27,000
      const result = run([earning(30000)], [earning(3000)]);

      expect(result.socialSecurityBase).toBe(27000);
    });

    it('ค่าปรับมาสายไม่ลดฐาน เพราะค่าจ้างเกิดขึ้นครบแล้ว', () => {
      const result = run([earning(30000)], [earning(500, false)]);

      expect(result.socialSecurityBase).toBe(30000);
    });

    it('หักเกินเงินเดือน ฐานไม่ติดลบ', () => {
      const result = run([earning(10000)], [earning(15000)]);

      expect(result.socialSecurityBase).toBe(0);
      expect(result.employeeContribution).toBe(0);
    });

    it('ลดฐานแล้วยังเกินเพดานบน ยังคิดที่เพดานบน', () => {
      const result = run([earning(50000)], [earning(5000)]);

      expect(result.socialSecurityBase).toBe(45000);
      expect(result.cappedBase).toBe(17500);
      expect(result.employeeContribution).toBe(875);
    });

    it('ไม่ส่งรายการหักมา ผลเท่าเดิม', () => {
      expect(run([earning(30000)]).socialSecurityBase).toBe(30000);
    });
  });

  describe('resolveAnnualSocialSecurityCeiling', () => {
    it('เพดานฐาน 15,000 ได้ค่าลดหย่อนปีละ 9,000', () => {
      expect(
        resolveAnnualSocialSecurityCeiling({
          socialSecurityEmployeeRate: 5,
          socialSecurityMaxBase: 15000,
        }),
      ).toBe(9000);
    });

    it('เพดานฐาน 17,500 ได้ค่าลดหย่อนปีละ 10,500', () => {
      expect(
        resolveAnnualSocialSecurityCeiling({
          socialSecurityEmployeeRate: 5,
          socialSecurityMaxBase: 17500,
        }),
      ).toBe(10500);
    });

    it('ไม่ได้ตั้งค่า ใช้ค่าตั้งต้นของระบบ', () => {
      expect(resolveAnnualSocialSecurityCeiling()).toBe(10500);
      expect(
        resolveAnnualSocialSecurityCeiling({
          socialSecurityEmployeeRate: 0,
          socialSecurityMaxBase: 0,
        }),
      ).toBe(10500);
    });

    it('เพดานเดินตามเพดานฐานเสมอ ไม่ค้างที่ตัวเลขเก่า', () => {
      const base15000 = resolveAnnualSocialSecurityCeiling({
        socialSecurityEmployeeRate: 5,
        socialSecurityMaxBase: 15000,
      });
      const base20000 = resolveAnnualSocialSecurityCeiling({
        socialSecurityEmployeeRate: 5,
        socialSecurityMaxBase: 20000,
      });

      expect(base20000).toBeGreaterThan(base15000);
      expect(base20000).toBe(12000);
    });
  });
});
