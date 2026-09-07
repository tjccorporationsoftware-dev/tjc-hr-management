/**
 * ตัวแปลงค่าจากไฟล์ Excel ของระบบเดิม
 *
 * ไฟล์รายงานที่ลูกค้าส่งมาไม่ได้เขียนตามมาตรฐานเดียว วันที่มีทั้ง 01/08/2020,
 * 1/8/2563 และเซลล์วันที่จริง ตัวเลขมีคอมมาคั่น ชื่อกับรหัสมาติดกันในช่องเดียว
 * รวมไว้ที่เดียวเพื่อให้ทุกชุดข้อมูลตีความเหมือนกัน และมีเทสต์กำกับ
 */

/** ปีที่มากกว่านี้ถือว่าเป็น พ.ศ. — ค.ศ. ยังไม่ถึงและ พ.ศ. ต่ำกว่านี้ก็ไม่มีในทะเบียนพนักงาน */
const BUDDHIST_YEAR_THRESHOLD = 2400;

export function normalizeHeaderText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s ]/g, '')
    .replace(/[()（）[\]{}.\-_/\:*#]/g, '');
}

export function toGregorianYear(year: number) {
  return year > BUDDHIST_YEAR_THRESHOLD ? year - 543 : year;
}

/** คืนวันที่แบบ UTC เที่ยงคืน — ทั้งระบบเก็บวันที่ล้วนแบบนี้ */
function buildDate(year: number, month: number, day: number): Date | null {
  const gregorianYear = toGregorianYear(year);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(gregorianYear, month - 1, day));

  if (
    date.getUTCFullYear() !== gregorianYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function parseImportDate(value: string): Date | null {
  const text = value.trim();

  if (!text) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) {
    return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (slashed) {
    return buildDate(Number(slashed[3]), Number(slashed[2]), Number(slashed[1]));
  }

  return null;
}

export function parseImportNumber(value: string): number | null {
  const text = value.replace(/[,\s฿]/g, '').trim();

  if (!text) return null;

  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * แยกชื่อกับนามสกุลจากช่องเดียว
 *
 * ระบบเดิมเก็บ "ปัญญดา ผาเหลา" ไว้ช่องเดียว ส่วนคนที่มีชื่อกลางหรือนามสกุลสองท่อน
 * จะมีช่องว่างมากกว่าหนึ่งจุด ยึดว่าคำสุดท้ายคือนามสกุล ที่เหลือเป็นชื่อ
 */
export function splitFullName(value: string): {
  firstName: string;
  lastName: string;
} {
  const parts = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

/** "ET0001 : พนักงานรายเดือน" → { code: "ET0001", name: "พนักงานรายเดือน" } */
export function splitCodeAndName(value: string): {
  code: string | null;
  name: string;
} {
  const text = value.trim();
  const separatorIndex = text.indexOf(':');

  if (separatorIndex <= 0) return { code: null, name: text };

  return {
    code: text.slice(0, separatorIndex).trim() || null,
    name: text.slice(separatorIndex + 1).trim(),
  };
}

/** ตัดชื่อเล่นในวงเล็บออก เช่น "ปัญญดา ผาเหลา(แทมมี่)" */
export function stripTrailingNickname(value: string): {
  name: string;
  nickname: string | null;
} {
  const matched = /^(.*?)[(（]([^)）]*)[)）]\s*$/.exec(value.trim());

  if (!matched) return { name: value.trim(), nickname: null };

  return {
    name: matched[1].trim(),
    nickname: matched[2].trim() || null,
  };
}
