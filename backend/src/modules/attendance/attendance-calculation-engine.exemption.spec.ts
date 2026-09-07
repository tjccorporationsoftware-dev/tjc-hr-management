import { AttendanceCalculationEngineService } from './attendance-calculation-engine.service';

/**
 * การยกเว้นการลงเวลารายพนักงาน + ใบลารายชั่วโมงหักกลบนาทีสาย
 *
 * ทั้งสามเรื่องพบตอนย้ายข้อมูลจริงของงวด ก.ค. 2026 เข้าระบบ แล้วเทียบกับ
 * รายงานของระบบเดิม ถ้าไม่แก้ ระบบจะหักเงินพนักงานเกินไปในงวดแรกทันที
 *
 *   1. ผู้บริหาร/เหมาจ่ายไม่ต้องลงเวลา  — 3 คนถูกตีเป็นขาดงานคนละ 26 วัน
 *   2. ยกเว้นการกดเข้างานบ่ายรายคน      — พนักงานจัดส่งถูกตีว่าลืมสแกนเกือบทั้งเดือน
 *   3. ใบลารายชั่วโมงหักกลบนาทีสาย      — สายเกินจริงรวม 257 นาที
 */
const engine = new AttendanceCalculationEngineService();

const bangkok = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

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

/** กะ 08:00–17:00 พักเที่ยง เข้าบ่าย 13:00 */
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

/** ปิดรอบไปแล้ว เพื่อให้เครื่องคำนวณตัดสินเรื่อง "ขาดรายการลงเวลา" ได้ */
const AS_OF = bangkok('2026-07-02', '09:00');
const WORK_DATE = new Date('2026-07-01T00:00:00.000Z');

function log(id: string, session: string, logType: string, time: string) {
  return { id, session, logType, logTime: bangkok('2026-07-01', time) };
}

function run(params: {
  logs: any[];
  leaveCoverage?: any;
  employeeExemption?: any;
}) {
  return engine.calculateDailySummaryDraft({
    workDate: WORK_DATE,
    policy: POLICY as never,
    sessionRules: RULES as never,
    logs: params.logs,
    leaveCoverage: (params.leaveCoverage ?? NO_LEAVE) as never,
    unpaidLeaveDeductionAmount: 0,
    asOf: AS_OF,
    employeeExemption: params.employeeExemption,
  } as never) as any;
}

describe('เครื่องคำนวณลงเวลา · การยกเว้นรายพนักงาน', () => {
  describe('พนักงานที่ไม่ต้องลงเวลาเลย (ผู้บริหาร / เหมาจ่าย)', () => {
    const exemption = { trackingRequired: false, exemptSessions: [] };

    /*
     * เคสจริง: 670099 · 690017 · 690020 เป็นเหมาจ่าย ไม่เคยสแกนสักครั้งในงวด
     * ก่อนแก้ ระบบตีเป็นขาดงานคนละ 26 วัน ถ้ารันเงินเดือนจะโดนหักทั้งเดือน
     */
    it('ไม่สแกนเลยทั้งวัน ต้องไม่ถูกตีเป็นขาดงาน', () => {
      const result = run({ logs: [], employeeExemption: exemption });

      expect(result.isAbsent).toBe(false);
      expect(result.absentDays).toBe(0);
      expect(result.hasMissingLog).toBe(false);
      expect(result.totalLateMinutes).toBe(0);
    });

    it('ต้องไม่มีค่าปรับใด ๆ', () => {
      const result = run({ logs: [], employeeExemption: exemption });

      expect(Number(result.latePenaltyAmount)).toBe(0);
      expect(Number(result.missingLogPenaltyAmount)).toBe(0);
      expect(Number(result.absentDeductionAmount)).toBe(0);
    });

    /*
     * service ส่ง forceAbsent มาเมื่อพบว่าไม่สแกนครบ 3 รอบ
     * เงื่อนไขนั้นใช้กับคนกลุ่มนี้ไม่ได้ ต้องถูกเมิน
     */
    it('ต้องเมิน forceAbsent ที่ service ส่งมา', () => {
      const result = engine.calculateDailySummaryDraft({
        workDate: WORK_DATE,
        policy: POLICY as never,
        sessionRules: RULES as never,
        logs: [],
        leaveCoverage: NO_LEAVE as never,
        unpaidLeaveDeductionAmount: 0,
        asOf: AS_OF,
        forceAbsent: true,
        employeeExemption: exemption,
      } as never) as any;

      expect(result.isAbsent).toBe(false);
    });

    it('มาสายก็ไม่คิดสาย เพราะไม่ได้ผูกกับเวลาตั้งแต่แรก', () => {
      const result = run({
        logs: [log('l1', 'MORNING', 'CHECK_IN', '09:30')],
        employeeExemption: exemption,
      });

      expect(result.totalLateMinutes).toBe(0);
    });

    it('คนที่ไม่ได้ยกเว้น ยังถูกตีเป็นขาดงานตามเดิม', () => {
      const result = run({ logs: [] });

      expect(result.isAbsent).toBe(true);
    });
  });

  describe('ยกเว้นการกดเข้างานบ่ายรายคน (พนักงานจัดส่ง)', () => {
    const exemption = {
      trackingRequired: true,
      exemptSessions: ['AFTERNOON_IN'],
    };

    /*
     * เคสจริง: 670030 · 670035 · 670073 สแกนแค่เข้ากับออก เพราะออกไปส่งของ
     * ตอนกลางวัน ก่อนแก้ ระบบขึ้น "ลืมสแกนเข้าบ่าย" เกือบทุกวันทำงาน
     */
    it('สแกนแค่เข้า-ออก ต้องไม่ขึ้นว่าลืมสแกน', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '07:15'),
          log('l2', 'EVENING', 'CHECK_OUT', '17:42'),
        ],
        employeeExemption: exemption,
      });

      expect(result.isAfternoonMissing).toBe(false);
      expect(result.hasMissingLog).toBe(false);
      expect(result.isAbsent).toBe(false);
    });

    it('ยังคิดสายรอบเช้าตามปกติ — ยกเว้นแค่รอบบ่าย', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '08:20'),
          log('l2', 'EVENING', 'CHECK_OUT', '17:00'),
        ],
        employeeExemption: exemption,
      });

      expect(result.morningLateMinutes).toBe(20);
      expect(result.afternoonLateMinutes).toBe(0);
    });

    it('คนที่ไม่ได้ยกเว้น ยังขึ้นว่าลืมสแกนเข้าบ่ายตามเดิม', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '07:15'),
          log('l2', 'EVENING', 'CHECK_OUT', '17:42'),
        ],
      });

      expect(result.isAfternoonMissing).toBe(true);
      expect(result.hasMissingLog).toBe(true);
    });
  });
});

describe('เครื่องคำนวณลงเวลา · ใบลารายชั่วโมงหักกลบนาทีสาย', () => {
  const hourlyLeave = (minutes: number) => ({
    ...NO_LEAVE,
    durationDays: minutes / 480,
    isUnpaid: true,
    unpaidLeaveMinutes: minutes,
    paidLeaveMinutes: 0,
  });

  const lateMorning = (time: string) => [
    log('l1', 'MORNING', 'CHECK_IN', time),
    log('l2', 'AFTERNOON', 'CHECK_IN', '12:55'),
    log('l3', 'EVENING', 'CHECK_OUT', '17:30'),
  ];

  /*
   * เคสจริง: 690001 วันที่ 11/07 มาสาย 12 นาที ยื่นใบลา 12 นาทีมาคลุมพอดี
   * ระบบเดิมลงสาย 0 แต่ระบบเราคิดเต็ม 12 นาทีเพราะดูแค่ธงคลุมทั้งรอบ
   */
  it('ใบลาคลุมพอดี สายต้องเป็น 0', () => {
    const result = run({
      logs: lateMorning('08:12'),
      leaveCoverage: hourlyLeave(12),
    });

    expect(result.morningLateMinutes).toBe(0);
    expect(result.totalLateMinutes).toBe(0);
    expect(Number(result.latePenaltyAmount)).toBe(0);
  });

  it('ใบลามากกว่าที่สาย สายต้องเป็น 0 ไม่ติดลบ', () => {
    const result = run({
      logs: lateMorning('08:10'),
      leaveCoverage: hourlyLeave(30),
    });

    expect(result.morningLateMinutes).toBe(0);
    expect(result.totalLateMinutes).toBe(0);
  });

  /* 670043 วันที่ 01/07 — สาย 61 นาที ใบลา 60 นาที เหลือ 1 นาที */
  it('ใบลาคลุมไม่หมด เหลือเท่าไรคิดเท่านั้น', () => {
    const result = run({
      logs: lateMorning('09:01'),
      leaveCoverage: hourlyLeave(60),
    });

    expect(result.morningLateMinutes).toBe(1);
    expect(result.totalLateMinutes).toBe(1);
    expect(Number(result.latePenaltyAmount)).toBe(5);
  });

  it('ไม่มีใบลา คิดสายเต็มตามเดิม', () => {
    const result = run({ logs: lateMorning('08:12') });

    expect(result.morningLateMinutes).toBe(12);
    expect(Number(result.latePenaltyAmount)).toBe(60);
  });

  /* ต้องตัดรอบเช้าก่อน แล้วเหลือค่อยไปตัดรอบบ่าย */
  it('เหลือจากรอบเช้า ไปหักรอบบ่ายต่อ', () => {
    const result = run({
      logs: [
        log('l1', 'MORNING', 'CHECK_IN', '08:10'),
        log('l2', 'AFTERNOON', 'CHECK_IN', '13:20'),
        log('l3', 'EVENING', 'CHECK_OUT', '17:30'),
      ],
      leaveCoverage: hourlyLeave(25),
    });

    expect(result.morningLateMinutes).toBe(0);
    expect(result.afternoonLateMinutes).toBe(5);
    expect(result.totalLateMinutes).toBe(5);
  });

  /* ต้องอธิบายที่มาของตัวเลขได้ ไม่งั้น HR ไล่ไม่ถูกว่าทำไมสายเป็น 0 */
  it('ต้องรายงานว่านาทีสายถูกใบลาหักกลบไปเท่าไร', () => {
    const result = run({
      logs: lateMorning('08:12'),
      leaveCoverage: hourlyLeave(12),
    });

    expect(result.lateMinutesOffsetByLeave).toBe(12);
  });

  it('ใบลาแบบมีค่าจ้างก็หักกลบได้เหมือนกัน', () => {
    const result = run({
      logs: lateMorning('08:15'),
      leaveCoverage: { ...NO_LEAVE, paidLeaveMinutes: 15, durationDays: 15 / 480 },
    });

    expect(result.morningLateMinutes).toBe(0);
  });

  /*
   * เคสจริงที่จับบั๊กได้: 670028 วันที่ 27/06 ลาครึ่งบ่าย 240 นาที
   * แล้วมาสายตอนเช้า 5 นาที
   *
   * รอบแรกที่เขียนหักกลบ เอา 240 นาทีของใบลาบ่ายไปล้างสายตอนเช้าทิ้ง
   * ทั้งที่คนละช่วงเวลากัน ระบบเดิมคิดสาย 5 นาทีถูกแล้ว
   */
  describe('ใบลาที่คลุมรอบเต็มแล้ว ต้องไม่หักข้ามรอบ', () => {
    const halfDayAfternoon = {
      ...NO_LEAVE,
      coversAfternoon: true,
      durationDays: 0.5,
      isUnpaid: true,
      unpaidLeaveMinutes: 240,
    };

    it('ลาครึ่งบ่าย ต้องไม่ล้างสายตอนเช้า', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '08:05'),
          log('l2', 'EVENING', 'CHECK_OUT', '12:00'),
        ],
        leaveCoverage: halfDayAfternoon,
      });

      expect(result.morningLateMinutes).toBe(5);
      expect(result.totalLateMinutes).toBe(5);
      expect(result.lateMinutesOffsetByLeave).toBe(0);
    });

    it('ลาครึ่งบ่าย ยังยกเว้นรอบบ่ายให้ตามเดิม', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '08:05'),
          log('l2', 'EVENING', 'CHECK_OUT', '12:00'),
        ],
        leaveCoverage: halfDayAfternoon,
      });

      expect(result.isAfternoonMissing).toBe(false);
      expect(result.afternoonLateMinutes).toBe(0);
    });

    it('ลาครึ่งเช้า มาสายรอบบ่าย ต้องยังคิดสายรอบบ่าย', () => {
      const result = run({
        logs: [
          log('l1', 'AFTERNOON', 'CHECK_IN', '13:10'),
          log('l2', 'EVENING', 'CHECK_OUT', '17:30'),
        ],
        leaveCoverage: {
          ...NO_LEAVE,
          coversMorning: true,
          durationDays: 0.5,
          isUnpaid: true,
          unpaidLeaveMinutes: 240,
        },
      });

      expect(result.afternoonLateMinutes).toBe(10);
      expect(result.lateMinutesOffsetByLeave).toBe(0);
    });
  });

  /*
   * ใบลารายชั่วโมงต้องหักกลบ "ออกก่อนเวลา" ด้วย ไม่ใช่แค่ "มาสาย"
   *
   * เคสจริง: 670073 ธนพล วันที่ 27/06 เข้า 07:30 ออก 15:01 ยื่นลาป่วย
   * ไม่รับค่าจ้าง 119 นาที ระบบหักค่าปรับออกก่อนเวลา 500 บาท บวกค่าลา
   * ไม่รับค่าจ้างอีก 123.96 บาท = โดนหักสองต่อจากนาทีชุดเดียวกัน
   *
   * ลำดับการหักกลบคือ สายเช้า -> สายบ่าย -> ออกก่อนเวลา เหลือเท่าไรค่อยไหลต่อ
   */
  describe('ใบลารายชั่วโมงหักกลบนาทีออกก่อนเวลา', () => {
    const hourlyLeave = (minutes: number) => ({
      ...NO_LEAVE,
      durationDays: minutes / 480,
      isUnpaid: true,
      unpaidLeaveMinutes: minutes,
    });

    it('ลา 119 นาที ออกก่อนเวลา 119 นาที ต้องไม่คิดค่าปรับออกก่อนเวลา', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '07:30'),
          log('l2', 'EVENING', 'CHECK_OUT', '15:01'),
        ],
        leaveCoverage: hourlyLeave(119),
      });

      expect(result.earlyCheckoutMinutes).toBe(0);
      expect(Number(result.earlyCheckoutPenaltyAmount)).toBe(0);
      expect(result.earlyCheckoutMinutesOffsetByLeave).toBe(119);
    });

    it('ออกก่อนเวลามากกว่าที่ลาไว้ ต้องคิดค่าปรับเฉพาะส่วนเกิน', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '08:00'),
          log('l2', 'AFTERNOON', 'CHECK_IN', '13:00'),
          log('l3', 'EVENING', 'CHECK_OUT', '15:00'),
        ],
        leaveCoverage: hourlyLeave(60),
      });

      expect(result.earlyCheckoutMinutes).toBe(60);
      expect(Number(result.earlyCheckoutPenaltyAmount)).toBe(300);
    });

    /* นาทีลาชุดเดียวกันใช้ล้างได้ครั้งเดียว ล้างสายไปแล้วห้ามเอามาล้างออกก่อนเวลาอีก */
    it('ลาถูกใช้ล้างสายไปหมดแล้ว ต้องไม่เหลือไปล้างออกก่อนเวลา', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '09:00'),
          log('l2', 'AFTERNOON', 'CHECK_IN', '13:00'),
          log('l3', 'EVENING', 'CHECK_OUT', '16:00'),
        ],
        leaveCoverage: hourlyLeave(60),
      });

      expect(result.morningLateMinutes).toBe(0);
      expect(result.lateMinutesOffsetByLeave).toBe(60);
      expect(result.earlyCheckoutMinutes).toBe(60);
      expect(result.earlyCheckoutMinutesOffsetByLeave).toBe(0);
    });

    it('ไม่มีใบลา ต้องคิดค่าปรับออกก่อนเวลาเต็มเหมือนเดิม', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '08:00'),
          log('l2', 'AFTERNOON', 'CHECK_IN', '13:00'),
          log('l3', 'EVENING', 'CHECK_OUT', '16:00'),
        ],
      });

      expect(result.earlyCheckoutMinutes).toBe(60);
      expect(result.earlyCheckoutMinutesOffsetByLeave).toBe(0);
    });

    /* ลาเต็มวัน/ครึ่งวันตั้งธง coversCheckout อยู่แล้ว ต้องไม่ไปยุ่งกับเส้นทางนั้น */
    it('ลาครึ่งบ่าย ยังยกเว้นการออกก่อนเวลาด้วยธงเดิม', () => {
      const result = run({
        logs: [
          log('l1', 'MORNING', 'CHECK_IN', '08:00'),
          log('l2', 'EVENING', 'CHECK_OUT', '12:00'),
        ],
        leaveCoverage: {
          ...NO_LEAVE,
          coversAfternoon: true,
          coversCheckout: true,
          durationDays: 0.5,
          isUnpaid: true,
          unpaidLeaveMinutes: 240,
        },
      });

      expect(result.earlyCheckoutMinutes).toBe(0);
      expect(Number(result.earlyCheckoutPenaltyAmount)).toBe(0);
    });
  });
});
