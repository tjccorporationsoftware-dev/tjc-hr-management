/**
 * ช่วงวันของ "งวดเงินเดือน" หนึ่งงวด
 *
 * รอบเงินเดือนของบริษัทไม่จำเป็นต้องตรงกับเดือนปฏิทิน — ค่าเริ่มต้นของระบบคือ
 * เริ่มวันที่ 26 ตัดวันที่ 25 ซึ่งแปลว่า "งวดสิงหาคม" กินตั้งแต่ 26 ก.ค. ถึง
 * 25 ส.ค. ตัวเลขใด ๆ ที่ผู้ใช้เอาไปเทียบกับสลิปเงินเดือนจึงต้องนับตามช่วงนี้
 * ไม่ใช่ 1–31 ของเดือนนั้น
 *
 * ไฟล์นี้เป็น **แหล่งความจริงเดียว** ของกติกาดังกล่าว ทั้งฝั่งคำนวณเงินเดือน
 * และฝั่งมือถือเรียกใช้ตัวเดียวกัน — เคยมีสำเนาอยู่ใน payroll.service.ts
 * ที่เดียว พอมือถือต้องใช้บ้างจึงย้ายออกมา ไม่ก๊อปไปไว้สองที่ให้เพี้ยนกันทีหลัง
 */

export type PayrollCutoffSettings = {
  payrollCutoffDay?: number | null;
  payrollPeriodStartDay?: number | null;
};

export type PayrollPeriodRange = {
  cutoffDay: number;
  endDate: Date;
  periodStartDay: number;
  startDate: Date;
};

/**
 * วันที่ตั้งค่าไว้ต้องอยู่ในช่วง 1–31 เสมอ ค่าที่ยังไม่ได้ตั้งให้ใช้ค่าเริ่มต้น
 *
 * ต้องเช็ค null แยกก่อนแปลงเป็นตัวเลข — `Number(null)` ได้ 0 ซึ่งเป็นตัวเลขที่
 * ใช้ได้ในสายตา Number.isFinite แล้วจะถูกหนีบเป็นวันที่ 1 แทนที่จะตกไปใช้
 * ค่าเริ่มต้นตามที่ชื่อพารามิเตอร์บอกไว้ (ตอนนี้คอลัมน์ใน DB เป็น NOT NULL
 * จึงยังไม่เคยเกิดจริง แต่ type เปิดช่องไว้และค่าเริ่มต้นคือเจตนาที่ถูก)
 */
export function normalizePayrollCutoffDay(
  value: number | null | undefined,
  fallback: number,
) {
  if (value === null || value === undefined) return fallback;

  const day = Number(value);

  if (!Number.isFinite(day)) return fallback;

  return Math.min(Math.max(Math.trunc(day), 1), 31);
}

/**
 * วันที่ในเดือนนั้นแบบไม่ล้น — ตั้งตัดวันที่ 31 แต่เดือนกุมภาพันธ์มีถึง 28/29
 * ถ้าไม่หนีบไว้ Date จะทดไปเป็นวันที่ 3 ของเดือนถัดไปเงียบ ๆ
 */
function createClampedPayrollDate(
  year: number,
  monthIndex: number,
  day: number,
) {
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()),
    ),
  );
}

/**
 * ช่วงวันของงวดตามปี/เดือนของงวด (ไม่ใช่เดือนปฏิทินของวันที่ในงวด)
 *
 * `month` คือเลขเดือนของงวด 1–12 เช่นงวด 08/2569 ให้ส่ง month = 8
 * แล้วจะได้ 26 ก.ค. – 25 ส.ค. เมื่อบริษัทตั้งเริ่ม 26 ตัด 25
 */
export function buildPayrollPeriodRange(
  year: number,
  month: number,
  settings: PayrollCutoffSettings,
): PayrollPeriodRange {
  const periodStartDay = normalizePayrollCutoffDay(
    settings.payrollPeriodStartDay,
    26,
  );
  const cutoffDay = normalizePayrollCutoffDay(settings.payrollCutoffDay, 25);

  const payrollMonthDate = new Date(year, month - 1, 1);
  const payrollYear = payrollMonthDate.getFullYear();
  const payrollMonth = payrollMonthDate.getMonth();

  /* เริ่มหลังวันตัด = งวดคาบเกี่ยวสองเดือน ต้องถอยเดือนเริ่มไปหนึ่งเดือน */
  const crossesMonth = periodStartDay > cutoffDay;
  const startMonth = payrollMonth - (crossesMonth ? 1 : 0);

  return {
    cutoffDay,
    endDate: createClampedPayrollDate(payrollYear, payrollMonth, cutoffDay),
    periodStartDay,
    startDate: createClampedPayrollDate(payrollYear, startMonth, periodStartDay),
  };
}

/**
 * งวดที่ "ครอบ" วันที่หนึ่ง ๆ
 *
 * ต้องมีตัวนี้แยกจาก buildPayrollPeriodRange เพราะเลขเดือนของงวดไม่เท่ากับ
 * เลขเดือนของวัน — บริษัทที่ตัดวันที่ 25 พอถึง 26 ส.ค. วันนั้นอยู่ในงวดกันยายน
 * แล้ว การเดาจากเดือนของวันตรง ๆ จะได้งวดที่ไม่มีวันนั้นอยู่ในช่วง
 */
export function findPayrollPeriodContaining(
  dateKey: string,
  settings: PayrollCutoffSettings,
): PayrollPeriodRange {
  const [year, month] = dateKey.split('-').map(Number);
  const candidate = buildPayrollPeriodRange(year!, month!, settings);

  /* เลยวันตัดของงวดเดือนนี้แล้ว = อยู่ในงวดของเดือนถัดไป */
  if (dateKey > toPayrollDateKey(candidate.endDate)) {
    return buildPayrollPeriodRange(
      month === 12 ? year! + 1 : year!,
      month === 12 ? 1 : month! + 1,
      settings,
    );
  }

  return candidate;
}

/** YYYY-MM-DD จาก Date — ใช้กับ query ที่รับวันแบบสตริง */
export function toPayrollDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
