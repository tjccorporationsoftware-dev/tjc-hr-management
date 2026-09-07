import { PayrollHandoffImportService } from './payroll-handoff-import.service';

/**
 * อัตราค่าจ้างตามฐาน — รายเดือน / รายวัน / รายชั่วโมง
 *
 * ที่มา: พนักงานรายวันค่าแรง 500 บาท/วัน ทำ OT 17.5 ชั่วโมง ระบบจ่ายให้ 36.40 บาท
 * เพราะเอา 500 ไปหารด้วย 30 วันเหมือนเป็นเงินเดือนรายเดือน แล้วหารด้วย 8 อีก
 * ได้อัตรา 2.08 บาท/ชม. ที่ถูกคือ 500/8 = 62.50 บาท/ชม. -> 1,093.75 บาท
 *
 * เทสนี้เรียก buildPayrollRates ตรง ๆ ผ่าน prototype เพราะเป็น private
 * แต่เป็นจุดเดียวที่ทั้งระบบใช้หาอัตราต่อชั่วโมง จึงคุ้มที่จะตรึงไว้
 */
const service = Object.create(
  PayrollHandoffImportService.prototype,
) as PayrollHandoffImportService;

const buildRates = (
  baseSalary: number,
  basis?: 'MONTHLY' | 'DAILY' | 'HOURLY',
) =>
  (service as any).buildPayrollRates(
    baseSalary,
    { salaryDivisorDays: 30, workingHoursPerDay: 8 },
    basis,
  );

describe('อัตราค่าจ้างตามฐาน', () => {
  describe('รายเดือน (พฤติกรรมเดิม ห้ามเปลี่ยน)', () => {
    it('เงินเดือน 15,000 -> วันละ 500 ชั่วโมงละ 62.50', () => {
      const r = buildRates(15000, 'MONTHLY');

      expect(r.dailyRate).toBe(500);
      expect(r.hourlyRate).toBe(62.5);
    });

    it('ไม่ระบุฐานมา ต้องถือเป็นรายเดือนเหมือนเดิม', () => {
      expect(buildRates(15000).hourlyRate).toBe(buildRates(15000, 'MONTHLY').hourlyRate);
    });

    it('เก็บอัตราไม่ปัดเศษไว้คำนวณ เพื่อไม่ให้ยอดเพี้ยนหลักสตางค์', () => {
      // 55,000 OT 4.5 ชม. อัตรา 1.5 เท่า ต้องได้ 1,546.88 ไม่ใช่ 1,546.90+
      const r = buildRates(55000, 'MONTHLY');
      const amount = Math.round(4.5 * r.exactHourlyRate * 1.5 * 100) / 100;

      expect(amount).toBe(1546.88);
    });
  });

  describe('รายวัน', () => {
    /* เคสจริง: 670030 กรุงรัตนะ บุราณสาร ค่าแรงวันละ 500 */
    it('ค่าแรงวันละ 500 -> ชั่วโมงละ 62.50 ไม่ใช่ 2.08', () => {
      const r = buildRates(500, 'DAILY');

      expect(r.dailyRate).toBe(500);
      expect(r.hourlyRate).toBe(62.5);
    });

    it('OT 17.5 ชม. อัตรา 1 เท่า ต้องได้ 1,093.75', () => {
      const r = buildRates(500, 'DAILY');
      const amount = Math.round(17.5 * r.exactHourlyRate * 1 * 100) / 100;

      expect(amount).toBe(1093.75);
    });

    it('ต้องไม่หารด้วยจำนวนวันซ้ำ', () => {
      const wrong = buildRates(500, 'MONTHLY');
      const right = buildRates(500, 'DAILY');

      expect(wrong.hourlyRate).toBeCloseTo(2.08, 2);
      expect(right.hourlyRate).toBe(62.5);
      expect(right.hourlyRate / wrong.hourlyRate).toBeCloseTo(30, 0);
    });
  });

  describe('รายชั่วโมง (พาร์ทไทม์)', () => {
    it('ค่าแรงชั่วโมงละ 60 -> วันละ 480 ชั่วโมงละ 60', () => {
      const r = buildRates(60, 'HOURLY');

      expect(r.hourlyRate).toBe(60);
      expect(r.dailyRate).toBe(480);
    });
  });
});
