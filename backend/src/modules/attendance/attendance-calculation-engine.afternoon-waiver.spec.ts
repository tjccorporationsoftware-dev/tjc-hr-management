import { AttendanceCalculationEngineService } from './attendance-calculation-engine.service';

/**
 * ยกเว้นค่าปรับช่วงบ่ายเป็นรายวัน
 *
 * ใช้ตอน HR ตัดสินว่าวันนั้น (หรือทั้งงวด) ไม่คิดค่าปรับช่วงบ่าย เช่น คนที่ถูก
 * สั่งออกไปทำงานนอกบริษัทตอนบ่ายจนกลับมาสแกนไม่ทัน
 *
 * ต่างจากการยกเว้นรอบลงเวลารายคน ตรงที่ยังนับนาทีสายและสถานะขาดสแกนตามจริง
 * ตัดแค่ยอดเงิน รายงานจึงยังบอกได้ว่าวันนั้นเกิดอะไรขึ้น
 */
const engine = new AttendanceCalculationEngineService();

const bangkok = (date: string, time: string) =>
  new Date(`${date}T${time}:00+07:00`);

const POLICY = {
  id: 'policy-day',
  code: 'DAY',
  name: 'กะปกติ',
  timezone: 'Asia/Bangkok',
  lateGraceMinutes: 0,
  lateRoundingMinutes: 0,
  latePenaltyRatePerMinute: 5,
  missingLogPenaltyPerDay: 50,
  missingPenaltyMode: 'PER_SESSION',
};

const RULES = [
  {
    id: 'r-morning',
    sessionCode: 'MORNING_IN',
    label: 'เข้างานเช้า',
    punchType: 'CHECK_IN',
    openTime: '06:00',
    expectedTime: '08:00',
    closeTime: '11:59',
    lateAfterTime: '08:00',
    latePenaltyPerMinute: 5,
    missingPenaltyAmount: 50,
    requirePunch: true,
    sortOrder: 1,
  },
  {
    id: 'r-afternoon',
    sessionCode: 'AFTERNOON_IN',
    label: 'เข้างานบ่าย',
    punchType: 'CHECK_IN',
    openTime: '12:00',
    expectedTime: '13:00',
    closeTime: '15:00',
    lateAfterTime: '13:00',
    latePenaltyPerMinute: 5,
    missingPenaltyAmount: 50,
    requirePunch: true,
    sortOrder: 2,
  },
  {
    id: 'r-checkout',
    sessionCode: 'CHECK_OUT',
    label: 'ออกงาน',
    punchType: 'CHECK_OUT',
    openTime: '15:00',
    expectedTime: '17:00',
    closeTime: '23:59',
    requirePunch: true,
    sortOrder: 3,
  },
];

const NO_LEAVE = {
  coversMorning: false,
  coversAfternoon: false,
  coversCheckout: false,
  durationDays: 0,
  isUnpaid: false,
  coverageReason: null,
};

const AS_OF = bangkok('2026-07-02', '09:00');
const WORK_DATE = new Date('2026-07-01T00:00:00.000Z');

function log(id: string, session: string, logType: string, time: string) {
  return { id, session, logType, logTime: bangkok('2026-07-01', time) };
}

function run(params: {
  logs: any[];
  waiveAfternoonPenalty?: boolean;
  policy?: any;
}) {
  return engine.calculateDailySummaryDraft({
    workDate: WORK_DATE,
    policy: (params.policy ?? POLICY) as never,
    sessionRules: RULES as never,
    logs: params.logs,
    leaveCoverage: NO_LEAVE as never,
    unpaidLeaveDeductionAmount: 0,
    asOf: AS_OF,
    waiveAfternoonPenalty: params.waiveAfternoonPenalty,
  } as never) as any;
}

/** เข้าเช้าสาย 10 นาที เข้าบ่ายสาย 20 นาที ออกงานปกติ */
const LATE_BOTH_SESSIONS = [
  log('l1', 'MORNING', 'CHECK_IN', '08:10'),
  log('l2', 'AFTERNOON', 'CHECK_IN', '13:20'),
  log('l3', 'EVENING', 'CHECK_OUT', '17:00'),
];

/** เข้าเช้าตรงเวลา ไม่ได้สแกนเข้าบ่าย ออกงานปกติ */
const MISSING_AFTERNOON = [
  log('l1', 'MORNING', 'CHECK_IN', '08:00'),
  log('l3', 'EVENING', 'CHECK_OUT', '17:00'),
];

describe('เครื่องคำนวณลงเวลา · ยกเว้นค่าปรับช่วงบ่าย', () => {
  it('ปกติแล้วสายเช้าและสายบ่ายถูกหักรวมกัน', () => {
    const result = run({ logs: LATE_BOTH_SESSIONS });

    expect(result.morningLateMinutes).toBe(10);
    expect(result.afternoonLateMinutes).toBe(20);
    expect(Number(result.latePenaltyAmount)).toBe(150);
  });

  it('ยกเว้นแล้วเหลือแต่ค่าปรับสายเช้า', () => {
    const result = run({
      logs: LATE_BOTH_SESSIONS,
      waiveAfternoonPenalty: true,
    });

    expect(Number(result.latePenaltyAmount)).toBe(50);
    expect(Number(result.afternoonPenaltyWaivedAmount)).toBe(100);
  });

  it('ยังนับนาทีสายบ่ายตามจริง เพื่อให้รายงานอธิบายวันนั้นได้', () => {
    const result = run({
      logs: LATE_BOTH_SESSIONS,
      waiveAfternoonPenalty: true,
    });

    expect(result.afternoonLateMinutes).toBe(20);
    expect(result.totalLateMinutes).toBe(30);
  });

  it('ยกเว้นแล้วไม่หักค่าลืมสแกนเข้าบ่าย แต่ยังขึ้นสถานะว่าขาดรอบบ่าย', () => {
    const result = run({
      logs: MISSING_AFTERNOON,
      waiveAfternoonPenalty: true,
    });

    expect(result.isAfternoonMissing).toBe(true);
    expect(result.hasMissingLog).toBe(true);
    expect(Number(result.missingAfternoonPenaltyAmount)).toBe(0);
    expect(Number(result.missingLogPenaltyAmount)).toBe(0);
    expect(Number(result.afternoonPenaltyWaivedAmount)).toBe(50);
  });

  it('ไม่ยกเว้นก็ยังหักค่าลืมสแกนเข้าบ่ายตามเดิม', () => {
    const result = run({ logs: MISSING_AFTERNOON });

    expect(Number(result.missingLogPenaltyAmount)).toBe(50);
    expect(Number(result.afternoonPenaltyWaivedAmount)).toBe(0);
  });

  /*
   * บริษัทที่คิดค่าปรับลืมสแกนเป็นก้อนรายวัน ถ้าขาดแค่รอบบ่ายแล้วยกเว้นไว้
   * ต้องไม่เหลือค่าปรับก้อนนั้น ไม่งั้นการยกเว้นจะไม่มีผลอะไรเลย
   */
  it('โหมดคิดค่าปรับรายวัน ขาดแค่รอบบ่ายแล้วยกเว้น ต้องไม่เหลือค่าปรับ', () => {
    const perDayPolicy = { ...POLICY, missingPenaltyMode: 'PER_DAY' };

    expect(
      Number(run({ logs: MISSING_AFTERNOON, policy: perDayPolicy }).missingLogPenaltyAmount),
    ).toBe(50);

    expect(
      Number(
        run({
          logs: MISSING_AFTERNOON,
          policy: perDayPolicy,
          waiveAfternoonPenalty: true,
        }).missingLogPenaltyAmount,
      ),
    ).toBe(0);
  });

  /*
   * เพดานค่าปรับรายวันคือเหตุผลที่ต้องตัดตั้งแต่ในเครื่องคำนวณ
   * สายเช้า 10 นาที = 50 บาท สายบ่าย 20 นาที = 100 บาท เพดาน 120
   * ยอดที่เห็นก่อนยกเว้นคือ 120 (ถูกเพดานตัด) ถ้าไปลบ 100 ทีหลังจะเหลือ 20
   * ทั้งที่คำตอบที่ถูกคือ 50 ตามค่าปรับสายเช้าจริง
   */
  it('เพดานค่าปรับรายวัน ต้องคิดจากยอดหลังยกเว้นแล้ว', () => {
    const cappedPolicy = { ...POLICY, maxLatePenaltyPerDay: 120 };

    expect(
      Number(run({ logs: LATE_BOTH_SESSIONS, policy: cappedPolicy }).latePenaltyAmount),
    ).toBe(120);

    expect(
      Number(
        run({
          logs: LATE_BOTH_SESSIONS,
          policy: cappedPolicy,
          waiveAfternoonPenalty: true,
        }).latePenaltyAmount,
      ),
    ).toBe(50);
  });
});
