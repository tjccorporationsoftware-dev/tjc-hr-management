import type { AttendanceDay, AttendanceDayState } from './history.types';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * สร้างตารางปฏิทินหนึ่งเดือน
 *
 * ทั้งไฟล์ทำงานกับสตริง YYYY-MM และ YYYY-MM-DD ไม่แตะ Date object เลย
 * เพราะเดือนในปฏิทินเป็นเรื่องของวันตามปฏิทิน ไม่ใช่จุดเวลา
 * การใช้ `new Date()` แล้วอ่าน getMonth() จะเลื่อนไปหนึ่งวัน/หนึ่งเดือน
 * เมื่อโซนเวลาเครื่องไม่ตรงกับที่คาด ซึ่งหาสาเหตุยากมากเวลาเกิดจริง
 */

export interface CalendarCell {
  /** null = ช่องเติมของสัปดาห์แรก/สุดท้าย ไม่ใช่วันในเดือนนี้ */
  dateKey: string | null;
  day: AttendanceDay | null;
  dayOfMonth: number | null;
  isToday: boolean;
}

export const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;

const pad = (value: number) => String(value).padStart(2, '0');

/** แยก "2026-08" เป็นตัวเลข — คืน null เมื่อรูปแบบไม่ถูก */
function parseMonth(month: string): { month: number; year: number } | null {
  const matched = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);

  if (!matched) {
    return null;
  }

  return { month: Number(matched[2]), year: Number(matched[1]) };
}

/** จำนวนวันของเดือน — วันที่ 0 ของเดือนถัดไปคือวันสุดท้ายของเดือนนี้ */
export function daysInMonth(month: string): number {
  const parsed = parseMonth(month);

  if (!parsed) {
    return 0;
  }

  return new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
}

/** เลื่อนเดือนไปข้างหน้า/ถอยหลัง คืนรูปแบบ YYYY-MM เหมือนเดิม */
export function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);

  if (!parsed) {
    return month;
  }

  /* Date.UTC รับเดือนเกิน 11 หรือติดลบได้ และทดปีให้เอง */
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1));

  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/** เดือนของวันที่หนึ่ง ๆ ในรูปแบบ YYYY-MM */
export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** วันนี้ตามนาฬิกาเครื่อง ในรูปแบบ YYYY-MM-DD */
export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * เจ็ดวันของสัปดาห์ที่ dateKey อยู่ เริ่มวันอาทิตย์ คืนเป็น YYYY-MM-DD
 *
 * คิดด้วย Date.UTC ล้วนเหมือนทั้งไฟล์ — สัปดาห์เป็นเรื่องของวันตามปฏิทิน
 * ถ้าบวกลบด้วยเวลาเครื่อง ผู้ใช้ที่โซนเวลาติดลบจะได้สัปดาห์เลื่อนไปหนึ่งวัน
 * (บวกวันด้วยมิลลิวินาทีปลอดภัยใน UTC เพราะไม่มี DST ให้ทดวัน)
 */
export function weekOf(dateKey: string): string[] {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!matched) {
    return [];
  }

  const anchor = Date.UTC(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const start = anchor - new Date(anchor).getUTCDay() * dayMs;

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start + index * dayMs);

    return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(
      day.getUTCDate(),
    )}`;
  });
}

/**
 * จำนวนวันจาก from ถึง to (บวก = to อยู่ข้างหน้า) คืน null เมื่อรูปแบบไม่ถูก
 *
 * คิดใน UTC ล้วนเหมือนทั้งไฟล์ — ทั้งสองค่าเป็นวันตามปฏิทิน ไม่ใช่จุดเวลา
 * ถ้าใช้เวลาเครื่องจะได้เศษวันติดมา แล้วปัดเป็นวันเกิน/ขาดไปหนึ่ง
 */
export function daysBetween(from: string, to: string): number | null {
  const pattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const left = pattern.exec(from);
  const right = pattern.exec(to);

  if (!left || !right) {
    return null;
  }

  const toUtc = (parts: RegExpExecArray) =>
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));

  return Math.round((toUtc(right) - toUtc(left)) / (24 * 60 * 60 * 1000));
}

/**
 * วันที่แบบสั้นภาษาไทยจาก YYYY-MM-DD เช่น "20 ส.ค."
 *
 * ใช้ timeZone: 'UTC' เพราะค่าที่รับมาเป็น "วันตามปฏิทิน" ไม่ใช่จุดเวลา —
 * ถ้าปล่อยให้แปลงตามโซนเวลาเครื่อง ผู้ใช้ที่ตั้งโซนติดลบจะเห็นวันเลื่อนไปหนึ่งวัน
 */
export function formatShortDate(
  dateKey: string | null | undefined,
): string | null {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);

  return thaiDate(new Date(Date.UTC(year!, month! - 1, day!)), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * ชื่อเดือนย่อจาก YYYY-MM-DD เช่น "ส.ค."
 *
 * มีแยกจาก `formatShortDate` เพราะตารางรายวันวางวันที่กับเดือนคนละบรรทัด
 * (เลขวันตัวใหญ่ เดือนตัวเล็กใต้เลข) จะตัดสตริง "20 ส.ค." เอาเองไม่ได้
 */
export function formatShortMonth(
  dateKey: string | null | undefined,
): string | null {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);

  return thaiDate(new Date(Date.UTC(year!, month! - 1, day!)), {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** ชื่อเดือนภาษาไทยพร้อมปี พ.ศ. */
export function formatMonthLabel(month: string): string {
  const parsed = parseMonth(month);

  if (!parsed) {
    return month;
  }

  return thaiDate(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)), {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  });
}

/**
 * ตารางปฏิทินเป็นแถวละ 7 ช่อง เริ่มวันอาทิตย์
 * ช่องก่อนวันที่ 1 และหลังวันสุดท้ายเป็น null เพื่อให้ตารางเต็มแถวเสมอ
 */
export function buildCalendar(
  month: string,
  days: AttendanceDay[],
  today: string = todayKey(),
): CalendarCell[][] {
  const parsed = parseMonth(month);

  if (!parsed) {
    return [];
  }

  const byDate = new Map(days.map((day) => [day.workDate, day]));
  const total = daysInMonth(month);
  const firstWeekday = new Date(
    Date.UTC(parsed.year, parsed.month - 1, 1),
  ).getUTCDay();

  const cells: CalendarCell[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ dateKey: null, day: null, dayOfMonth: null, isToday: false });
  }

  for (let dayOfMonth = 1; dayOfMonth <= total; dayOfMonth += 1) {
    const dateKey = `${month}-${pad(dayOfMonth)}`;

    cells.push({
      dateKey,
      day: byDate.get(dateKey) ?? null,
      dayOfMonth,
      isToday: dateKey === today,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ dateKey: null, day: null, dayOfMonth: null, isToday: false });
  }

  const weeks: CalendarCell[][] = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

/** ชั่วโมง:นาที จากจำนวนนาที เช่น 90 → "1 ชม. 30 น." */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '—';
  }

  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  if (hours === 0) {
    return `${rest} น.`;
  }

  return rest === 0 ? `${hours} ชม.` : `${hours} ชม. ${rest} น.`;
}

export const DAY_STATE_LABEL: Record<AttendanceDayState, string> = {
  ABSENT: 'ขาดงาน',
  HOLIDAY: 'วันหยุด',
  LATE: 'มาสาย',
  LEAVE: 'ลา',
  MISSING_LOG: 'เวลาไม่ครบ',
  PRESENT: 'ปกติ',
};

/**
 * ช่องเวลาสามช่องบนหน้าแรก
 *
 * backend เก็บชื่อรอบเป็น MORNING / AFTERNOON / EVENING ซึ่งแปลงมาจากรหัสกฎ
 * MORNING_IN / AFTERNOON_IN / CHECK_OUT ตอนบันทึกการลงเวลา
 *
 * เคยพังจริง: หน้าแรกไปหาด้วยชื่อรหัสกฎ ซึ่งไม่มีทางตรงกับที่เก็บ ทางถอยที่ใช้
 * ตอนสรุปรายวันยังไม่ทันคำนวณจึงไม่เคยทำงาน เวลาบนจอเลยตกไปใช้ "การแตะครั้งแรก
 * ตามลำดับเวลา" ซึ่งผิดทันทีที่มีการแตะซ้ำหรือมีรายการที่ HR กรอกมือแทรก
 *
 * รับทั้งสองแบบเพื่อรองรับข้อมูลเก่าและ backend รุ่นก่อนที่ยังส่งรหัสกฎมา
 */
export type AttendanceStampSlot = 'MORNING' | 'AFTERNOON' | 'EVENING';

const SESSION_SLOT: Record<string, AttendanceStampSlot> = {
  AFTERNOON: 'AFTERNOON',
  AFTERNOON_IN: 'AFTERNOON',
  CHECK_OUT: 'EVENING',
  EVENING: 'EVENING',
  MORNING: 'MORNING',
  MORNING_IN: 'MORNING',
};

export function resolveStampSlot(
  session: string | null | undefined,
): AttendanceStampSlot | null {
  if (!session) return null;

  return SESSION_SLOT[session.trim().toUpperCase()] ?? null;
}

/**
 * จับเวลาแตะของแต่ละรอบจาก log ดิบของวันนี้
 *
 * ยึด "ครั้งแรกของรอบ" ให้ตรงกับที่ฝั่งสรุปรายวันเลือก ไม่งั้นตัวเลขบนหน้าแรก
 * กับหน้าตรวจของ HR จะไม่ตรงกันเมื่อมีการแตะซ้ำ
 */
export function collectStampsBySlot(
  logs: { session?: string | null; logTime: Date }[],
): Map<AttendanceStampSlot, Date> {
  const stamps = new Map<AttendanceStampSlot, Date>();

  for (const log of logs) {
    const slot = resolveStampSlot(log.session);

    if (slot && !stamps.has(slot)) {
      stamps.set(slot, log.logTime);
    }
  }

  return stamps;
}

export interface TodayStamps {
  afternoonInAt: Date | null;
  checkOutAt: Date | null;
  morningInAt: Date | null;
}

export interface TodayStampSources {
  /** log ดิบของวันนี้ ไม่ต้องเรียงมาก่อน */
  logs: { logTime: Date; logType: string; session?: string | null }[];
  /** สรุปรายวันของวันนี้ ถ้าระบบสรุปให้แล้ว */
  record?: {
    afternoonInAt?: Date | null;
    checkOutAt?: Date | null;
    morningInAt?: Date | null;
  } | null;
}

/**
 * เลือกเวลาลงงานสามรอบของวันนี้ ใช้ร่วมกันทั้งหน้าแรกและหน้าลงเวลา
 *
 * ที่มาเรียงตามความน่าเชื่อถือ
 *   1. **สรุปรายวัน** รู้ช่วงเวลาของแต่ละรอบ จึงเป็นตัวเดียวที่รู้จริงว่าการแตะ
 *      ตกอยู่ในรอบไหน
 *   2. **session ที่ติดมากับ log** ใช้ตอนเพิ่งลงเวลาเสร็จและระบบยังไม่ได้สรุป
 *      ยอดของวันให้
 *   3. **เดาจากลำดับ log** log จริงบางรายการไม่มี session กำกับ (เจอบนเครื่อง
 *      จริง: ลงเวลา 09:38 แล้วสรุปคำนวณ "สาย 98 นาที" ถูก แต่ session ว่าง)
 *      ถ้าไม่มีทางที่สาม แถวเวลาจะเป็นขีดว่างทั้งแถวทั้งที่ผู้ใช้ลงเวลาไปแล้ว
 *      ซึ่งผู้ใช้อ่านว่า "ระบบไม่บันทึก" แล้วไปลงซ้ำ
 *
 * ทางที่สามเดาผิดเมื่อพนักงานมาทำงานรอบเดียว — คนที่มาเฉพาะรอบบ่ายมี CHECK_IN
 * ใบเดียว ถ้าหยิบตรง ๆ ใบนั้นจะไปอยู่ช่อง "เข้างานเช้า" ทั้งที่สรุปรายวันบอกแล้ว
 * ว่าเป็นการเข้ารอบบ่าย ผลคือเวลาเดียวกันโผล่สองช่อง จึงแยกเป็นสองรอบ: จองจาก
 * แหล่งที่รู้จริงก่อน แล้วค่อยเดาเฉพาะช่องที่ยังว่างโดยข้ามเวลาที่ถูกจองไปแล้ว
 */
export function resolveTodayStamps({
  logs,
  record,
}: TodayStampSources): TodayStamps {
  const stamped = collectStampsBySlot(logs);

  /* รอบแรก: เอาเฉพาะแหล่งที่รู้ว่าการลงเวลาตกอยู่ในรอบไหน */
  const morning = record?.morningInAt ?? stamped.get('MORNING') ?? null;
  const afternoon = record?.afternoonInAt ?? stamped.get('AFTERNOON') ?? null;
  const evening = record?.checkOutAt ?? stamped.get('EVENING') ?? null;

  const claimed = new Set(
    [morning, afternoon, evening]
      .filter((value): value is Date => value != null)
      .map((value) => value.getTime()),
  );

  /* เรียงเองเสมอ ลำดับที่ backend ส่งมาไม่ใช่สัญญา */
  const sorted = [...logs].sort(
    (left, right) => left.logTime.getTime() - right.logTime.getTime(),
  );
  const checkIns = sorted.filter((log) => log.logType === 'CHECK_IN');
  const checkOuts = sorted.filter((log) => log.logType === 'CHECK_OUT');

  /* รอบสอง: เดาเฉพาะช่องที่ยังว่าง และห้ามหยิบเวลาที่รอบแรกจองไปแล้ว */
  const guess = (candidate: Date | undefined): Date | null => {
    if (!candidate || claimed.has(candidate.getTime())) return null;

    claimed.add(candidate.getTime());
    return candidate;
  };

  return {
    afternoonInAt: afternoon ?? guess(checkIns[1]?.logTime),
    checkOutAt: evening ?? guess(checkOuts[checkOuts.length - 1]?.logTime),
    morningInAt: morning ?? guess(checkIns[0]?.logTime),
  };
}
