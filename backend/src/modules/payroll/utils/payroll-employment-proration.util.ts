/**
 * คิดสัดส่วนเงินเดือนของคนที่เป็นพนักงานไม่เต็มงวด
 * ==============================================
 * เดิม payroll จ่ายเงินเดือนเต็มเดือนให้ทุกคนที่อยู่ในงวด ไม่ว่าจะเข้ามาวันไหน
 * และคนที่ออกกลางงวดก็หลุดจากงวดไปทั้งคน (ได้ 0 บาท) เพราะคัดคนจากสถานะปัจจุบัน
 *
 * ตัวนี้เปลี่ยนมาคิดจาก "ช่วงที่เป็นพนักงานทับกับงวดกี่วัน" แทน
 */

export type EmploymentProration = {
  /** ตัวคูณเงินเดือน/เงินประจำตำแหน่ง 0–1 */
  factor: number;
  /** จำนวนวันที่เป็นพนักงานจริงในงวดนี้ */
  employedDays: number;
  /** จำนวนวันทั้งหมดของงวด */
  periodDays: number;
  divisorDays: number;
  /** เป็นพนักงานไม่เต็มงวด */
  isPartial: boolean;
  /** งวดนี้เป็นงวดสุดท้ายของคนนี้ (พ้นสภาพภายในงวด) */
  isFinalPeriod: boolean;
  from: Date;
  to: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** จำนวนวันตามปฏิทินแบบนับหัวนับท้าย */
export function countInclusiveDays(from: Date, to: Date) {
  const start = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());

  if (end < start) return 0;

  return Math.round((end - start) / MS_PER_DAY) + 1;
}

export function resolveEmploymentProration(params: {
  employee: {
    startDate?: Date | string | null;
    employmentEndDate?: Date | string | null;
  } | null;
  periodStartDate: Date;
  periodEndDate: Date;
  /** ตัวหารวันของบริษัท ปกติ 30 — ต้องเป็นตัวเดียวกับที่ใช้หักขาดงาน */
  divisorDays: number;
}): EmploymentProration {
  const periodDays = countInclusiveDays(
    params.periodStartDate,
    params.periodEndDate,
  );

  const hireDate = toDate(params.employee?.startDate);
  const leaveDate = toDate(params.employee?.employmentEndDate);

  const from =
    hireDate && hireDate.getTime() > params.periodStartDate.getTime()
      ? hireDate
      : params.periodStartDate;
  const to =
    leaveDate && leaveDate.getTime() < params.periodEndDate.getTime()
      ? leaveDate
      : params.periodEndDate;

  const employedDays = Math.max(0, countInclusiveDays(from, to));
  const isPartial = employedDays < periodDays;

  const isFinalPeriod = Boolean(
    leaveDate && leaveDate.getTime() <= params.periodEndDate.getTime(),
  );

  const divisor = params.divisorDays > 0 ? params.divisorDays : 30;

  if (!isPartial) {
    return {
      factor: 1,
      employedDays: periodDays,
      periodDays,
      divisorDays: divisor,
      isPartial: false,
      isFinalPeriod,
      from: params.periodStartDate,
      to: params.periodEndDate,
    };
  }

  return {
    /*
     * ตัดที่ 1 เสมอ — งวดที่มี 31 วันจะได้ 31/30 ซึ่งแปลว่าจ่ายเกินเงินเดือน
     * ให้คนที่ทำงานเต็มงวด
     */
    factor: Math.min(1, employedDays / divisor),
    employedDays,
    periodDays,
    divisorDays: divisor,
    isPartial: true,
    isFinalPeriod,
    from,
    to,
  };
}

function toDate(value?: Date | string | null) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}
