import { thaiDate, thaiTime } from './thai-date';

/*
 * เทียบผลของตัวจัดรูปแบบใหม่กับ ICU ตัวเต็มของ Node ทุกวันในหนึ่งปี
 *
 * Node มี ICU ครบเหมือน iOS จึงใช้เป็น "คำตอบที่ถูก" ได้ — ถ้าตัวใหม่ให้ผล
 * ตรงกันทุกวัน แปลว่าการแทนที่ทั้งแอปไม่ได้เปลี่ยนสิ่งที่ผู้ใช้เห็นบนเครื่องที่
 * เคยแสดงถูกอยู่แล้ว ส่วนเครื่องที่ ICU ไม่ครบก็จะได้ผลเดียวกันนี้ด้วย
 *
 * ชุด option ที่ทดสอบคือชุดที่ใช้จริงในแอปทั้งหมด (ไล่จากจุดเรียกทุกจุด)
 *
 * ข้อยกเว้นที่ตั้งใจให้ต่าง: `weekday: 'short'` — ICU ไทยคืนชื่อเต็ม "จันทร์"
 * ซึ่งกินที่ในแถบแคบ ๆ ของแอป ตัวใหม่จึงคืนตัวย่อ "จ." ตามที่ใช้จริงบนจอ
 */
const COMBOS: { name: string; options: Parameters<typeof thaiDate>[1] }[] = [
  { name: 'ตัวเลขล้วน', options: { timeZone: 'UTC' } },
  {
    name: 'วัน เดือนย่อ ปี',
    options: { day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric' },
  },
  {
    name: 'วัน เดือนย่อ ปีสองหลัก',
    options: { day: 'numeric', month: 'short', timeZone: 'UTC', year: '2-digit' },
  },
  {
    name: 'วัน เดือนย่อ',
    options: { day: 'numeric', month: 'short', timeZone: 'UTC' },
  },
  { name: 'เดือนย่อ', options: { month: 'short', timeZone: 'UTC' } },
  {
    name: 'เดือนเต็ม ปี',
    options: { month: 'long', timeZone: 'UTC', year: 'numeric' },
  },
  {
    name: 'วันเต็ม วัน เดือนเต็ม',
    options: { day: 'numeric', month: 'long', timeZone: 'UTC', weekday: 'long' },
  },
];

/** ตัด option ที่เป็นของเราเองออกก่อนส่งให้ ICU */
function toIntlOptions(
  options: Parameters<typeof thaiDate>[1],
): Intl.DateTimeFormatOptions {
  const { time: _time, ...rest } = options ?? {};

  return rest as Intl.DateTimeFormatOptions;
}

describe('ผลลัพธ์ตรงกับ ICU ตัวเต็มทุกวันในหนึ่งปี', () => {
  const days: Date[] = [];
  for (let index = 0; index < 366; index += 1) {
    days.push(new Date(Date.UTC(2026, 0, 1 + index, 9, 5)));
  }

  it.each(COMBOS)('$name', ({ options }) => {
    const mismatched = days
      .map((day) => ({
        expected: day.toLocaleDateString('th-TH', toIntlOptions(options)),
        got: thaiDate(day, options),
        iso: day.toISOString().slice(0, 10),
      }))
      .filter((row) => row.expected !== row.got);

    expect(mismatched).toEqual([]);
  });

  it('วันที่ + เวลา ตรงกับ dateStyle medium ของ ICU', () => {
    const mismatched = days
      .map((day) => ({
        expected: day
          .toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
          /* ICU ใช้เวลาเครื่อง ส่วนของเราสั่ง UTC ตรง ๆ จึงเทียบเฉพาะรูปแบบ */
          .replace(/\d{2}:\d{2}$/, '09:05'),
        got: thaiDate(day, {
          day: 'numeric',
          month: 'short',
          time: 'short',
          timeZone: 'UTC',
          year: 'numeric',
        }),
        iso: day.toISOString().slice(0, 10),
      }))
      .filter((row) => row.expected !== row.got);

    expect(mismatched).toEqual([]);
  });

  it('เวลาเป็น 24 ชั่วโมงเหมือน ICU', () => {
    const mismatched = days
      .map((day) => ({
        expected: day.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        }),
        got: thaiTime(day, 'UTC'),
        iso: day.toISOString().slice(0, 10),
      }))
      .filter((row) => row.expected !== row.got);

    expect(mismatched).toEqual([]);
  });

  it('ชื่อวันย่อเป็นตัวย่อ ไม่ใช่ชื่อเต็มแบบ ICU — ต่างโดยตั้งใจ', () => {
    const day = new Date(Date.UTC(2026, 8, 7));

    expect(day.toLocaleDateString('th-TH', { weekday: 'short' })).toBe('จันทร์');
    expect(thaiDate(day, { timeZone: 'UTC', weekday: 'short' })).toBe('จ.');
  });
});
