import { thaiToday, toThaiDateKey } from './thai-date.util';

/**
 * "วันนี้" ต้องเป็นวันตามปฏิทินไทยเสมอ
 * -----------------------------------------------------------------------------
 * โค้ดหลายที่เคยคำนวณวันนี้ด้วย `new Date().toISOString().slice(0, 10)`
 * ซึ่งให้วันตาม **UTC เสมอ** ไม่ว่าจะตั้ง process.env.TZ เป็นอะไร
 *
 * ช่วง 00:00-06:59 ตามเวลาไทยจึงได้ "เมื่อวาน" กระทบ:
 *   - แดชบอร์ดหัวหน้าและปฏิทินทีม แสดงข้อมูลของเมื่อวานว่าเป็นวันนี้
 *   - จำนวนคนลาวันนี้ในหน้ารายการใบลา
 *   - เลขที่เอกสารคำขอทำงานนอกสถานที่ ได้เลขของเมื่อวาน
 *
 * ไฟล์นี้ตรึงพฤติกรรมไว้ที่ขอบเขตที่เคยพัง ไม่ใช่แค่เคสกลางวันที่ผ่านอยู่แล้ว
 */
describe('วันนี้ตามเวลาไทย', () => {
  /** ช่วงเวลาที่เคยคำนวณผิด: เที่ยงคืนถึงก่อน 7 โมงเช้าไทย = ยังเป็นเมื่อวานใน UTC */
  const overnightCases = [
    { thai: '2026-08-15T00:00:00+07:00', expected: '2026-08-15' },
    { thai: '2026-08-15T00:30:00+07:00', expected: '2026-08-15' },
    { thai: '2026-08-15T02:30:00+07:00', expected: '2026-08-15' },
    { thai: '2026-08-15T06:59:59+07:00', expected: '2026-08-15' },
  ];

  it.each(overnightCases)(
    'เวลาไทย $thai ต้องได้วันที่ $expected',
    ({ thai, expected }) => {
      const at = new Date(thai);

      expect(toThaiDateKey(at)).toBe(expected);

      // ยืนยันว่าวิธีเดิมให้ผลผิดจริง ไม่ใช่เทสที่ผ่านอยู่แล้วตั้งแต่ต้น
      expect(at.toISOString().slice(0, 10)).not.toBe(expected);
    },
  );

  it('7 โมงเช้าเป็นต้นไป ทั้งสองวิธีตรงกัน (จุดที่เคยมองไม่เห็นบั๊ก)', () => {
    const at = new Date('2026-08-15T07:00:00+07:00');

    expect(toThaiDateKey(at)).toBe('2026-08-15');
    expect(at.toISOString().slice(0, 10)).toBe('2026-08-15');
  });

  it('ข้ามสิ้นเดือนตอนตีหนึ่งต้องได้วันที่ 1 ของเดือนใหม่', () => {
    const at = new Date('2026-09-01T01:00:00+07:00');

    expect(toThaiDateKey(at)).toBe('2026-09-01');
    expect(at.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('ข้ามสิ้นปีตอนตีหนึ่งต้องได้ปีใหม่', () => {
    const at = new Date('2027-01-01T01:00:00+07:00');

    expect(toThaiDateKey(at)).toBe('2027-01-01');
    expect(at.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('thaiToday คืนวันที่ล้วนเป็นเที่ยงคืน UTC ตรงกับคอลัมน์ @db.Date', () => {
    const at = new Date('2026-08-15T02:30:00+07:00');
    const today = thaiToday(at);

    expect(today.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
  });
});
