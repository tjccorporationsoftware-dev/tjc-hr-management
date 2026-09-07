import {
  buildPayrollPeriodRange,
  findPayrollPeriodContaining,
  normalizePayrollCutoffDay,
  toPayrollDateKey,
} from './payroll-period-range.util';

/**
 * กติกาช่วงงวดถูกใช้ทั้งฝั่งคำนวณเงินเดือนและฝั่งมือถือ ถ้าเพี้ยนเมื่อไร
 * ตัวเลขบนแอปจะไม่ตรงกับสลิป ซึ่งผู้ใช้จะอ่านว่า "ระบบคำนวณผิด"
 */
describe('buildPayrollPeriodRange', () => {
  const standard = { payrollCutoffDay: 25, payrollPeriodStartDay: 26 };

  it('เริ่มหลังวันตัด = งวดคาบเกี่ยวสองเดือน', () => {
    const range = buildPayrollPeriodRange(2026, 8, standard);

    expect(toPayrollDateKey(range.startDate)).toBe('2026-07-26');
    expect(toPayrollDateKey(range.endDate)).toBe('2026-08-25');
  });

  it('งวดมกราคมต้องถอยข้ามปีไปเดือนธันวาคมปีก่อน', () => {
    const range = buildPayrollPeriodRange(2026, 1, standard);

    expect(toPayrollDateKey(range.startDate)).toBe('2025-12-26');
    expect(toPayrollDateKey(range.endDate)).toBe('2026-01-25');
  });

  it('ตั้งเริ่ม 1 ตัดสิ้นเดือน = ตรงกับเดือนปฏิทินพอดี', () => {
    const range = buildPayrollPeriodRange(2026, 3, {
      payrollCutoffDay: 31,
      payrollPeriodStartDay: 1,
    });

    expect(toPayrollDateKey(range.startDate)).toBe('2026-03-01');
    expect(toPayrollDateKey(range.endDate)).toBe('2026-03-31');
  });

  it('วันที่เกินจำนวนวันของเดือนต้องหนีบไว้ ไม่ทดไปเดือนถัดไป', () => {
    /* กุมภาพันธ์ 2026 มี 28 วัน ตั้งตัดวันที่ 31 ต้องได้ 28 ไม่ใช่ 3 มี.ค. */
    const range = buildPayrollPeriodRange(2026, 2, {
      payrollCutoffDay: 31,
      payrollPeriodStartDay: 1,
    });

    expect(toPayrollDateKey(range.endDate)).toBe('2026-02-28');
  });

  it('ค่าที่ตั้งไว้พังต้องตกกลับไปใช้ค่าเริ่มต้น 26/25', () => {
    const range = buildPayrollPeriodRange(2026, 8, {
      payrollCutoffDay: null,
      payrollPeriodStartDay: undefined,
    });

    expect(toPayrollDateKey(range.startDate)).toBe('2026-07-26');
    expect(toPayrollDateKey(range.endDate)).toBe('2026-08-25');
  });
});

describe('normalizePayrollCutoffDay', () => {
  it('หนีบให้อยู่ในช่วง 1–31 เสมอ', () => {
    expect(normalizePayrollCutoffDay(0, 25)).toBe(1);
    expect(normalizePayrollCutoffDay(99, 25)).toBe(31);
    expect(normalizePayrollCutoffDay(15.9, 25)).toBe(15);
  });

  it('ค่าที่ไม่ใช่ตัวเลขใช้ค่าเริ่มต้น', () => {
    expect(normalizePayrollCutoffDay(null, 25)).toBe(25);
    expect(normalizePayrollCutoffDay(Number.NaN, 26)).toBe(26);
  });
});

describe('findPayrollPeriodContaining', () => {
  const standard = { payrollCutoffDay: 25, payrollPeriodStartDay: 26 };

  it('วันก่อนวันตัดอยู่ในงวดของเดือนตัวเอง', () => {
    const range = findPayrollPeriodContaining('2026-08-19', standard);

    expect(toPayrollDateKey(range.startDate)).toBe('2026-07-26');
    expect(toPayrollDateKey(range.endDate)).toBe('2026-08-25');
  });

  it('วันตัดพอดียังอยู่ในงวดเดิม', () => {
    const range = findPayrollPeriodContaining('2026-08-25', standard);

    expect(toPayrollDateKey(range.endDate)).toBe('2026-08-25');
  });

  it('เลยวันตัดแล้วต้องข้ามไปงวดถัดไป', () => {
    /* กับดักหลัก: 26 ส.ค. อยู่ในงวดกันยายน ไม่ใช่งวดสิงหาคม */
    const range = findPayrollPeriodContaining('2026-08-26', standard);

    expect(toPayrollDateKey(range.startDate)).toBe('2026-08-26');
    expect(toPayrollDateKey(range.endDate)).toBe('2026-09-25');
  });

  it('ปลายเดือนธันวาคมต้องข้ามไปงวดมกราคมปีถัดไป', () => {
    const range = findPayrollPeriodContaining('2026-12-28', standard);

    expect(toPayrollDateKey(range.startDate)).toBe('2026-12-26');
    expect(toPayrollDateKey(range.endDate)).toBe('2027-01-25');
  });

  it('บริษัทที่ใช้เดือนปฏิทินต้องได้เดือนของวันนั้นตรง ๆ', () => {
    const range = findPayrollPeriodContaining('2026-08-26', {
      payrollCutoffDay: 31,
      payrollPeriodStartDay: 1,
    });

    expect(toPayrollDateKey(range.startDate)).toBe('2026-08-01');
    expect(toPayrollDateKey(range.endDate)).toBe('2026-08-31');
  });
});
