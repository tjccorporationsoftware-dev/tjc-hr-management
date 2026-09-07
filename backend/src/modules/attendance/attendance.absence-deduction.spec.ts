import { AttendanceService } from './attendance.service';

/**
 * เทสต์สูตรหักเงินขาดงาน — ตัวเลขในสลิปมาจากตรงนี้
 *
 * ประเด็นที่กันไว้:
 * เดิมการขาดงานหารด้วย "จำนวนวันจริงในงวด" (28-31) ขณะที่การลาไม่รับค่าจ้าง
 * หารด้วย salaryDivisorDays ที่บริษัทตั้งไว้ (ปกติ 30) ทำให้การไม่ได้ทำงาน
 * 1 วันเหมือนกัน ถูกหักเงินไม่เท่ากันเพียงเพราะจัดอยู่คนละประเภท
 * และผลต่างยังกลับด้านระหว่างเดือนสั้นกับเดือนยาว
 *
 * ใช้ prototype ตรง ๆ เพราะเมธอดพวกนี้เป็น pure math ไม่แตะ prisma
 */
type PayrollSettingsLike = {
  payrollCutoffDay: number;
  payrollPeriodStartDay: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
};

type AbsenceResult = {
  amount: number;
  dailyRate: number;
  salaryDivisorDays: number;
  payrollPeriodDays: number;
  calculationMethod: string;
  missingCompensation: boolean;
};

type UnpaidLeaveResult = {
  dailyRate: number;
};

type DeductionMath = {
  calculateAbsenceDeductionFromBaseSalary(
    baseSalary: unknown,
    workDate: Date,
    settings: PayrollSettingsLike,
  ): AbsenceResult;
  calculateDailyDeductionCapFromBaseSalary(
    baseSalary: unknown,
    settings: PayrollSettingsLike,
  ): UnpaidLeaveResult;
};

const math = AttendanceService.prototype as unknown as DeductionMath;

const settings: PayrollSettingsLike = {
  payrollCutoffDay: 25,
  payrollPeriodStartDay: 26,
  salaryDivisorDays: 30,
  workingHoursPerDay: 8,
};

describe('หักเงินขาดงาน', () => {
  it('ใช้ตัวหารที่บริษัทตั้งไว้ ไม่ใช่จำนวนวันจริงในงวด', () => {
    // งวดที่คร่อมเดือนกุมภาพันธ์ — วันจริงในงวดไม่ใช่ 30
    const result = math.calculateAbsenceDeductionFromBaseSalary(
      30000,
      new Date('2026-02-10T00:00:00.000Z'),
      settings,
    );

    expect(result.salaryDivisorDays).toBe(30);
    expect(result.dailyRate).toBe(1000);
    expect(result.calculationMethod).toBe('BASE_SALARY_CONFIGURED_DAYS');
  });

  it('ขาดงาน 1 วัน กับ ลาไม่รับค่าจ้าง 1 วัน ต้องหักเท่ากัน', () => {
    const absence = math.calculateAbsenceDeductionFromBaseSalary(
      30000,
      new Date('2026-02-10T00:00:00.000Z'),
      settings,
    );
    const unpaidLeaveCap = math.calculateDailyDeductionCapFromBaseSalary(
      30000,
      settings,
    );

    expect(absence.dailyRate).toBe(unpaidLeaveCap.dailyRate);
  });

  it('เดือนสั้นกับเดือนยาวหักเท่ากัน ไม่แกว่งตามจำนวนวันในเดือน', () => {
    const february = math.calculateAbsenceDeductionFromBaseSalary(
      30000,
      new Date('2026-02-10T00:00:00.000Z'),
      settings,
    );
    const july = math.calculateAbsenceDeductionFromBaseSalary(
      30000,
      new Date('2026-07-10T00:00:00.000Z'),
      settings,
    );

    expect(february.dailyRate).toBe(july.dailyRate);
  });

  it('ไม่มีค่าจ้าง ได้ศูนย์และติดธงว่าข้อมูลไม่ครบ', () => {
    const result = math.calculateAbsenceDeductionFromBaseSalary(
      0,
      new Date('2026-02-10T00:00:00.000Z'),
      settings,
    );

    expect(result.amount).toBe(0);
    expect(result.missingCompensation).toBe(true);
  });
});
