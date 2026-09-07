/**
 * กติกาใบลาซ้อนวันเดียวกัน — สองใบขัดกันเมื่อกินเวลาช่วงเดียวกันของวัน
 *
 * ที่มา: ระบบเคยอนุมัติใบลาเต็มวันวันเดียวกันสองใบให้คนเดียวกันได้เฉย ๆ
 * โควตาถูกหักสองครั้ง และถ้าเป็นลาไม่รับค่าจ้าง เงินก็ถูกหักสองครั้งด้วย
 *
 * แต่ห้ามเหมาว่า "วันเดียวกัน = ซ้อน" เพราะเคสถูกกฎหมายมีจริง
 *   - ลาครึ่งเช้า + ลาครึ่งบ่าย วันเดียวกัน (คนละครึ่ง ไม่ทับกัน)
 *   - ลารายชั่วโมงสองใบคนละช่วงเวลา เช่น 08:00-09:00 กับ 15:00-16:00
 */

export type LeaveSlice = {
  dayType: string | null | undefined;
  /** เฉพาะรายชั่วโมง รูปแบบ "HH:mm" */
  startTime?: string | null;
  endTime?: string | null;
};

/** แปลง "HH:mm" เป็นนาทีตั้งแต่เที่ยงคืน — ค่าเสีย/ว่าง = null */
function toMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes < 1440 ? minutes : null;
}

/**
 * ครึ่งวันเช้า/บ่ายตัดกันที่เที่ยง ใช้ขอบมาตรฐานของระบบ (บ่ายเริ่ม 13:00)
 * เผื่อคาบ 12:00-13:00 ให้ทั้งสองฝั่ง = เข้มไว้ก่อน ดีกว่าปล่อยเงินหักซ้ำ
 */
const MORNING_END = toMinutes('13:00')!;
const AFTERNOON_START = toMinutes('12:00')!;

/** ช่วงเวลาในวันที่ใบลานี้กิน — null = กินทั้งวัน */
function sliceWindow(slice: LeaveSlice): { from: number; to: number } | null {
  const dayType = String(slice.dayType ?? 'FULL_DAY');

  if (dayType === 'HALF_DAY_MORNING') return { from: 0, to: MORNING_END };
  if (dayType === 'HALF_DAY_AFTERNOON') return { from: AFTERNOON_START, to: 1440 };

  if (dayType === 'HOURLY') {
    const from = toMinutes(slice.startTime);
    const to = toMinutes(slice.endTime);
    // รายชั่วโมงที่ไม่มีช่วงเวลา ตีเป็นกินทั้งวันไว้ก่อน — ปลอดภัยกว่าปล่อยผ่าน
    if (from === null || to === null || to <= from) return null;
    return { from, to };
  }

  return null; // FULL_DAY และค่าที่ไม่รู้จัก = ทั้งวัน
}

/** ใบลาสองใบ "ในวันเดียวกัน" ขัดกันหรือไม่ */
export function leaveSlicesConflict(a: LeaveSlice, b: LeaveSlice): boolean {
  /*
   * ครึ่งเช้า + ครึ่งบ่าย คือการลาเต็มวันแบบแยกสองใบ — ถูกกติกาเสมอ
   * ต้อง special case เพราะหน้าต่างเวลาของสองครึ่งถูกออกแบบให้เหลื่อมกัน
   * ช่วงเที่ยง (กันรายชั่วโมงคาบ 12:00-13:00 หลุด) ถ้าเทียบด้วยหน้าต่าง
   * ตรง ๆ คู่นี้จะชนกันเองทั้งที่ไม่ได้ลาช่วงเดียวกันจริง
   */
  const halves = [String(a.dayType), String(b.dayType)].sort();
  if (halves[0] === 'HALF_DAY_AFTERNOON' && halves[1] === 'HALF_DAY_MORNING') {
    return false;
  }

  const wa = sliceWindow(a);
  const wb = sliceWindow(b);

  if (wa === null || wb === null) return true; // มีฝั่งใดกินทั้งวัน = ชนแน่นอน

  return wa.from < wb.to && wb.from < wa.to;
}
