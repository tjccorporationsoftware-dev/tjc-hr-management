import { thaiDate, thaiTime, thaiYear } from './thai-date';

/*
 * วันอ้างอิง: จันทร์ 7 กันยายน 2026 (พ.ศ. 2569) เวลา 10:30 UTC
 *
 * เลือกวันจันทร์เพราะจะได้ตรวจชื่อวันย่อกับชื่อวันเต็มไปพร้อมกัน และเลือกเดือน
 * กันยายนเพราะชื่อย่อ "ก.ย." ต่างจากชื่อเต็ม "กันยายน" ชัดเจน
 */
const REFERENCE = new Date(Date.UTC(2026, 8, 7, 10, 30));

describe('thaiDate', () => {
  it('ไม่ส่ง options ได้ตัวเลขล้วน วัน/เดือน/ปี พ.ศ.', () => {
    expect(thaiDate(REFERENCE, { timeZone: 'UTC' })).toBe('7/9/2569');
  });

  it('วัน เดือนย่อ ปีเต็ม', () => {
    expect(
      thaiDate(REFERENCE, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      }),
    ).toBe('7 ก.ย. 2569');
  });

  it('ปีสองหลักเป็น พ.ศ. ไม่ใช่ ค.ศ.', () => {
    expect(
      thaiDate(REFERENCE, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: '2-digit',
      }),
    ).toBe('7 ก.ย. 69');
  });

  it('ชื่อวันย่อนำหน้า', () => {
    expect(
      thaiDate(REFERENCE, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        weekday: 'short',
        year: 'numeric',
      }),
    ).toBe('จ. 7 ก.ย. 2569');
  });

  it('ชื่อวันเต็มเชื่อมด้วย "ที่" ตามรูปแบบไทย', () => {
    expect(
      thaiDate(REFERENCE, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
        weekday: 'long',
      }),
    ).toBe('วันจันทร์ที่ 7 กันยายน');
  });

  it('เดือนเต็มกับปี', () => {
    expect(
      thaiDate(REFERENCE, { month: 'long', timeZone: 'UTC', year: 'numeric' }),
    ).toBe('กันยายน 2569');
  });

  it('วันกับเดือนย่อ ไม่มีปี', () => {
    expect(
      thaiDate(REFERENCE, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    ).toBe('7 ก.ย.');
  });

  it('เดือนย่อเดี่ยว ๆ', () => {
    expect(thaiDate(REFERENCE, { month: 'short', timeZone: 'UTC' })).toBe('ก.ย.');
  });

  it('ต่อท้ายด้วยเวลาได้', () => {
    expect(
      thaiDate(REFERENCE, {
        day: 'numeric',
        month: 'short',
        time: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      }),
    ).toBe('7 ก.ย. 2569 10:30');
  });

  it('เลขวันกับเดือนแบบสองหลัก', () => {
    expect(
      thaiDate(new Date(Date.UTC(2026, 0, 5)), {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
        year: 'numeric',
      }),
    ).toBe('05 01 2569');
  });

  it('รับสตริงกับ timestamp ได้ ไม่ใช่แค่ Date', () => {
    const options = {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    } as const;

    expect(thaiDate('2026-09-07T10:30:00.000Z', options)).toBe('7 ก.ย. 2569');
    expect(thaiDate(REFERENCE.getTime(), options)).toBe('7 ก.ย. 2569');
  });

  it('ค่าที่ใช้ไม่ได้คืนสตริงว่าง ไม่ใช่ Invalid Date', () => {
    expect(thaiDate(null)).toBe('');
    expect(thaiDate(undefined)).toBe('');
    expect(thaiDate('ไม่ใช่วันที่')).toBe('');
  });

  it('ข้ามปีแล้วปี พ.ศ. ต้องขยับตาม', () => {
    expect(
      thaiDate(new Date(Date.UTC(2027, 0, 1)), {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      }),
    ).toBe('1 ม.ค. 2570');
  });

  it('ทุกเดือนมีชื่อครบสิบสองเดือน', () => {
    const names = Array.from({ length: 12 }, (_unused, index) =>
      thaiDate(new Date(Date.UTC(2026, index, 15)), {
        month: 'short',
        timeZone: 'UTC',
      }),
    );

    expect(names).toEqual([
      'ม.ค.',
      'ก.พ.',
      'มี.ค.',
      'เม.ย.',
      'พ.ค.',
      'มิ.ย.',
      'ก.ค.',
      'ส.ค.',
      'ก.ย.',
      'ต.ค.',
      'พ.ย.',
      'ธ.ค.',
    ]);
  });

  it('ทุกวันในสัปดาห์มีชื่อครบเจ็ดวัน', () => {
    /* 6 ก.ย. 2026 เป็นวันอาทิตย์ ไล่ไปอีกหกวันจึงครบสัปดาห์ */
    const names = Array.from({ length: 7 }, (_unused, index) =>
      thaiDate(new Date(Date.UTC(2026, 8, 6 + index)), {
        timeZone: 'UTC',
        weekday: 'short',
      }),
    );

    expect(names).toEqual(['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']);
  });
});

describe('thaiTime', () => {
  it('เวลาแบบ 24 ชั่วโมงเสมอ ไม่มี AM/PM', () => {
    expect(thaiTime(REFERENCE, 'UTC')).toBe('10:30');
    expect(thaiTime(new Date(Date.UTC(2026, 8, 7, 0, 5)), 'UTC')).toBe('00:05');
    expect(thaiTime(new Date(Date.UTC(2026, 8, 7, 23, 59)), 'UTC')).toBe('23:59');
  });

  it('ค่าที่ใช้ไม่ได้คืนสตริงว่าง', () => {
    expect(thaiTime(null)).toBe('');
  });
});

describe('thaiYear', () => {
  it('คืนปี พ.ศ. เป็นตัวเลข', () => {
    expect(thaiYear(REFERENCE, 'UTC')).toBe(2569);
  });

  it('ค่าที่ใช้ไม่ได้คืน null', () => {
    expect(thaiYear('x')).toBeNull();
  });
});
