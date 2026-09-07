/**
 * ตัวอ่านรูปแบบ cron ห้าช่อง
 * =========================
 * ใช้แทนตัวตั้งเวลาของ BullMQ ตอนที่ระบบไม่ได้ต่อ Redis
 *
 * รองรับรูปแบบเท่าที่ระบบใช้จริงและที่ผู้ดูแลน่าจะตั้งเพิ่ม —
 * `*` · ตัวเลข · ช่วง `1-5` · รายการ `1,3,5` · ก้าว `*∕15` และ `1-9∕2`
 * ไม่รองรับชื่อเดือน/ชื่อวันแบบตัวอักษร (`JAN`, `SUN`) เพราะไม่มีที่ไหนใช้
 * และการรับไว้ครึ่ง ๆ กลาง ๆ อันตรายกว่าปฏิเสธไปเลย
 *
 *   นาที ชั่วโมง วันที่ เดือน วันในสัปดาห์
 *   0    2      *     *     *      = ตีสองทุกวัน
 *   0    4      *     *     0      = ตีสี่ของวันอาทิตย์
 *
 * เวลาที่ใช้เทียบคือเวลาท้องถิ่นของกระบวนการ ซึ่งตั้ง TZ=Asia/Bangkok ไว้แล้ว
 * ทั้งใน backend/.env และคู่มือติดตั้ง จึงตรงกับ `tz: 'Asia/Bangkok'` ที่ BullMQ เคยใช้
 */

/** ขอบเขตของแต่ละช่อง เรียงตามลำดับใน pattern */
const FIELD_RANGES: Array<{ min: number; max: number }> = [
  { min: 0, max: 59 }, // นาที
  { min: 0, max: 23 }, // ชั่วโมง
  { min: 1, max: 31 }, // วันที่
  { min: 1, max: 12 }, // เดือน
  { min: 0, max: 6 }, // วันในสัปดาห์ (0 = อาทิตย์)
];

export type CronFields = Array<Set<number>>;

/**
 * แปลง pattern เป็นชุดค่าที่ยอมรับได้ของแต่ละช่อง
 * โยน error ถ้ารูปแบบผิด — ผู้เรียกต้องดักเอง ไม่ให้ระบบล้มตอนบูต
 */
export function parseCronPattern(pattern: string): CronFields {
  const fields = pattern.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error(
      `รูปแบบ cron ต้องมี 5 ช่อง แต่ได้ ${fields.length} ช่อง: "${pattern}"`,
    );
  }

  return fields.map((field, index) =>
    parseField(field, FIELD_RANGES[index], pattern),
  );
}

function parseField(
  field: string,
  range: { min: number; max: number },
  pattern: string,
): Set<number> {
  const allowed = new Set<number>();

  for (const part of field.split(',')) {
    const [spec, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);

    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(
        `ก้าวของ cron ต้องเป็นจำนวนเต็มบวก: "${part}" ใน "${pattern}"`,
      );
    }

    let from: number;
    let to: number;

    if (spec === '*') {
      from = range.min;
      to = range.max;
    } else if (spec.includes('-')) {
      const [start, end] = spec.split('-').map(Number);
      from = start;
      to = end;
    } else {
      from = Number(spec);
      to = Number(spec);
    }

    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < range.min ||
      to > range.max ||
      from > to
    ) {
      throw new Error(
        `ค่าของ cron อยู่นอกช่วงที่รับได้: "${part}" ใน "${pattern}"`,
      );
    }

    for (let value = from; value <= to; value += step) {
      allowed.add(value);
    }
  }

  return allowed;
}

/**
 * ถึงเวลาที่ pattern กำหนดหรือยัง — เทียบระดับ "นาที" ตัววินาทีไม่มีผล
 *
 * กติกาวันที่กับวันในสัปดาห์ทำตาม cron มาตรฐาน คือถ้าระบุมาทั้งคู่
 * (ไม่ใช่ `*` ทั้งคู่) ให้ถือว่าเข้าเงื่อนไขเมื่อ **ช่องใดช่องหนึ่ง** ตรง
 * ไม่ใช่ต้องตรงทั้งคู่ — เป็นข้อที่คนเขียน cron เองพลาดกันบ่อย
 */
export function matchesCron(fields: CronFields, at: Date): boolean {
  const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields;

  if (!minutes.has(at.getMinutes())) return false;
  if (!hours.has(at.getHours())) return false;
  if (!months.has(at.getMonth() + 1)) return false;

  const dayOfMonthRestricted = daysOfMonth.size !== 31;
  const dayOfWeekRestricted = daysOfWeek.size !== 7;
  const dayOfMonthHit = daysOfMonth.has(at.getDate());
  const dayOfWeekHit = daysOfWeek.has(at.getDay());

  if (dayOfMonthRestricted && dayOfWeekRestricted) {
    return dayOfMonthHit || dayOfWeekHit;
  }

  if (dayOfMonthRestricted) return dayOfMonthHit;
  if (dayOfWeekRestricted) return dayOfWeekHit;

  return true;
}
