import { parseLeaveDateOnly } from './leave-date.util';
import { parseOvertimeDateOnly } from '../../overtime/utils/overtime-date.util';
import { toTimeAdjustDateOnlyFromDate } from '../../time-adjust/utils/time-adjust-date.util';

/**
 * helper วันที่ของทั้งสามโมดูลต้องตัดวันตามเวลาไทย
 *
 * เดิมทั้งสามไฟล์ใช้ `value.getFullYear()` ซึ่งอ่านตามเวลาเซิร์ฟเวอร์
 * บนคอนเทนเนอร์ที่เป็น UTC ช่วง 00:00-07:00 ตามเวลาไทยจะได้วันเมื่อวาน
 * ทำให้ "ลาวันนี้" กลายเป็นลาย้อนหลัง และ workDate เข้าผิดวัน
 *
 * รันเทสนี้ด้วย TZ=UTC จะเห็นความต่างชัด (ดู npm run test:tz)
 */
describe('ตัดวันตามเวลาไทย ไม่ใช่เวลาเซิร์ฟเวอร์', () => {
  /** 2026-08-11 01:30 เวลาไทย = 2026-08-10 18:30 UTC */
  const earlyMorningBangkok = new Date('2026-08-11T01:30:00+07:00');

  it('ยื่นใบลาตอนตีหนึ่งครึ่ง ยังเป็นวันที่ 11', () => {
    expect(parseLeaveDateOnly(earlyMorningBangkok).toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
  });

  it('ยื่น OT ตอนตีหนึ่งครึ่ง ยังเป็นวันที่ 11', () => {
    expect(parseOvertimeDateOnly(earlyMorningBangkok).toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
  });

  it('workDate ของคำขอแก้เวลาตอนตีหนึ่งครึ่ง ยังเป็นวันที่ 11', () => {
    expect(toTimeAdjustDateOnlyFromDate(earlyMorningBangkok).toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
  });

  it('ทั้งสามโมดูลให้ผลตรงกัน — ไม่มีใครตัดวันคนละแบบ', () => {
    const leave = parseLeaveDateOnly(earlyMorningBangkok).getTime();
    const overtime = parseOvertimeDateOnly(earlyMorningBangkok).getTime();
    const timeAdjust = toTimeAdjustDateOnlyFromDate(earlyMorningBangkok).getTime();

    expect(leave).toBe(overtime);
    expect(overtime).toBe(timeAdjust);
  });

  it('สตริง YYYY-MM-DD ยังได้วันเดิมเป๊ะ ไม่โดนเลื่อน', () => {
    expect(parseLeaveDateOnly('2026-08-11').toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
    expect(parseOvertimeDateOnly('2026-08-11').toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
  });
});
