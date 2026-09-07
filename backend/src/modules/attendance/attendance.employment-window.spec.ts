import { AttendanceService } from './attendance.service';

/**
 * ขอบเขตวันที่ควรมีสรุปเวลา — ด้านหน้า (วันเริ่มงาน) และด้านท้าย (วันพ้นสภาพ)
 *
 * สองบั๊กจริงที่เทสชุดนี้กันไม่ให้กลับมา
 *
 *   ด้านหน้า  คนเข้ากลางงวดถูกตีเป็นขาดงานย้อนไปถึงต้นงวด
 *   ด้านท้าย  คนลาออกกลางงวดถูกตีเป็นขาดงานทุกวันที่เหลือของงวด
 *            เคสจริง: ออกวันที่ 10/07 ของงวดที่จบ 25/07 โดนขาดงาน 13 วัน
 *            หักเงิน 10,833 จากเงินงวดสุดท้าย 12,500 โดยไม่มีอะไรฟ้อง
 *
 * เมธอดทั้งคู่เป็น pure logic เรียกผ่าน prototype ได้โดยไม่ต้องต่อฐานข้อมูล
 */
type EmploymentWindow = {
  isBeforeEmploymentStart(
    employee: { startDate?: Date | string | null },
    workDate: Date,
  ): boolean;
  isAfterEmploymentEnd(
    employee: { employmentEndDate?: Date | string | null },
    workDate: Date,
  ): boolean;
};

const service = Object.create(
  AttendanceService.prototype,
) as unknown as EmploymentWindow;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('ขอบเขตวันของสรุปเวลา · ด้านหน้า (วันเริ่มงาน)', () => {
  it('วันก่อนเริ่มงาน ต้องไม่คำนวณ', () => {
    expect(
      service.isBeforeEmploymentStart({ startDate: day('2026-07-05') }, day('2026-07-04')),
    ).toBe(true);
  });

  it('วันเริ่มงานวันแรก ต้องคำนวณ', () => {
    expect(
      service.isBeforeEmploymentStart({ startDate: day('2026-07-05') }, day('2026-07-05')),
    ).toBe(false);
  });

  it('ไม่มีวันเริ่มงาน ต้องคำนวณตามปกติ (พฤติกรรมเดิม)', () => {
    expect(service.isBeforeEmploymentStart({ startDate: null }, day('2026-07-01'))).toBe(false);
  });
});

describe('ขอบเขตวันของสรุปเวลา · ด้านท้าย (วันพ้นสภาพ)', () => {
  const leaver = { employmentEndDate: day('2026-07-10') };

  it('วันหลังพ้นสภาพ ต้องไม่คำนวณ — กันขาดงานผี', () => {
    expect(service.isAfterEmploymentEnd(leaver, day('2026-07-11'))).toBe(true);
    expect(service.isAfterEmploymentEnd(leaver, day('2026-07-25'))).toBe(true);
  });

  it('วันสุดท้ายของการเป็นพนักงาน ยังต้องคำนวณ', () => {
    expect(service.isAfterEmploymentEnd(leaver, day('2026-07-10'))).toBe(false);
  });

  it('คนที่ยังทำงานอยู่ (ไม่มีวันสิ้นสุด) ต้องคำนวณทุกวัน', () => {
    expect(service.isAfterEmploymentEnd({ employmentEndDate: null }, day('2026-07-25'))).toBe(false);
    expect(service.isAfterEmploymentEnd({}, day('2026-07-25'))).toBe(false);
  });

  it('ค่าวันที่เสีย ต้องไม่ล้มและถอยไปคำนวณตามปกติ', () => {
    expect(
      service.isAfterEmploymentEnd({ employmentEndDate: 'ไม่ใช่วันที่' }, day('2026-07-25')),
    ).toBe(false);
  });

  /* เคสจริง TST005: ออก 10/07 งวดจบ 25/07 — 13 วันหลังออกต้องถูกข้ามทั้งหมด */
  it('นับวันที่ถูกข้ามหลังลาออกกลางงวด ต้องครบ 15 วัน (11-25 ก.ค.)', () => {
    let skipped = 0;
    for (let d = 1; d <= 31; d++) {
      const iso = `2026-07-${String(d).padStart(2, '0')}`;
      if (d > 25) break;
      if (service.isAfterEmploymentEnd(leaver, day(iso))) skipped += 1;
    }
    expect(skipped).toBe(15);
  });
});
