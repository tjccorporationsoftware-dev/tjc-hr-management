import { PayrollHandoffImportService } from './payroll-handoff-import.service';

/**
 * อัตราค่าจ้างต้องปัดเศษครั้งเดียวตอนได้ยอดเงิน
 *
 * เดิมปัดอัตรารายวันแล้วหารต่อเป็นรายชั่วโมงแล้วปัดอีก พอคูณกลับขึ้นมายอดจะเกินจริง
 * หลักสตางค์ ซึ่งจะโผล่ตอนกระทบยอดกับบัญชี
 */
type Rates = {
  buildPayrollRates(
    baseSalary: number,
    settings?: { salaryDivisorDays?: number; workingHoursPerDay?: number } | null,
  ): {
    dailyRate: number;
    hourlyRate: number;
    exactHourlyRate: number;
    salaryDivisorDays: number;
    workingHoursPerDay: number;
  };
};

describe('PayrollHandoffImportService · อัตราค่าจ้าง', () => {
  const service = Object.create(
    PayrollHandoffImportService.prototype,
  ) as unknown as Rates;

  const round = (v: number) => Math.round(v * 100) / 100;

  it('อัตราที่แสดงยังปัดเศษเหมือนเดิม', () => {
    const r = service.buildPayrollRates(55000, {
      salaryDivisorDays: 30,
      workingHoursPerDay: 8,
    });

    expect(r.dailyRate).toBe(1833.33);
    expect(r.hourlyRate).toBe(229.17);
  });

  it('อัตราเต็มไม่ถูกปัด ใช้คิดยอดเงินจริง', () => {
    const r = service.buildPayrollRates(55000, {
      salaryDivisorDays: 30,
      workingHoursPerDay: 8,
    });

    expect(r.exactHourlyRate).toBeCloseTo(55000 / 30 / 8, 10);
  });

  it('OT 4.5 ชม. อัตรา 1.5 เท่า ต้องได้ 1,546.88 ไม่ใช่ 1,546.92', () => {
    const r = service.buildPayrollRates(55000, {
      salaryDivisorDays: 30,
      workingHoursPerDay: 8,
    });

    const fromExact = round(4.5 * r.exactHourlyRate * 1.5);
    const fromRounded = round(4.5 * round(r.hourlyRate * 1.5));

    expect(fromExact).toBe(1546.88);
    expect(fromRounded).toBe(1546.92); // วิธีเดิม เพี้ยนขึ้น 4 สตางค์
  });

  it('ลาไม่รับค่าจ้าง 1 วันของเงินเดือน 25,000 ต้องเท่ากับค่าจ้างหนึ่งวันพอดี', () => {
    const r = service.buildPayrollRates(25000, {
      salaryDivisorDays: 30,
      workingHoursPerDay: 8,
    });

    // 8 ชั่วโมง = 1 วันทำงาน
    expect(round(8 * r.exactHourlyRate)).toBe(833.33);
    expect(round(8 * r.exactHourlyRate)).toBe(r.dailyRate);

    // วิธีเดิมได้ 833.36 ไม่ตรงกับค่าจ้างรายวัน
    expect(round(8 * r.hourlyRate)).toBe(833.36);
  });
});
