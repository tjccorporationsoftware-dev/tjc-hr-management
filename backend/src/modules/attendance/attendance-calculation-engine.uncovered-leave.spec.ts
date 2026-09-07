import { AttendanceCalculationEngineService } from './attendance-calculation-engine.service';

/**
 * นาทีที่ "ใบลาหมดแล้วแต่ยังไม่กลับเข้างาน" ต้องคิดเป็นสายเหมือนกรณีอื่น
 *
 * เจอตอนเทียบงวด ก.ค. 2026 กับรายงานของระบบเดิม — 670043 สุธัญญา
 * ลารายชั่วโมง 3 วันแล้วกลับเข้างานช้ากว่าเวลาที่ลาไว้ 1, 4 และ 2 นาที
 * นาทีพวกนั้นไม่เป็นทั้งสาย ทั้งลา ทั้งขาดงาน — ได้ค่าจ้างเต็มทั้งที่ไม่ได้อยู่ทำงาน
 *
 * สาเหตุ: ใบลาที่คลุมเวลาเช็คอินจะปลดรอบนั้นทั้งรอบ ต่างจากใบลาที่ไม่คลุม
 * ซึ่งระบบหักกลบแล้วคิดส่วนเกินเป็นสายอยู่แล้ว (ดูเทส "ใบลาคลุมไม่หมด
 * เหลือเท่าไรคิดเท่านั้น" ใน attendance-calculation-engine.exemption.spec.ts)
 * ผลคือใบลาสั้น ๆ ที่คลุมเวลาเช็คอินกลายเป็นวิธีเลี่ยงค่าปรับมาสาย
 *
 * จำนวนนาทีคิดที่ attendance.service (ต้องใช้ช่วงเวลาทำงานจริงมาตัด)
 * ไฟล์นี้กันฝั่งเครื่องคำนวณ ว่ารับนาทีมาแล้วต้องคิดค่าปรับด้วยอัตราเดียวกับการมาสาย
 */
const engine = new AttendanceCalculationEngineService();

const bangkok = (time: string) => new Date(`2026-07-01T${time}:00+07:00`);

const POLICY = {
  id: 'policy-day',
  code: 'DAY',
  name: 'กะปกติ',
  timezone: 'Asia/Bangkok',
  lateGraceMinutes: 0,
  lateRoundingMinutes: 0,
  latePenaltyRatePerMinute: 5,
  missingLogPenaltyPerDay: 0,
  missingPenaltyMode: 'PER_SESSION',
};

const RULES = [
  {
    id: 'r-morning',
    sessionCode: 'MORNING_IN',
    punchType: 'CHECK_IN',
    openTime: '06:00',
    expectedTime: '08:00',
    closeTime: '11:59',
    lateAfterTime: '08:00',
    latePenaltyPerMinute: 5,
    requirePunch: true,
    sortOrder: 1,
  },
  {
    id: 'r-afternoon',
    sessionCode: 'AFTERNOON_IN',
    punchType: 'CHECK_IN',
    openTime: '12:00',
    expectedTime: '13:00',
    closeTime: '15:00',
    lateAfterTime: '13:00',
    latePenaltyPerMinute: 5,
    requirePunch: true,
    sortOrder: 2,
  },
  {
    id: 'r-checkout',
    sessionCode: 'CHECK_OUT',
    punchType: 'CHECK_OUT',
    openTime: '15:00',
    expectedTime: '17:00',
    closeTime: '23:59',
    requirePunch: true,
    sortOrder: 3,
  },
];

const WORK_DATE = new Date('2026-07-01T00:00:00.000Z');
const AS_OF = new Date('2026-07-02T09:00:00+07:00');

/** ใบลารายชั่วโมง 08:00-08:30 คลุมเวลาเช็คอินเช้า จึงปลดรอบเช้าทั้งรอบ */
const HOURLY_LEAVE_COVERING_MORNING = {
  coversMorning: true,
  coversAfternoon: false,
  coversCheckout: false,
  durationDays: 0.06,
  isUnpaid: true,
  paidLeaveMinutes: 0,
  unpaidLeaveMinutes: 30,
  endMinutes: 8 * 60 + 30,
  coverageReason: 'SICK_UNPAID:HOURLY_08:00_08:30',
};

function run(params: {
  logs: any[];
  uncoveredAfterLeaveMinutes?: { morning?: number; afternoon?: number };
}) {
  return engine.calculateDailySummaryDraft({
    workDate: WORK_DATE,
    policy: POLICY as never,
    sessionRules: RULES as never,
    logs: params.logs,
    leaveCoverage: HOURLY_LEAVE_COVERING_MORNING as never,
    unpaidLeaveDeductionAmount: 42.71,
    uncoveredAfterLeaveMinutes: params.uncoveredAfterLeaveMinutes,
    asOf: AS_OF,
  } as never) as any;
}

/** เข้างาน 08:34 = ช้ากว่าใบลาที่หมด 08:30 อยู่ 4 นาที */
const LOGS_BACK_LATE = [
  { id: 'l1', session: 'MORNING', logType: 'CHECK_IN', logTime: bangkok('08:34') },
  { id: 'l2', session: 'AFTERNOON', logType: 'CHECK_IN', logTime: bangkok('12:52') },
  { id: 'l3', session: 'EVENING', logType: 'CHECK_OUT', logTime: bangkok('17:40') },
];

describe('เครื่องคำนวณลงเวลา · นาทีที่ใบลาไม่คลุม', () => {
  /*
   * ก่อนแก้ นาทีส่วนเกินหายไปทั้งหมด — รอบที่ใบลาคลุมจะไม่ถูกคิดสายเลย
   * ไม่ว่าจะกลับเข้ามาช้ากว่าที่ลาไว้แค่ไหน
   */
  it('กลับเข้างานช้ากว่าใบลา ต้องนับเป็นนาทีสายของรอบนั้น', () => {
    const result = run({
      logs: LOGS_BACK_LATE,
      uncoveredAfterLeaveMinutes: { morning: 4 },
    });

    expect(result.morningLateMinutes).toBe(4);
    expect(result.totalLateMinutes).toBe(4);
  });

  it('คิดค่าปรับด้วยอัตราเดียวกับการมาสายปกติ', () => {
    const result = run({
      logs: LOGS_BACK_LATE,
      uncoveredAfterLeaveMinutes: { morning: 4 },
    });

    expect(Number(result.latePenaltyAmount)).toBe(20);
  });

  it('ต้องไม่ไปลงช่องขาดงาน และไม่ถูกนับเป็นวันขาดงาน', () => {
    const result = run({
      logs: LOGS_BACK_LATE,
      uncoveredAfterLeaveMinutes: { morning: 4 },
    });

    expect(result.isAbsent).toBe(false);
    expect(result.absentDays).toBe(0);
    expect(Number(result.absentDeductionAmount)).toBe(0);
  });

  it('กลับเข้างานทันเวลาที่ลาไว้ ต้องไม่มีสายและไม่มีค่าปรับ', () => {
    const onTime = [
      { id: 'l1', session: 'MORNING', logType: 'CHECK_IN', logTime: bangkok('08:29') },
      { id: 'l2', session: 'AFTERNOON', logType: 'CHECK_IN', logTime: bangkok('12:52') },
      { id: 'l3', session: 'EVENING', logType: 'CHECK_OUT', logTime: bangkok('17:40') },
    ];

    const result = run({ logs: onTime, uncoveredAfterLeaveMinutes: { morning: 0 } });

    expect(result.totalLateMinutes).toBe(0);
    expect(Number(result.latePenaltyAmount)).toBe(0);
  });

  it('ไม่ส่งนาทีส่วนเกินมา ต้องได้ผลเท่าเดิมทุกอย่าง', () => {
    const result = run({ logs: LOGS_BACK_LATE });

    expect(result.totalLateMinutes).toBe(0);
    expect(Number(result.latePenaltyAmount)).toBe(0);
    expect(Number(result.unpaidLeaveDeductionAmount)).toBe(42.71);
  });

  /* ใบลาบ่ายก็ต้องใช้อัตราของรอบบ่าย ไม่ใช่เอาไปรวมกับรอบเช้า */
  it('นาทีส่วนเกินของรอบบ่าย ลงที่สายรอบบ่าย', () => {
    const result = run({
      logs: LOGS_BACK_LATE,
      uncoveredAfterLeaveMinutes: { afternoon: 3 },
    });

    expect(result.afternoonLateMinutes).toBe(3);
    expect(result.totalLateMinutes).toBe(3);
    expect(Number(result.latePenaltyAmount)).toBe(15);
  });
});
