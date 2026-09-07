import { AttendanceCalculationEngineService } from './attendance-calculation-engine.service';

/**
 * เทสต์กะข้ามคืนผ่านเครื่องคำนวณจริง
 *
 * ประเด็นที่กันไว้: เดิมทั้งระบบเทียบเวลาเป็น "นาทีในวัน" (0-1439)
 * กะ 22:00-02:00 การตอกออกงานตอนตีสองจึงถูกอ่านเป็น 120 นาที เทียบกับ
 * เวลาเลิกงาน 02:00 ที่อ่านได้ 120 เหมือนกัน แต่เทียบกับเวลาเข้างาน 22:00 = 1320
 * ผลคือถูกคิดว่า "กลับก่อนเวลา ~20 ชั่วโมง" แล้วหักเงินทุกวัน
 */
const engine = new AttendanceCalculationEngineService();

/** เวลาไทย → Date (UTC+7) */
function bangkok(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`);
}

const NIGHT_POLICY = {
  id: 'policy-night',
  code: 'NIGHT',
  name: 'กะกลางคืน',
  timezone: 'Asia/Bangkok',
  lateGraceMinutes: 0,
  lateRoundingMinutes: 0,
  latePenaltyRatePerMinute: 5,
  missingLogPenaltyPerDay: 50,
  missingPenaltyMode: 'PER_SESSION',
};

/** กะกลางคืน เข้า 22:00 ออก 02:00 ของวันถัดไป */
const NIGHT_RULES = [
  {
    id: 'r1',
    sessionCode: 'MORNING_IN',
    label: 'เข้างาน',
    punchType: 'CHECK_IN',
    openTime: '21:00',
    expectedTime: '22:00',
    closeTime: '23:59',
    lateAfterTime: '22:00',
    requirePunch: true,
    sortOrder: 1,
  },
  {
    id: 'r2',
    sessionCode: 'CHECK_OUT',
    label: 'ออกงาน',
    punchType: 'CHECK_OUT',
    openTime: '01:00',
    expectedTime: '02:00',
    closeTime: '04:00',
    earlyBeforeTime: '02:00',
    lateOutAfterTime: '02:00',
    earlyLeavePenaltyPerMinute: 5,
    collectLateOutMinutes: true,
    requirePunch: true,
    sortOrder: 2,
  },
];

const emptyLeaveCoverage = {
  coversMorning: false,
  coversAfternoon: false,
  coversCheckout: false,
  durationDays: 0,
  isUnpaid: false,
  coverageReason: null,
};

function runNightShift(logs: any[], asOf: Date) {
  return engine.calculateDailySummaryDraft({
    workDate: new Date(Date.UTC(2026, 7, 10)),
    policy: NIGHT_POLICY,
    sessionRules: NIGHT_RULES as any,
    logs,
    leaveCoverage: emptyLeaveCoverage,
    unpaidLeaveDeductionAmount: 0,
    asOf,
  });
}

describe('กะกลางคืน 22:00-02:00', () => {
  it('เข้าตรงเวลา ออกตรงเวลา ต้องไม่สาย ไม่ออกก่อน และไม่ถูกหักเงิน', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '22:00') },
        { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-11', '02:00') },
      ],
      bangkok('2026-08-11', '06:00'),
    );

    expect(result.totalLateMinutes).toBe(0);
    expect(result.earlyCheckoutMinutes).toBe(0);
    expect(result.lateCheckoutMinutes).toBe(0);
    expect(result.earlyCheckoutPenaltyAmount).toBe(0);
    expect(result.latePenaltyAmount).toBe(0);
  });

  it('ออกงานตีสองตรงเวลา ต้องไม่ถูกคิดว่ากลับก่อนเวลา 20 ชั่วโมง', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '22:00') },
        { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-11', '02:00') },
      ],
      bangkok('2026-08-11', '06:00'),
    );

    // ของเดิมได้ 1200 นาที (20 ชั่วโมง) แล้วหักเงิน 6,000 บาท
    expect(result.earlyCheckoutMinutes).toBeLessThan(60);
  });

  it('ออกก่อนเวลาจริง 30 นาที (01:30) นับได้ถูกต้อง', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '22:00') },
        { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-11', '01:30') },
      ],
      bangkok('2026-08-11', '06:00'),
    );

    expect(result.earlyCheckoutMinutes).toBe(30);
  });

  it('อยู่เกินเวลาถึงตีสามครึ่ง นับเป็นอยู่ต่อ 90 นาที ไม่ใช่ออกก่อนเวลา', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '22:00') },
        { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-11', '03:30') },
      ],
      bangkok('2026-08-11', '06:00'),
    );

    expect(result.lateCheckoutMinutes).toBe(90);
    expect(result.earlyCheckoutMinutes).toBe(0);
  });

  it('เข้างานสาย 15 นาที นับเป็น 15 นาที ไม่ใช่ทั้งวัน', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '22:15') },
        { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-11', '02:00') },
      ],
      bangkok('2026-08-11', '06:00'),
    );

    expect(result.totalLateMinutes).toBe(15);
  });

  it('เข้างานก่อนเวลา 21:30 ไม่ถือว่าสาย', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '21:30') },
        { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-11', '02:00') },
      ],
      bangkok('2026-08-11', '06:00'),
    );

    expect(result.totalLateMinutes).toBe(0);
  });

  it('ข้ามเที่ยงคืนแล้วแต่ยังไม่ถึงเวลาปิดรอบออกงาน ยังไม่นับว่าขาดรายการ', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '22:00') },
      ],
      // ตีหนึ่งครึ่งของวันถัดไป — รอบออกงานปิด 04:00 จึงยังไม่ควรฟ้อง
      bangkok('2026-08-11', '01:30'),
    );

    expect(result.isCheckoutMissing).toBe(false);
  });

  it('เลยเวลาปิดรอบออกงานแล้วยังไม่ตอกออก จึงนับว่าขาดรายการ', () => {
    const result = runNightShift(
      [
        { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '22:00') },
      ],
      bangkok('2026-08-11', '09:00'),
    );

    expect(result.isCheckoutMissing).toBe(true);
  });
});

describe('กะปกติ 08:00-17:00 ต้องไม่เปลี่ยนพฤติกรรมเดิม', () => {
  const DAY_RULES = [
    {
      id: 'd1', sessionCode: 'MORNING_IN', label: 'เข้าเช้า', punchType: 'CHECK_IN',
      openTime: '06:00', expectedTime: '08:00', closeTime: '11:59',
      lateAfterTime: '08:00', requirePunch: true, sortOrder: 1,
    },
    {
      id: 'd2', sessionCode: 'CHECK_OUT', label: 'ออกงาน', punchType: 'CHECK_OUT',
      openTime: '16:00', expectedTime: '17:00', closeTime: '23:59',
      earlyBeforeTime: '17:00', lateOutAfterTime: '17:00',
      earlyLeavePenaltyPerMinute: 5, collectLateOutMinutes: true,
      requirePunch: true, sortOrder: 2,
    },
  ];

  function runDayShift(logs: any[]) {
    return engine.calculateDailySummaryDraft({
      workDate: new Date(Date.UTC(2026, 7, 10)),
      policy: { ...NIGHT_POLICY, code: 'DAY', name: 'กะปกติ' },
      sessionRules: DAY_RULES as any,
      logs,
      leaveCoverage: emptyLeaveCoverage,
      unpaidLeaveDeductionAmount: 0,
      asOf: bangkok('2026-08-11', '09:00'),
    });
  }

  it('เข้าสาย 20 นาที ออกก่อน 10 นาที นับได้เท่าเดิม', () => {
    const result = runDayShift([
      { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '08:20') },
      { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-10', '16:50') },
    ]);

    expect(result.totalLateMinutes).toBe(20);
    expect(result.earlyCheckoutMinutes).toBe(10);
  });

  it('ตรงเวลาทั้งเข้าและออก ไม่มีค่าปรับ', () => {
    const result = runDayShift([
      { id: 'l1', logType: 'CHECK_IN', session: 'MORNING', logTime: bangkok('2026-08-10', '08:00') },
      { id: 'l2', logType: 'CHECK_OUT', session: 'EVENING', logTime: bangkok('2026-08-10', '17:00') },
    ]);

    expect(result.totalLateMinutes).toBe(0);
    expect(result.earlyCheckoutMinutes).toBe(0);
    expect(result.latePenaltyAmount).toBe(0);
  });
});
