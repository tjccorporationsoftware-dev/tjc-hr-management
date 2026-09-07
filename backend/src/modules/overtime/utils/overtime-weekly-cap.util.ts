/**
 * เพดานชั่วโมงทำงานล่วงเวลาต่อสัปดาห์
 * -----------------------------------------------------------------------------
 * พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541 มาตรา 26
 *   ชั่วโมงทำงานล่วงเวลา (ม.24) รวมกับชั่วโมงทำงานในวันหยุด (ม.25 และ ม.26)
 *   ต้องไม่เกิน 36 ชั่วโมงต่อสัปดาห์
 *
 * เดิมระบบไม่มีเพดานนี้เลย มีแค่ maxHoursPerDay ระดับนโยบาย
 * พนักงานจึงยื่นและถูกอนุมัติ OT เกินที่กฎหมายอนุญาตได้โดยไม่มีอะไรเตือน
 * ซึ่งเป็นความผิดของนายจ้าง ไม่ใช่ของลูกจ้าง
 *
 * ไฟล์นี้เป็นคณิตศาสตร์ล้วน ไม่แตะ Prisma
 */

/** ม.26 — เพดานรวมต่อสัปดาห์ */
export const STATUTORY_WEEKLY_OT_HOURS = 36;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ขอบเขตสัปดาห์ที่ครอบวันนี้ (อาทิตย์ 00:00 ถึง เสาร์ 23:59)
 *
 * ใช้อาทิตย์เป็นวันเริ่มสัปดาห์ตามปฏิทินไทยที่ใช้กันทั่วไป
 * คิดบน UTC เพราะ workDate ถูกเก็บเป็นวันที่ล้วนแบบ UTC ทั้งระบบ
 */
export function resolveWeekRange(workDate: Date) {
  const dayOfWeek = workDate.getUTCDay();

  const start = new Date(workDate.getTime() - dayOfWeek * MS_PER_DAY);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start.getTime() + 6 * MS_PER_DAY);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

export type WeeklyOtCapResult = {
  /** ชั่วโมงที่มีอยู่แล้วในสัปดาห์นี้ (ไม่รวมใบที่กำลังตรวจ) */
  existingHours: number;
  /** ชั่วโมงของใบที่กำลังตรวจ */
  requestedHours: number;
  totalHours: number;
  limitHours: number;
  exceeded: boolean;
  /** ชั่วโมงที่ยังยื่นได้ในสัปดาห์นี้ */
  remainingHours: number;
};

/**
 * รวมชั่วโมงแล้วเทียบกับเพดาน
 *
 * @param limitHours  เพดานของบริษัท ถ้าตั้งไว้ต่ำกว่ากฎหมายให้ใช้ค่าที่ต่ำกว่า
 *                    ตั้งสูงกว่ากฎหมายไม่ได้ กฎหมายเป็นเพดานเสมอ
 */
export function evaluateWeeklyOtCap(params: {
  existingHours: number;
  requestedHours: number;
  limitHours?: number | null;
}): WeeklyOtCapResult {
  const existingHours = toHours(params.existingHours);
  const requestedHours = toHours(params.requestedHours);

  const configured = toHours(params.limitHours);
  const limitHours =
    configured > 0
      ? Math.min(configured, STATUTORY_WEEKLY_OT_HOURS)
      : STATUTORY_WEEKLY_OT_HOURS;

  const totalHours = round2(existingHours + requestedHours);

  return {
    existingHours,
    requestedHours,
    totalHours,
    limitHours,
    exceeded: totalHours > limitHours,
    remainingHours: round2(Math.max(limitHours - existingHours, 0)),
  };
}

/** ข้อความอธิบายว่าเกินเพดานเพราะอะไร ให้ผู้ใช้แก้ได้เอง */
export function buildWeeklyOtCapMessage(result: WeeklyOtCapResult) {
  const format = (value: number) =>
    value.toLocaleString('th-TH', { maximumFractionDigits: 2 });

  return (
    `ทำงานล่วงเวลาได้ไม่เกิน ${format(result.limitHours)} ชั่วโมงต่อสัปดาห์ ` +
    `ตาม พ.ร.บ.คุ้มครองแรงงาน มาตรา 26 ` +
    `(สัปดาห์นี้มีอยู่แล้ว ${format(result.existingHours)} ชั่วโมง ` +
    `ใบนี้ ${format(result.requestedHours)} ชั่วโมง รวม ${format(result.totalHours)} ชั่วโมง ` +
    `ยื่นเพิ่มได้อีก ${format(result.remainingHours)} ชั่วโมง)`
  );
}

function toHours(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? round2(parsed) : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
