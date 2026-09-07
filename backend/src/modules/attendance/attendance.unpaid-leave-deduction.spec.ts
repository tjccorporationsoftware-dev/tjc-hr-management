import { AttendanceService } from './attendance.service';

/**
 * เทสต์สูตรหักเงินลาไม่รับค่าจ้าง — ตัวเลขในสลิปมาจากตรงนี้
 *
 * สูตร: เงินเดือน / salaryDivisorDays / workingHoursPerDay * ชั่วโมงลา * ค่าปรับ
 *
 * ใช้ prototype ตรง ๆ เพราะเมธอดพวกนี้เป็น pure math ไม่แตะ prisma
 * จึงไม่ต้องยก DI ของ AttendanceService ทั้งก้อนมาทดสอบ
 */
type UnpaidLeaveDeductionResult = {
  amount: number;
  amountBeforeMultiplier: number;
  dailyRate: number;
  hourlyRate: number;
  unpaidLeaveMinutes: number;
  unpaidDeductionMultiplier: number;
  missingCompensation: boolean;
};

type PayrollSettingsLike = {
  payrollCutoffDay: number;
  payrollPeriodStartDay: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
};

/** เปิดเฉพาะเมธอดคำนวณที่ต้องทดสอบ โดยไม่ต้องเปลี่ยน private เป็น public ในโค้ดจริง */
type DeductionMath = {
  calculateUnpaidLeaveDeductionFromBaseSalary(
    baseSalary: unknown,
    unpaidLeaveMinutes: number,
    settings: PayrollSettingsLike,
    unpaidDeductionMultiplier?: number,
  ): UnpaidLeaveDeductionResult;
  normalizeUnpaidDeductionMultiplier(value: unknown): number;
  resolveWorkingMinutesPerDay(settings?: {
    workingHoursPerDay?: number | null;
  }): number;
};

describe('AttendanceService · ยอดหักลาไม่รับค่าจ้าง', () => {
  const service = Object.create(
    AttendanceService.prototype,
  ) as unknown as DeductionMath;

  const settings = {
    payrollCutoffDay: 25,
    payrollPeriodStartDay: 26,
    salaryDivisorDays: 30,
    workingHoursPerDay: 8,
  };

  // เงินเดือน 30,000 -> วันละ 1,000 -> ชั่วโมงละ 125
  const salary = 30_000;

  const calc = (minutes: number, multiplier?: number) =>
    service.calculateUnpaidLeaveDeductionFromBaseSalary(
      salary,
      minutes,
      settings,
      multiplier,
    );

  describe('อัตราตั้งต้น', () => {
    it('คำนวณอัตรารายวันและรายชั่วโมงถูกต้อง', () => {
      const result = calc(480);

      expect(result.dailyRate).toBe(1000);
      expect(result.hourlyRate).toBe(125);
    });
  });

  describe('สัดส่วนตามรูปแบบการลา (ค่าปรับ 1 เท่า)', () => {
    it('ลาเต็มวัน หักเต็มค่าจ้างรายวัน', () => {
      expect(calc(480, 1).amount).toBe(1000);
    });

    it('ลาครึ่งวัน หักครึ่งเดียว', () => {
      expect(calc(240, 1).amount).toBe(500);
    });

    it('ลารายชั่วโมง 2 ชม. หัก 1 ใน 4', () => {
      expect(calc(120, 1).amount).toBe(250);
    });

    it('ลารายชั่วโมง 30 นาที หักตามสัดส่วนจริง', () => {
      expect(calc(30, 1).amount).toBe(62.5);
    });
  });

  describe('ตัวคูณค่าปรับ', () => {
    it('ค่าปรับ 0 ไม่หักเลย แต่ยังบันทึกเวลาลาไว้', () => {
      const result = calc(480, 0);

      expect(result.amount).toBe(0);
      expect(result.amountBeforeMultiplier).toBe(1000);
      expect(result.unpaidLeaveMinutes).toBe(480);
    });

    it('ค่าปรับ 2 หักสองเท่า', () => {
      expect(calc(480, 2).amount).toBe(2000);
    });

    it('ค่าปรับคูณกับสัดส่วนที่ลาจริง ไม่ใช่คูณเป็นวันเต็ม', () => {
      // ลาครึ่งวัน ค่าปรับ 2 -> เท่ากับค่าจ้างหนึ่งวัน
      expect(calc(240, 2).amount).toBe(1000);
      // ลา 2 ชม. ค่าปรับ 2 -> ครึ่งวัน
      expect(calc(120, 2).amount).toBe(500);
    });

    it('เก็บยอดก่อนคูณไว้ตรวจสอบย้อนหลังได้', () => {
      const result = calc(240, 3);

      expect(result.amountBeforeMultiplier).toBe(500);
      expect(result.unpaidDeductionMultiplier).toBe(3);
      expect(result.amount).toBe(1500);
    });
  });

  describe('fallback ต้องไม่ทำให้ยอดหักหายเงียบ ๆ', () => {
    it('ไม่ส่งค่าปรับมา ใช้ 1 เท่า (พฤติกรรมเดิมของระบบ)', () => {
      expect(calc(480).amount).toBe(1000);
      expect(calc(480).unpaidDeductionMultiplier).toBe(1);
    });

    it('ค่าปรับติดลบหรือเพี้ยน กลับไปใช้ 1 เท่า', () => {
      expect(service.normalizeUnpaidDeductionMultiplier(-2)).toBe(1);
      expect(service.normalizeUnpaidDeductionMultiplier(Number.NaN)).toBe(1);
      expect(service.normalizeUnpaidDeductionMultiplier(null)).toBe(1);
      expect(service.normalizeUnpaidDeductionMultiplier(undefined)).toBe(1);
    });

    it('ค่าปรับ 0 ที่ตั้งมาโดยตั้งใจ ต้องไม่ถูกมองว่าเพี้ยน', () => {
      expect(service.normalizeUnpaidDeductionMultiplier(0)).toBe(0);
    });
  });

  describe('กรณีไม่มีข้อมูลเงินเดือน', () => {
    it('ยอดหักเป็น 0 และติดธงว่าขาดข้อมูล ไม่ใช่เดาตัวเลข', () => {
      const result = service.calculateUnpaidLeaveDeductionFromBaseSalary(
        0,
        480,
        settings,
        1,
      );

      expect(result.amount).toBe(0);
      expect(result.missingCompensation).toBe(true);
      expect(result.unpaidLeaveMinutes).toBe(480);
    });

    it('ไม่มีเวลาลา ยอดหักเป็น 0 และไม่ติดธงขาดข้อมูล', () => {
      const result = calc(0, 1);

      expect(result.amount).toBe(0);
      expect(result.missingCompensation).toBe(false);
    });
  });

  describe('ชั่วโมงทำงานต่อวันที่ตั้งค่าได้', () => {
    it('บริษัทที่ตั้ง 9 ชม./วัน ลาเต็มวันยังหักเต็มค่าจ้างรายวัน', () => {
      const nineHourSettings = { ...settings, workingHoursPerDay: 9 };
      const result = service.calculateUnpaidLeaveDeductionFromBaseSalary(
        salary,
        9 * 60,
        nineHourSettings,
        1,
      );

      expect(result.hourlyRate).toBeCloseTo(111.11, 2);
      expect(result.amount).toBeCloseTo(1000, 0);
    });

    it('แปลงชั่วโมงทำงานเป็นนาทีต่อวันได้ถูกต้อง', () => {
      expect(
        service.resolveWorkingMinutesPerDay({ workingHoursPerDay: 8 }),
      ).toBe(480);
      expect(
        service.resolveWorkingMinutesPerDay({ workingHoursPerDay: 9 }),
      ).toBe(540);
    });

    it('ค่าชั่วโมงทำงานหายหรือเพี้ยน กลับไปใช้ 8 ชม.', () => {
      expect(service.resolveWorkingMinutesPerDay(undefined)).toBe(480);
      expect(
        service.resolveWorkingMinutesPerDay({ workingHoursPerDay: 0 }),
      ).toBe(480);
      expect(
        service.resolveWorkingMinutesPerDay({ workingHoursPerDay: -3 }),
      ).toBe(480);
    });
  });
});
