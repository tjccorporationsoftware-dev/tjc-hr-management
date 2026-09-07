/**
 * จัดรูปแบบวันที่ไทยเอง ไม่พึ่ง locale ของเครื่อง
 *
 * ## บั๊กที่ตัวนี้แก้
 *
 * ทั้งแอปเคยเรียก `toLocaleDateString('th-TH', …)` แล้วปล่อยให้เครื่องตัดสินว่า
 * ปีเป็น พ.ศ. หรือ ค.ศ. — บนเครื่องที่ ICU ครบ (iOS, Node) ได้ "7 ก.ย. 2569"
 * แต่บน Android หลายรุ่นที่ ICU ถูกตัดมาให้เล็กลง ได้ "7 ก.ย. 2026" ทั้งที่โค้ด
 * บรรทัดเดียวกันเป๊ะ ชื่อเดือนกับชื่อวันก็เสี่ยงหล่นกลับเป็นอังกฤษด้วยเหตุผล
 * เดียวกัน
 *
 * ที่นี่จึงประกอบสตริงเองทั้งหมด: อ่านเลขวัน/เดือน/ปีจาก `Date` แล้วเปิดตาราง
 * ชื่อไทยของเราเอง บวก 543 เอง ผลลัพธ์จึงเหมือนกันทุกเครื่องทุกรุ่น
 *
 * ## ลำดับคือ วัน → เดือน → ปี เสมอ
 *
 * ตามที่คนไทยอ่าน ไม่ใช่ลำดับของ locale ที่เผลอสลับเป็นเดือน/วัน/ปี ได้เมื่อ
 * ระบบ fallback ไปใช้ en-US
 *
 * ## เขตเวลา
 *
 * ค่าที่ backend ส่งมาเป็น "วันทำงาน" (`2026-09-07`) ถูกแปลงเป็น `Date` ที่
 * เที่ยงคืน UTC จุดที่แสดงค่าพวกนี้ต้องส่ง `timeZone: 'UTC'` มาด้วย ไม่งั้น
 * เครื่องที่อยู่โซนติดลบจะอ่านได้เป็นวันก่อนหน้า
 */

/** ชื่อเดือนแบบย่อ — เรียงตามเลขเดือนของ `Date` (0 = มกราคม) */
const MONTHS_SHORT = [
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
];

const MONTHS_LONG = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

/** ชื่อวันแบบย่อ — เรียงตามค่า `getDay()` (0 = อาทิตย์) */
const WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const WEEKDAYS_LONG = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
];

/** ปีพุทธศักราช = ปีคริสต์ศักราช + 543 */
const BUDDHIST_OFFSET = 543;

export interface ThaiDateOptions {
  /** `'short'` = "จ." · `'long'` = "วันจันทร์" */
  weekday?: 'short' | 'long';
  day?: 'numeric' | '2-digit';
  month?: 'numeric' | '2-digit' | 'short' | 'long';
  /** `'numeric'` = 2569 · `'2-digit'` = 69 */
  year?: 'numeric' | '2-digit';
  /** อ่านวัน/เดือน/ปีจากเวลา UTC แทนเวลาเครื่อง */
  timeZone?: 'UTC';
  /** ต่อท้ายด้วยเวลา — `'short'` = " 17:30" */
  time?: 'short';
}

type DateInput = Date | string | number | null | undefined;

/** แปลงค่าที่รับมาเป็น `Date` ที่ใช้ได้ — คืน `null` เมื่อแปลงไม่ได้ */
function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** ตัวเลขวัน/เดือน/ปี/เวลา ของวันหนึ่ง อ่านตามเขตเวลาที่สั่ง */
function parts(date: Date, timeZone?: 'UTC') {
  const utc = timeZone === 'UTC';

  return {
    day: utc ? date.getUTCDate() : date.getDate(),
    hour: utc ? date.getUTCHours() : date.getHours(),
    minute: utc ? date.getUTCMinutes() : date.getMinutes(),
    month: utc ? date.getUTCMonth() : date.getMonth(),
    weekday: utc ? date.getUTCDay() : date.getDay(),
    year: utc ? date.getUTCFullYear() : date.getFullYear(),
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * เวลาแบบ 24 ชั่วโมง "17:30"
 *
 * ไม่ผ่าน locale เช่นกัน เพราะเครื่องที่ตั้งเป็นระบบ 12 ชั่วโมงจะได้ AM/PM
 * ปนมาในจอที่ทั้งจอเป็นเวลาแบบ 24 ชั่วโมง
 */
export function thaiTime(value: DateInput, timeZone?: 'UTC'): string {
  const date = toDate(value);
  if (!date) return '';

  const { hour, minute } = parts(date, timeZone);

  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * วันที่ไทย ลำดับ วัน → เดือน → ปี
 *
 * ไม่ส่ง options มาเลยจะได้รูปแบบตัวเลขล้วน "7/9/2569" ซึ่งเป็นค่าเดียวกับที่
 * `toLocaleDateString('th-TH')` ให้บนเครื่องที่ ICU ครบ
 */
export function thaiDate(value: DateInput, options: ThaiDateOptions = {}): string {
  const date = toDate(value);
  if (!date) return '';

  const { day, month, weekday, year } = parts(date, options.timeZone);
  const hasStyle =
    options.weekday !== undefined ||
    options.day !== undefined ||
    options.month !== undefined ||
    options.year !== undefined;

  if (!hasStyle) {
    const numeric = `${day}/${month + 1}/${year + BUDDHIST_OFFSET}`;

    return options.time ? `${numeric} ${thaiTime(date, options.timeZone)}` : numeric;
  }

  const yearText =
    options.year === 'numeric'
      ? String(year + BUDDHIST_OFFSET)
      : options.year === '2-digit'
        ? pad((year + BUDDHIST_OFFSET) % 100)
        : null;

  const monthText =
    options.month === 'long'
      ? MONTHS_LONG[month]
      : options.month === 'short'
        ? MONTHS_SHORT[month]
        : options.month === '2-digit'
          ? pad(month + 1)
          : options.month === 'numeric'
            ? String(month + 1)
            : null;

  const dayText =
    options.day === '2-digit'
      ? pad(day)
      : options.day === 'numeric'
        ? String(day)
        : null;

  const pieces: string[] = [];

  /*
   * "วันจันทร์ที่ 7 กันยายน" — รูปแบบเต็มของไทยเชื่อมวันกับวันที่ด้วย "ที่"
   * ไม่ใช่เว้นวรรคเฉย ๆ (ตรงกับที่ ICU ให้บนเครื่องที่ locale ครบ)
   */
  if (options.weekday === 'long') {
    pieces.push(
      dayText
        ? `วัน${WEEKDAYS_LONG[weekday]}ที่ ${dayText}`
        : `วัน${WEEKDAYS_LONG[weekday]}`,
    );
  } else {
    if (options.weekday === 'short') pieces.push(WEEKDAYS_SHORT[weekday]!);
    if (dayText) pieces.push(dayText);
  }

  if (monthText) pieces.push(monthText);
  if (yearText) pieces.push(yearText);

  const text = pieces.join(' ');

  return options.time ? `${text} ${thaiTime(date, options.timeZone)}` : text;
}

/** ปี พ.ศ. ของวันหนึ่ง — ใช้เมื่อต้องการเลขปีเดี่ยว ๆ ไปประกอบเอง */
export function thaiYear(value: DateInput, timeZone?: 'UTC'): number | null {
  const date = toDate(value);
  if (!date) return null;

  return parts(date, timeZone).year + BUDDHIST_OFFSET;
}
