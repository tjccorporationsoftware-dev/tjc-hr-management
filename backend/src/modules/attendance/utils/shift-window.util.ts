/**
 * เส้นเวลาของกะทำงาน — รองรับกะข้ามเที่ยงคืนทุกรูปแบบ
 * -----------------------------------------------------------------------------
 * ปัญหาเดิม: ทั้งระบบเทียบเวลาเป็น "นาทีในวัน" (0-1439) ล้วน
 * กะกลางคืน 22:00-02:00 จึงคิดว่าคนออกงาน 02:00 คือ 120 นาที ซึ่งน้อยกว่า
 * เวลาเลิกงาน 02:00... ที่ถูกอ่านเป็น 120 เหมือนกัน แต่เวลาเข้างาน 22:00 = 1320
 * ทำให้ลำดับเวลาเพี้ยนทั้งกะ ผลคือถูกคิดเป็น "กลับก่อนเวลา ~20 ชั่วโมง"
 * แล้วหักเงิน และการตอกบัตรตอนตีสองถูกนับเป็นวันทำงานถัดไป
 *
 * วิธีแก้: แปลงทุกเวลาให้อยู่บน "เส้นเวลาของกะ" ที่เดินหน้าอย่างเดียว
 * โดยยึดเวลาเปิดรอบแรกเป็นหมุด (anchor) เวลาใดที่ย้อนกลับไปก่อนหมุด
 * แปลว่าอยู่คนละวันปฏิทิน จึงบวกไป 1 วัน
 *
 *   กะปกติ    07:00 → 08:00 → 17:00   = 420 → 480  → 1020   (ไม่ข้ามคืน)
 *   กะกลางคืน 22:00 → 22:00 → 02:00   = 1320 → 1320 → 1560  (ข้ามคืน)
 *   กะ 24 ชม. 08:00 → 08:00 (วันถัดไป) = 480 → 1920
 *   กะแบ่งช่วง 20:00 → 01:00 → 05:00   = 1200 → 1500 → 1740
 *
 * ไฟล์นี้เป็นคณิตศาสตร์ล้วน ไม่แตะ Prisma และไม่ผูกกับ timezone
 * (ผู้เรียกต้องแปลงเป็นนาทีตามเขตเวลาของนโยบายมาก่อน)
 */

export const MINUTES_PER_DAY = 1440;

/**
 * ช่วงเวลาก่อนเริ่มกะที่ยังนับว่าเป็น "มาก่อนเวลา" ไม่ใช่ "ตกค้างจากกะเมื่อวาน"
 *
 * 4 ชั่วโมงมาจากกรณีจริงที่กว้างที่สุดที่ยังไม่ชนกัน คือ พนักงานมาก่อนเข้างาน
 * ไม่เกินครึ่งกะ ขณะที่กะที่สั้นที่สุดที่ใช้กันคือ 8 ชั่วโมง
 */
export const DEFAULT_PUNCH_LOOKBACK_MINUTES = 240;

/** แปลง "HH:MM" เป็นนาทีในวัน คืน NaN ถ้ารูปแบบไม่ถูกต้อง */
export function parseTimeToMinutes(time?: string | null) {
  if (!time) return Number.NaN;

  const match = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.NaN;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return Number.NaN;

  return hour * 60 + minute;
}

/** ระยะห่างจากหมุดไปข้างหน้า 0-1439 นาที */
function forwardOffset(minutes: number, anchorMinutes: number) {
  return (((minutes - anchorMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * ย้ายเวลาของกฎ (เวลาเข้างาน เลิกงาน ปิดรอบ ฯลฯ) ขึ้นมาอยู่บนเส้นเวลาของกะ
 *
 * @param allowFullDay  true สำหรับเวลาที่ต้องอยู่ "หลัง" หมุดเสมอ เช่นเวลาเลิกงาน
 *                      ของกะ 24 ชั่วโมงที่ตรงกับเวลาเข้างานพอดี ถ้าไม่เปิดจะได้ 0
 */
export function toShiftMinutes(
  minutes: number,
  anchorMinutes: number,
  allowFullDay = false,
) {
  if (!Number.isFinite(minutes) || !Number.isFinite(anchorMinutes)) {
    return Number.NaN;
  }

  const offset = forwardOffset(minutes, anchorMinutes);

  if (offset === 0 && allowFullDay) {
    return anchorMinutes + MINUTES_PER_DAY;
  }

  return anchorMinutes + offset;
}

/** แปลงเวลาแบบ "HH:MM" ขึ้นเส้นเวลาของกะ */
export function timeStringToShiftMinutes(
  time: string | null | undefined,
  anchorMinutes: number,
  allowFullDay = false,
) {
  return toShiftMinutes(parseTimeToMinutes(time), anchorMinutes, allowFullDay);
}

export type ShiftRuleLike = {
  sessionCode?: string | null;
  punchType?: string | null;
  openTime?: string | null;
  expectedTime?: string | null;
  closeTime?: string | null;
  sortOrder?: number | null;
};

/**
 * ลำดับของรอบลงเวลาในหนึ่งกะ ใช้ตอนที่ไม่มี sortOrder ให้ยึด
 * ต้องตรงกับลำดับที่ engine ใช้หา rule คือ เข้าเช้า → เข้าบ่าย → ออกงาน
 */
const SESSION_CODE_ORDER: Record<string, number> = {
  MORNING_IN: 1,
  AFTERNOON_IN: 2,
  CHECK_OUT: 3,
  OFFSITE_IN: 1,
  OFFSITE_OUT: 3,
  CUSTOM: 2,
};

function ruleOrder(rule: ShiftRuleLike, index: number) {
  const sortOrder = Number(rule.sortOrder);
  if (Number.isFinite(sortOrder) && sortOrder > 0) return sortOrder;

  return SESSION_CODE_ORDER[String(rule.sessionCode ?? '')] ?? 100 + index;
}

/** เวลาที่ใช้เป็นจุดเริ่มของรอบนั้น — เปิดรอบก่อน ถ้าไม่มีใช้เวลาที่คาดหวัง */
function ruleStartMinutes(rule: ShiftRuleLike) {
  const open = parseTimeToMinutes(rule.openTime);
  if (Number.isFinite(open)) return open;

  return parseTimeToMinutes(rule.expectedTime);
}

export type ShiftWindow = {
  /** นาทีเริ่มกะ เป็นหมุดของเส้นเวลาทั้งกะ */
  anchorMinutes: number;
  /** นาทีสิ้นสุดกะบนเส้นเวลาของกะ (มากกว่า 1439 ได้ถ้าข้ามคืน) */
  endMinutes: number;
  /** กะนี้ลากข้ามเที่ยงคืนหรือไม่ */
  crossesMidnight: boolean;
};

/**
 * หาขอบเขตของกะจากชุดกฎรอบลงเวลา
 *
 * คืน anchorMinutes = NaN ถ้าตั้งค่าเวลาไม่ครบพอจะหาได้ ผู้เรียกต้องถอยไปใช้
 * การเทียบแบบเดิม (นาทีในวัน) แทนที่จะคำนวณผิด
 */
export function resolveShiftWindow(rules: ShiftRuleLike[]): ShiftWindow {
  const ordered = [...(rules ?? [])]
    .map((rule, index) => ({ rule, order: ruleOrder(rule, index) }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.rule);

  const first = ordered.find((rule) => Number.isFinite(ruleStartMinutes(rule)));

  if (!first) {
    return { anchorMinutes: Number.NaN, endMinutes: Number.NaN, crossesMidnight: false };
  }

  const anchorMinutes = ruleStartMinutes(first);

  /*
   * เดินไล่ตามลำดับรอบ โดยใช้ "เวลาที่คาดหวัง" เป็นตัวเดินเข็ม
   * แต่ละรอบต้องอยู่หลังรอบก่อนหน้าเสมอ ค่าที่ย้อนกลับแปลว่าข้ามไปวันถัดไป
   *
   * ใช้เฉพาะ expectedTime เดินเข็ม ไม่ใช้ openTime เพราะรอบถัดไปมักเปิดคาบเกี่ยว
   * กับรอบก่อนหน้า (เช่นรอบออกงานเปิด 16:00 ขณะที่รอบบ่ายปิด 16:59)
   * ถ้าเอา openTime มาเดินด้วยจะถูกตีความว่าย้อนกลับแล้วกระโดดไปอีกวัน
   */
  let cursor = anchorMinutes;
  let endMinutes = anchorMinutes;

  for (const rule of ordered) {
    const isFirst = rule === first;

    // รอบถัดไปที่ตรงกับเวลาเดิมพอดี = กะยาวเต็มวัน ไม่ใช่ยาว 0 นาที (กะ 24 ชม.)
    const expected = timeStringToShiftMinutes(rule.expectedTime, cursor, !isFirst);

    if (Number.isFinite(expected)) {
      cursor = expected;
      endMinutes = Math.max(endMinutes, expected);
    }

    const close = timeStringToShiftMinutes(rule.closeTime, cursor);

    if (Number.isFinite(close)) {
      endMinutes = Math.max(endMinutes, close);
    }
  }

  return {
    anchorMinutes,
    endMinutes,
    crossesMidnight: endMinutes >= MINUTES_PER_DAY,
  };
}

/**
 * ย้ายเวลาที่พนักงานตอกบัตรขึ้นเส้นเวลาของกะ
 *
 * ต่างจาก toShiftMinutes ตรงที่ยอมให้ค่าติดลบได้ เพราะการมาก่อนเวลาเป็นเรื่องปกติ
 * ถ้าไม่ยอม การตอกบัตรเวลา 07:30 ของกะที่เปิดรอบ 08:00 จะกลายเป็นสายเกือบ 24 ชั่วโมง
 */
export function toPunchShiftMinutes(
  minuteOfDay: number,
  anchorMinutes: number,
  lookbackMinutes = DEFAULT_PUNCH_LOOKBACK_MINUTES,
) {
  if (!Number.isFinite(minuteOfDay) || !Number.isFinite(anchorMinutes)) {
    return Number.NaN;
  }

  const offset = forwardOffset(minuteOfDay, anchorMinutes);

  // อยู่ในช่วงท้ายวันก่อนถึงหมุด = มาก่อนเวลา ให้เป็นค่าติดลบเทียบกับหมุด
  if (offset >= MINUTES_PER_DAY - lookbackMinutes) {
    return anchorMinutes + offset - MINUTES_PER_DAY;
  }

  return anchorMinutes + offset;
}

/**
 * การตอกบัตรครั้งนี้เป็นของวันทำงานไหน เทียบกับวันปฏิทินที่ตอก
 *
 * คืน 0 = วันเดียวกับปฏิทิน · -1 = เป็นของวันทำงานเมื่อวาน (กะข้ามคืน)
 *
 * ตัวอย่าง กะ 22:00-02:00
 *   ตอก 22:05 วันที่ 10 → 0  → เป็นวันทำงานที่ 10
 *   ตอก 02:05 วันที่ 11 → -1 → เป็นวันทำงานที่ 10 (ไม่ใช่วันที่ 11)
 */
export function resolveWorkDateOffset(
  minuteOfDay: number,
  window: ShiftWindow,
  lookbackMinutes = DEFAULT_PUNCH_LOOKBACK_MINUTES,
) {
  if (!window.crossesMidnight || !Number.isFinite(window.anchorMinutes)) {
    return 0;
  }

  const shiftMinutes = toPunchShiftMinutes(
    minuteOfDay,
    window.anchorMinutes,
    lookbackMinutes,
  );

  if (!Number.isFinite(shiftMinutes)) return 0;

  // เลย 24:00 บนเส้นเวลาของกะ = ตอกหลังเที่ยงคืน จึงเป็นของวันทำงานก่อนหน้า
  return shiftMinutes >= MINUTES_PER_DAY ? -1 : 0;
}

/**
 * เวลานี้อยู่ในช่วงเปิด-ปิดของรอบลงเวลานี้หรือไม่ (รองรับช่วงที่คร่อมเที่ยงคืน)
 *
 * เดิมเทียบ `open <= t && t <= close` ตรง ๆ ซึ่งไม่มีทางเป็นจริงเมื่อ close < open
 * เช่นรอบออกงานของกะกลางคืนที่เปิด 01:00 ปิด 04:00 แต่ตอกตอน 02:00 ของวันถัดไป
 */
export function isWithinRuleWindow(
  minuteOfDay: number,
  openTime: string | null | undefined,
  closeTime: string | null | undefined,
) {
  const open = parseTimeToMinutes(openTime);
  const close = parseTimeToMinutes(closeTime);

  if (!Number.isFinite(open) || !Number.isFinite(close)) return false;
  if (!Number.isFinite(minuteOfDay)) return false;

  // ช่วงปกติภายในวันเดียว
  if (open <= close) {
    return minuteOfDay >= open && minuteOfDay <= close;
  }

  // ช่วงคร่อมเที่ยงคืน เช่น 22:00-02:00
  return minuteOfDay >= open || minuteOfDay <= close;
}
