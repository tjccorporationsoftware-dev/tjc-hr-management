/**
 * วันที่ตามเวลาไทย — แหล่งเดียวของการตัดวัน
 * -----------------------------------------------------------------------------
 * ระบบนี้ทำงานบนเวลาไทยทั้งหมด แต่เซิร์ฟเวอร์ที่ deploy จริงมักตั้งเป็น UTC
 * (คอนเทนเนอร์ Linux ส่วนใหญ่ไม่มี TZ) ทำให้ `date.getFullYear()` และเพื่อน ๆ
 * อ่านวันตามเวลาเซิร์ฟเวอร์ ไม่ใช่เวลาไทย
 *
 * ผลคือช่วง 00:00-07:00 ตามเวลาไทย ทุกอย่างที่ตัดวันจะคลาดไป 1 วัน:
 *   - "ลาวันนี้" กลายเป็นลาเมื่อวาน แล้วถูกตีเป็นคำขอย้อนหลัง
 *   - เงื่อนไขยื่นลาล่วงหน้านับผิดไป 1 วัน
 *   - workDate ของคำขอแก้เวลาเข้าผิดวัน
 *
 * ห้ามพึ่ง `process.env.TZ` อย่างเดียว เพราะไม่ครอบ worker / cron / เทส
 * ที่รันคนละกระบวนการ โค้ดต้องระบุเขตเวลาเองอย่างชัดเจน
 */

/** เขตเวลาที่ระบบใช้ตัดวัน */
export const APP_TIMEZONE = 'Asia/Bangkok';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** ปี/เดือน/วัน ตามเวลาไทย (เดือนเริ่มที่ 1) */
export function getThaiDateParts(value: Date) {
  const parts = dateFormatter.formatToParts(value);
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
  };
}

/** คีย์วันที่แบบ YYYY-MM-DD ตามเวลาไทย */
export function toThaiDateKey(value: Date) {
  return dateFormatter.format(value);
}

/**
 * ตัดเวลาออก เหลือเฉพาะวันตามปฏิทินไทย แล้วคืนเป็นเที่ยงคืน UTC
 *
 * รูปแบบ "วันที่ล้วนเก็บเป็นเที่ยงคืน UTC" ใช้ตรงกันทั้งระบบ (คอลัมน์ @db.Date)
 * จึงต้องคืนแบบเดียวกันเพื่อให้เทียบกับข้อมูลเดิมได้
 */
export function toThaiDateOnly(value: Date) {
  const { year, month, day } = getThaiDateParts(value);

  return new Date(Date.UTC(year, month - 1, day));
}

/** วันนี้ตามเวลาไทย เป็นวันที่ล้วน */
export function thaiToday(now: Date = new Date()) {
  return toThaiDateOnly(now);
}

/** นาทีในวันตามเวลาไทย (0-1439) */
export function getThaiMinutesOfDay(value: Date) {
  const [hour = '0', minute = '0'] = timeFormatter.format(value).split(':');

  return Number(hour) * 60 + Number(minute);
}
