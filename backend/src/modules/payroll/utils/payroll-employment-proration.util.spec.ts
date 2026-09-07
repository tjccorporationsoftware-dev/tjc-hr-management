import {
  countInclusiveDays,
  resolveEmploymentProration,
} from './payroll-employment-proration.util';

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** งวดมาตรฐานของบริษัท: 26 ถึง 25 */
const period = {
  periodStartDate: d('2026-06-26'),
  periodEndDate: d('2026-07-25'),
  divisorDays: 30,
};

describe('resolveEmploymentProration', () => {
  it('นับวันแบบนับหัวนับท้าย', () => {
    expect(countInclusiveDays(d('2026-07-16'), d('2026-07-25'))).toBe(10);
    expect(countInclusiveDays(d('2026-07-25'), d('2026-07-25'))).toBe(1);
    expect(countInclusiveDays(d('2026-07-25'), d('2026-07-24'))).toBe(0);
  });

  it('ทำงานเต็มงวด ได้เต็มจำนวน', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2020-01-01'), employmentEndDate: null },
      ...period,
    });

    expect(result.factor).toBe(1);
    expect(result.isPartial).toBe(false);
    expect(result.isFinalPeriod).toBe(false);
  });

  it('เข้างานกลางงวด คิดตามวันที่เป็นพนักงาน', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2026-07-16'), employmentEndDate: null },
      ...period,
    });

    // 16-25 ก.ค. = 10 วัน จาก 30
    expect(result.employedDays).toBe(10);
    expect(result.factor).toBeCloseTo(10 / 30, 10);
    expect(result.isPartial).toBe(true);
    // เงินเดือน 23,000 -> 7,666.67
    expect(Number((23000 * result.factor).toFixed(2))).toBe(7666.67);
  });

  it('ออกกลางงวด คิดถึงวันพ้นสภาพ และถือเป็นงวดสุดท้าย', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2020-01-01'), employmentEndDate: d('2026-07-10') },
      ...period,
    });

    // 26 มิ.ย. - 10 ก.ค. = 15 วัน
    expect(result.employedDays).toBe(15);
    expect(result.factor).toBe(0.5);
    expect(result.isFinalPeriod).toBe(true);
  });

  it('เข้าและออกภายในงวดเดียวกัน', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2026-07-01'), employmentEndDate: d('2026-07-05') },
      ...period,
    });

    expect(result.employedDays).toBe(5);
    expect(result.isFinalPeriod).toBe(true);
  });

  it('งวด 31 วันไม่จ่ายเกินเงินเดือนเต็ม', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2026-07-27'), employmentEndDate: null },
      periodStartDate: d('2026-07-26'),
      periodEndDate: d('2026-08-25'),
      divisorDays: 30,
    });

    // เป็นพนักงาน 30 วันจาก 31 วันของงวด -> ยังถือว่าไม่เต็มงวด แต่ตัวคูณต้องไม่เกิน 1
    expect(result.periodDays).toBe(31);
    expect(result.employedDays).toBe(30);
    expect(result.factor).toBe(1);
  });

  it('พ้นสภาพก่อนงวดเริ่ม ได้ศูนย์', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2020-01-01'), employmentEndDate: d('2026-06-01') },
      ...period,
    });

    expect(result.employedDays).toBe(0);
    expect(result.factor).toBe(0);
    expect(result.isFinalPeriod).toBe(true);
  });

  it('เข้างานหลังงวดจบ ได้ศูนย์', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2026-09-07'), employmentEndDate: null },
      ...period,
    });

    expect(result.employedDays).toBe(0);
    expect(result.factor).toBe(0);
  });

  it('ตัวหารเป็น 0 ให้ถอยไปใช้ 30 ไม่ใช่หารด้วยศูนย์', () => {
    const result = resolveEmploymentProration({
      employee: { startDate: d('2026-07-16'), employmentEndDate: null },
      ...period,
      divisorDays: 0,
    });

    expect(result.divisorDays).toBe(30);
    expect(Number.isFinite(result.factor)).toBe(true);
  });
});
