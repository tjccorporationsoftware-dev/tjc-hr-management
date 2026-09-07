import {
  getThaiDateParts,
  getThaiMinutesOfDay,
  thaiToday,
  toThaiDateKey,
  toThaiDateOnly,
} from './thai-date.util';

/**
 * การตัดวันต้องยึดเวลาไทยเสมอ ไม่ว่าเซิร์ฟเวอร์จะตั้งเขตเวลาอะไร
 *
 * เคสที่เคยพังจริง: helper วันที่ของ leave / overtime / time-adjust ใช้
 * `value.getFullYear()` ซึ่งอ่านตามเวลาเซิร์ฟเวอร์ บนคอนเทนเนอร์ที่เป็น UTC
 * ช่วง 00:00-07:00 ตามเวลาไทยจะได้วันเมื่อวาน ทำให้
 *   - "ลาวันนี้" กลายเป็นลาย้อนหลัง
 *   - จำนวนวันที่ยื่นล่วงหน้าคลาดไป 1 วัน
 *   - workDate ของคำขอแก้เวลาเข้าผิดวัน
 *
 * เทสนี้ใช้เวลาที่คร่อมเส้นแบ่งวันของทั้งสองเขตเวลา จึงจับได้แม้เครื่องที่รันเทส
 * จะตั้งเป็นเวลาไทยอยู่แล้ว
 */

/** 2026-08-11 01:30 เวลาไทย = 2026-08-10 18:30 UTC (คนละวันกัน) */
const EARLY_MORNING_BANGKOK = new Date('2026-08-11T01:30:00+07:00');

/** 2026-08-10 23:30 UTC = 2026-08-11 06:30 เวลาไทย (คนละวันกัน) */
const LATE_NIGHT_UTC = new Date('2026-08-10T23:30:00Z');

describe('toThaiDateOnly', () => {
  it('ตีหนึ่งครึ่งตามเวลาไทย ยังเป็นวันที่ 11 ไม่ใช่วันที่ 10', () => {
    const result = toThaiDateOnly(EARLY_MORNING_BANGKOK);

    expect(result.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('สี่ทุ่มครึ่ง UTC เป็นเช้าวันถัดไปตามเวลาไทย', () => {
    const result = toThaiDateOnly(LATE_NIGHT_UTC);

    expect(result.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('คืนเป็นเที่ยงคืน UTC เสมอ ให้ตรงกับรูปแบบที่เก็บในฐานข้อมูล', () => {
    const result = toThaiDateOnly(new Date('2026-08-11T14:45:12+07:00'));

    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it('ข้ามปีได้ถูกต้อง — 31 ธ.ค. ห้าทุ่มไทย ยังเป็นปีเดิม', () => {
    const result = toThaiDateOnly(new Date('2026-12-31T23:00:00+07:00'));

    expect(result.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('เที่ยงคืนตรงตามเวลาไทย เป็นวันใหม่แล้ว', () => {
    const result = toThaiDateOnly(new Date('2027-01-01T00:00:00+07:00'));

    expect(result.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});

describe('getThaiDateParts', () => {
  it('แยกปี/เดือน/วันตามเวลาไทย เดือนเริ่มที่ 1', () => {
    expect(getThaiDateParts(EARLY_MORNING_BANGKOK)).toEqual({
      year: 2026,
      month: 8,
      day: 11,
    });
  });
});

describe('toThaiDateKey', () => {
  it('คืนคีย์ YYYY-MM-DD ตามเวลาไทย', () => {
    expect(toThaiDateKey(LATE_NIGHT_UTC)).toBe('2026-08-11');
  });
});

describe('getThaiMinutesOfDay', () => {
  it('ตีหนึ่งครึ่งตามเวลาไทย = 90 นาที ไม่ใช่ 1110 นาทีของ UTC', () => {
    expect(getThaiMinutesOfDay(EARLY_MORNING_BANGKOK)).toBe(90);
  });

  it('เที่ยงคืนตรง = 0', () => {
    expect(getThaiMinutesOfDay(new Date('2026-08-11T00:00:00+07:00'))).toBe(0);
  });
});

describe('thaiToday', () => {
  it('รับเวลาอ้างอิงเข้ามาได้ เพื่อให้เทสได้โดยไม่ขึ้นกับนาฬิกาจริง', () => {
    expect(thaiToday(EARLY_MORNING_BANGKOK).toISOString().slice(0, 10)).toBe(
      '2026-08-11',
    );
  });
});
