import { Injectable } from '@nestjs/common';

import { AttendanceLogType } from '../../generated/prisma/client';
import {
  DEFAULT_LATE_REVIEW_THRESHOLD_MINUTES,
  resolveAttendanceReviewState,
} from './attendance-review-reason.helper';
import {
  MINUTES_PER_DAY,
  resolveShiftWindow,
  timeStringToShiftMinutes,
  toPunchShiftMinutes,
  type ShiftWindow,
} from './utils/shift-window.util';

const DEFAULT_EARLY_CHECKOUT_PENALTY_PER_MINUTE = 5;
const LATE_REVIEW_THRESHOLD_MINUTES = DEFAULT_LATE_REVIEW_THRESHOLD_MINUTES;

type LeaveCoverage = {
  coversMorning: boolean;
  coversAfternoon: boolean;
  coversCheckout: boolean;
  durationDays: number;
  isUnpaid: boolean;
  paidLeaveMinutes?: number;
  unpaidLeaveMinutes?: number;
  unpaidDurationDays?: number;
  coveredSessions?: Array<'MORNING' | 'AFTERNOON' | 'CHECKOUT'>;
  leaveRequestIds?: string[];
  leaveTypeIds?: string[];
  coverageReason: string | null;
};


type OffsiteCoverage = {
  coversMorning: boolean;
  coversAfternoon: boolean;
  coversCheckout: boolean;
  minutes: number;
  status: string | null;
  needsReview: boolean;
  requestIds: string[];
  coveredSessions?: Array<'MORNING' | 'AFTERNOON' | 'CHECKOUT'>;
  coverageReason?: string | null;
};

type DailyDeductionCap = {
  amount: number;
  baseSalary: number;
  salaryDivisorDays: number;
  dailyRate: number;
  calculationMethod: 'BASE_SALARY_CONFIGURED_DAYS';
  missingCompensation: boolean;
};

type DeductionComponents = {
  latePenaltyAmount: number;
  missingLogPenaltyAmount: number;
  missingMorningPenaltyAmount: number;
  missingAfternoonPenaltyAmount: number;
  missingCheckoutPenaltyAmount: number;
  earlyCheckoutPenaltyAmount: number;
  absentDeductionAmount: number;
  unpaidLeaveDeductionAmount: number;
};

type DailyDeductionCapResult = {
  components: DeductionComponents;
  rawTotalDeductionAmount: number;
  totalDeductionAmount: number;
  rawLateAndEarlyPenaltyAmount: number;
  cappedLateAndEarlyPenaltyAmount: number;
  outsideCapDeductionAmount: number;
  capApplied: boolean;
  dailyDeductionCapAmount: number;
  cappedReductionAmount: number;
};

type AttendanceRuleLike = {
  id?: string;
  sessionCode?: string;
  label?: string;
  punchType?: string;
  openTime?: string;
  expectedTime?: string;
  closeTime?: string;
  lateAfterTime?: string | null;
  lateUntilTime?: string | null;
  earlyBeforeTime?: string | null;
  lateOutAfterTime?: string | null;
  requirePunch?: boolean;
  lateGraceMinutes?: number | null;
  latePenaltyPerMinute?: unknown;
  missingPenaltyAmount?: unknown;
  earlyLeavePenaltyPerMinute?: unknown;
  collectLateOutMinutes?: boolean;
  sortOrder?: number | null;
};

type AttendancePolicyLike = {
  id?: string;
  code?: string | null;
  name?: string | null;
  timezone?: string | null;
  lateGraceMinutes?: number | null;
  lateRoundingMinutes?: number | null;
  maxLatePenaltyPerDay?: unknown;
  maxMissingPenaltyPerDay?: unknown;
  missingPenaltyMode?: string | null;
  morningCheckInDeadline?: string | null;
  afternoonCheckInDeadline?: string | null;
  checkoutAllowedFrom?: string | null;
  latePenaltyRatePerMinute?: unknown;
  missingLogPenaltyPerDay?: unknown;
};

type CalculateDailySummaryInput = {
  workDate: Date;
  policy: AttendancePolicyLike;
  sessionRules: AttendanceRuleLike[];
  logs: any[];
  leave?: any;
  leaveCoverage: LeaveCoverage;
  offsiteCoverage?: OffsiteCoverage;
  unpaidLeaveDeductionAmount: number;
  absentDeductionAmount?: number;
  /**
   * นาทีที่ "ใบลาหมดแล้วแต่ยังไม่กลับเข้างาน" แยกตามรอบ
   *
   * ใบลารายชั่วโมงที่คลุมเวลาเช็คอินของรอบไหน จะปลดรอบนั้นทั้งรอบ ไม่คิดสายอีกเลย
   * ถูกแล้วสำหรับช่วงที่ลาไว้ แต่ถ้ากลับเข้ามาช้ากว่าเวลาสิ้นสุดใบลา นาทีส่วนเกิน
   * เดิมหายไปจากทุกยอด ไม่เป็นทั้งสาย ทั้งลา ทั้งขาดงาน
   *
   * service เป็นคนคิดจำนวนนาที เพราะต้องตัดเฉพาะช่วงที่เป็นเวลาทำงานจริง
   * (ลา 08:00-12:00 แล้วเข้าบ่าย 13:00 ต้องได้ 0 ไม่ใช่ 60 เพราะพักเที่ยงไม่ใช่เวลาทำงาน)
   * ส่วนการคิดเป็นเงินอยู่ที่นี่ ใช้อัตราค่าปรับมาสายของรอบนั้นเหมือนการมาสายปกติ
   */
  uncoveredAfterLeaveMinutes?: { morning?: number; afternoon?: number } | null;
  dailyDeductionCap?: DailyDeductionCap | null;
  /**
   * ใช้บังคับให้ผลคำนวณเป็นขาดงาน หลัง service ตรวจพบว่าไม่สแกนครบทั้ง 3 รอบ
   * และผ่านเงื่อนไขไม่ติดลา/Offsite แล้ว เพื่อไม่ให้ fallback เป็นค่าลงเวลาไม่ครบ 3 รอบ
   */
  forceAbsent?: boolean;
  /**
   * เวลาที่ใช้ตัดสินว่ารอบลงเวลาถึงเวลาปิดรอบแล้วหรือยัง
   * ถ้าเป็นวันปัจจุบันและยังไม่ถึง closeTime จะยังไม่ถือว่า "ขาดรายการลงเวลา"
   */
  asOf?: Date;
  /** การยกเว้นการลงเวลาที่ตั้งไว้รายพนักงาน */
  employeeExemption?: EmployeeAttendanceExemption;
  /**
   * ยกเว้นค่าปรับช่วงบ่ายของวันนี้ — ทั้งมาสายบ่ายและลืมสแกนเข้าบ่าย
   *
   * ต่างจาก exemptSessions ตรงที่ยังนับนาทีสายและสถานะขาดสแกนตามจริง
   * ตัดแค่ยอดเงิน รายงานจึงยังบอกได้ว่าวันนั้นเกิดอะไรขึ้น
   *
   * ต้องตัดตั้งแต่ในเครื่องคำนวณ ไม่ใช่ลบทีหลัง เพราะยอดค่าปรับผ่านเพดาน
   * รายวันมาแล้ว (สายเช้า 200 + บ่าย 100 เพดาน 250 ได้ 250) การหักบ่ายออก
   * ทีหลังจะเหลือ 150 ทั้งที่คำตอบที่ถูกคือ 200
   */
  waiveAfternoonPenalty?: boolean;
};

/**
 * การยกเว้นการลงเวลารายพนักงาน
 *
 * แยกจาก leaveCoverage เพราะคนละเรื่องกัน — leaveCoverage คือ "วันนี้ลา"
 * ส่วนตัวนี้คือ "คนนี้ไม่ต้องลงเวลาตั้งแต่แรก" ซึ่งเป็นข้อตกลงการจ้างงาน
 * ไม่ใช่เหตุการณ์รายวัน
 */
export type EmployeeAttendanceExemption = {
  /**
   * false = ไม่ต้องลงเวลาเลย (ผู้บริหาร / เหมาจ่าย)
   * ปิดการตรวจทั้งวัน ไม่คิดสาย ขาดงาน ลืมสแกน และค่าปรับใด ๆ
   */
  trackingRequired: boolean;
  /** ช่วงที่ยกเว้นเป็นรายคน เช่น พนักงานจัดส่งไม่ต้องกดเข้างานบ่าย */
  exemptSessions: Array<'MORNING_IN' | 'AFTERNOON_IN' | 'CHECK_OUT'>;
};

const DEFAULT_EMPLOYEE_EXEMPTION: EmployeeAttendanceExemption = {
  trackingRequired: true,
  exemptSessions: [],
};

@Injectable()
export class AttendanceCalculationEngineService {
  calculateDailySummaryDraft(input: CalculateDailySummaryInput) {
    const rules = this.normalizeRules(input.sessionRules, input.policy);
    const morningRule = this.findRule(rules, 'MORNING_IN');
    const afternoonRule = this.findRule(rules, 'AFTERNOON_IN');
    const checkoutRule = this.findRule(rules, 'CHECK_OUT');

    /*
     * เส้นเวลาของกะ — คำนวณครั้งเดียวแล้วส่งต่อให้ทุกจุดที่เทียบเวลา
     * กะที่ไม่ข้ามคืนจะได้ค่าเท่าเดิมทุกประการ (anchor อยู่ต้นวัน ไม่มีอะไร wrap)
     */
    const shiftWindow = resolveShiftWindow(rules);
    const sessionSplitMinutes = this.resolveSessionSplitMinutes(
      afternoonRule,
      shiftWindow,
    );

    const morningIn = this.findSessionLog(
      input.logs,
      'MORNING',
      AttendanceLogType.CHECK_IN,
      shiftWindow,
      sessionSplitMinutes,
    );
    const afternoonIn = this.findSessionLog(
      input.logs.filter((log) => log.id !== morningIn?.id),
      'AFTERNOON',
      AttendanceLogType.CHECK_IN,
      shiftWindow,
      sessionSplitMinutes,
    );
    const checkOut = this.findCheckoutLog(input.logs);

    const asOf = input.asOf ?? new Date();
    const offsiteCoverage = input.offsiteCoverage ?? this.emptyOffsiteCoverage();

    /*
     * การยกเว้นรายพนักงาน — ต้องมาก่อนเงื่อนไขอื่นทั้งหมด
     *
     * trackingRequired = false คือคนที่ไม่ต้องลงเวลาตามข้อตกลงการจ้าง
     * (ผู้บริหาร/เหมาจ่าย) ทุกรอบจึงไม่บังคับ ผลคือไม่มีสาย ไม่มีลืมสแกน
     * และไม่ถูกตีเป็นขาดงาน
     *
     * exemptSessions ยกเว้นเฉพาะบางรอบ เช่น พนักงานจัดส่งที่ออกไปทำงานข้างนอก
     * ตอนกลางวัน ไม่ต้องกลับมากดเข้างานบ่าย
     */
    const exemption = input.employeeExemption ?? DEFAULT_EMPLOYEE_EXEMPTION;
    const trackingOff = exemption.trackingRequired === false;
    const isSessionExempt = (code: 'MORNING_IN' | 'AFTERNOON_IN' | 'CHECK_OUT') =>
      trackingOff || exemption.exemptSessions.includes(code);

    const requireMorning =
      !isSessionExempt('MORNING_IN') &&
      this.shouldRequireRule(morningRule) &&
      !input.leaveCoverage.coversMorning &&
      !offsiteCoverage.coversMorning;
    const requireAfternoon =
      !isSessionExempt('AFTERNOON_IN') &&
      this.shouldRequireRule(afternoonRule) &&
      !input.leaveCoverage.coversAfternoon &&
      !offsiteCoverage.coversAfternoon;
    const requireCheckout =
      !isSessionExempt('CHECK_OUT') &&
      this.shouldRequireRule(checkoutRule) &&
      !input.leaveCoverage.coversCheckout &&
      !offsiteCoverage.coversCheckout;

    // สำคัญ: รอบที่ยังไม่ถึงเวลาปิดรอบ ไม่ถือว่า "ขาดรายการลงเวลา"
    // เช่น วันนี้เวลา 14:00 ยังไม่ควรขึ้นว่าขาดรายการออกงาน เพราะรอบออกงานยังไม่ปิด
    const shouldEvaluateMorningMissing =
      requireMorning && this.isRuleClosedForMissing(morningRule, input.workDate, asOf, shiftWindow);
    const shouldEvaluateAfternoonMissing =
      requireAfternoon && this.isRuleClosedForMissing(afternoonRule, input.workDate, asOf, shiftWindow);
    const shouldEvaluateCheckoutMissing =
      requireCheckout && this.isRuleClosedForMissing(checkoutRule, input.workDate, asOf, shiftWindow);

    const isMorningMissing = shouldEvaluateMorningMissing && !morningIn;
    const isAfternoonMissing = shouldEvaluateAfternoonMissing && !afternoonIn;
    const isCheckoutMissing = shouldEvaluateCheckoutMissing && !checkOut;
    const hasMissingLog = isMorningMissing || isAfternoonMissing || isCheckoutMissing;
    /*
     * "ขาดงาน" = ขาดครบทุกรอบ "ที่ต้องลงจริง" ไม่ใช่ครบทั้ง 3 รอบเสมอไป
     *
     * ถ้าเทียบครบ 3 รอบตายตัว กะที่ปิดบางรอบไว้ (requirePunch=false) เช่นกะนักศึกษาฝึกงาน
     * ที่ลงแค่เข้า-ออก จะไม่มีวันถูกนับว่าขาดงานเลย เพราะรอบที่ปิดไว้ isMissing เป็น false ตลอด
     * คนที่ไม่มาทั้งวันจึงรอดจากการหักขาดงาน แต่กลับโดนค่าปรับลืมลงเวลาแทน — ผิดทั้งสองทาง
     *
     * ส่วนกะที่ปิดทุกรอบ (เช่นผู้บริหารที่ไม่ต้องลงเวลา) จะไม่มีรอบให้เทียบเลย
     * จึงต้องกันไว้ไม่ให้กลายเป็นขาดงานทั้งที่ไม่ต้องลงอะไรตั้งแต่แรก
     */
    const requiredMissingFlags = [
      requireMorning ? isMorningMissing : null,
      requireAfternoon ? isAfternoonMissing : null,
      requireCheckout ? isCheckoutMissing : null,
    ].filter((flag): flag is boolean => flag !== null);

    /*
     * คนที่ไม่ต้องลงเวลาต้องไม่ถูกตีเป็นขาดงานไม่ว่ากรณีใด
     * รวมถึงตอนที่ service ส่ง forceAbsent มา เพราะตัวนั้นตั้งจากเงื่อนไข
     * "ไม่สแกนครบ 3 รอบ" ซึ่งใช้กับคนกลุ่มนี้ไม่ได้ตั้งแต่ต้น
     */
    const isAbsent =
      !trackingOff &&
      (Boolean(input.forceAbsent) ||
        (requiredMissingFlags.length > 0 && requiredMissingFlags.every(Boolean)));
    const absentDays = isAbsent ? 1 : 0;
    const absentDeductionAmount = isAbsent ? this.roundMoney(input.absentDeductionAmount ?? 0) : 0;

    const rawMorningLateMinutes =
      requireMorning && morningIn
        ? this.calculateLateMinutesFromRule(morningIn.logTime, morningRule, input.policy, shiftWindow)
        : 0;
    const rawAfternoonLateMinutes =
      requireAfternoon && afternoonIn
        ? this.calculateLateMinutesFromRule(afternoonIn.logTime, afternoonRule, input.policy, shiftWindow)
        : 0;

    /*
     * ใบลาแบบชั่วโมงหักกลบนาทีที่มาสายได้
     *
     * ที่ผ่านมาระบบดูแค่ธง coversMorning ซึ่งเป็นการคลุม "ทั้งรอบ" ใบลา 30 นาที
     * จึงไม่มีผลอะไรเลย พนักงานที่มาสาย 19 นาทีแล้วยื่นใบลา 30 นาทีมาคลุม
     * ยังถูกคิดสายเต็ม 19 นาทีและโดนหักเงิน ทั้งที่ยื่นใบลาถูกต้องแล้ว
     *
     * ตัดจากรอบเช้าก่อนแล้วเหลือเท่าไรค่อยไปตัดรอบบ่าย เพราะการมาสายรอบเช้า
     * เกิดก่อนเสมอ และเป็นลำดับเดียวกับที่ผู้ใช้เข้าใจ
     */
    /*
     * หักกลบเฉพาะใบลาที่ยังไม่ได้คลุมรอบไหนเต็ม ๆ
     *
     * ใบลาครึ่งวันหรือเต็มวันจะตั้งธง coversMorning/coversAfternoon ไว้แล้ว
     * ซึ่งทำให้รอบนั้นไม่ถูกบังคับและไม่คิดสายอยู่แล้ว นาทีของใบลานั้นเป็นของ
     * รอบที่มันคลุม จะเอามาหักข้ามรอบไม่ได้
     *
     * เคสจริงที่จับได้: ลาครึ่งบ่าย 240 นาที ถ้าเอามาหักข้ามรอบ จะไปล้าง
     * "มาสายตอนเช้า 5 นาที" ทิ้ง ทั้งที่การลาบ่ายไม่เกี่ยวกับการมาสายตอนเช้าเลย
     *
     * เหลือไว้เฉพาะใบลารายชั่วโมงสั้น ๆ ที่ไม่ได้คลุมรอบไหน ซึ่งเป็นกรณีที่
     * พนักงานยื่นมาคลุมช่วงที่ตัวเองมาสายพอดี
     */
    const leaveCoversAnySession =
      input.leaveCoverage.coversMorning ||
      input.leaveCoverage.coversAfternoon ||
      input.leaveCoverage.coversCheckout;

    const coveringLeaveMinutes = leaveCoversAnySession
      ? 0
      : Math.max(
          (input.leaveCoverage.paidLeaveMinutes ?? 0) +
            (input.leaveCoverage.unpaidLeaveMinutes ?? 0),
          0,
        );

    const morningLateAfterLeave = Math.max(rawMorningLateMinutes - coveringLeaveMinutes, 0);
    const remainingLeaveMinutes = Math.max(
      coveringLeaveMinutes - rawMorningLateMinutes,
      0,
    );
    const afternoonLateAfterLeave = Math.max(
      rawAfternoonLateMinutes - remainingLeaveMinutes,
      0,
    );

    /*
     * นาทีที่กลับเข้างานช้ากว่าเวลาสิ้นสุดใบลา นับเป็น "สาย" ของรอบนั้น
     *
     * ใช้เกณฑ์เดียวกับใบลาที่ไม่ได้คลุมเวลาเช็คอิน ซึ่งระบบหักกลบแล้วคิดส่วนเกิน
     * เป็นสายอยู่แล้ว (ดูเทส "ใบลาคลุมไม่หมด เหลือเท่าไรคิดเท่านั้น")
     * ถ้าคิดคนละแบบกันเพียงเพราะใบลาเริ่มคนละเวลา จะกลายเป็นว่าการยื่นใบลาสั้น ๆ
     * มาคลุมเวลาเช็คอิน เป็นวิธีเลี่ยงค่าปรับมาสายที่ถูกกว่าหลายเท่า
     */
    const uncoveredMorningMinutes = Math.max(
      this.toMoney(input.uncoveredAfterLeaveMinutes?.morning ?? 0),
      0,
    );
    const uncoveredAfternoonMinutes = Math.max(
      this.toMoney(input.uncoveredAfterLeaveMinutes?.afternoon ?? 0),
      0,
    );

    const morningLateMinutes = morningLateAfterLeave + uncoveredMorningMinutes;
    const afternoonLateMinutes =
      afternoonLateAfterLeave + uncoveredAfternoonMinutes;

    const lateMinutesOffsetByLeave =
      rawMorningLateMinutes - morningLateAfterLeave +
      (rawAfternoonLateMinutes - afternoonLateAfterLeave);

    /*
     * นาทีลาที่ยังเหลือหลังหักกลบมาสายแล้ว ให้เอาไปหักกลบ "ออกก่อนเวลา" ต่อ
     *
     * ใบลาเต็มวัน/ครึ่งวันตั้งธง coversCheckout ไว้อยู่แล้ว จึงไม่ต้องคิดตรงนี้
     * ที่ต้องคิดคือใบลารายชั่วโมงตอนบ่าย เช่น ลา 2 ชั่วโมงแล้วกลับก่อน 2 ชั่วโมง
     * เดิมระบบหักทั้งค่าลาไม่รับค่าจ้างและค่าปรับออกก่อนเวลาสำหรับนาทีชุดเดียวกัน
     */
    const leaveMinutesAfterLate = Math.max(
      remainingLeaveMinutes - rawAfternoonLateMinutes,
      0,
    );

    const totalLateMinutes = morningLateMinutes + afternoonLateMinutes;

    const waiveAfternoonPenalty = input.waiveAfternoonPenalty === true;

    const morningLatePenaltyAmount = this.roundMoney(
      morningLateMinutes * this.toMoney(morningRule?.latePenaltyPerMinute ?? input.policy.latePenaltyRatePerMinute ?? 0),
    );
    const rawAfternoonLatePenaltyAmount = this.roundMoney(
      afternoonLateMinutes * this.toMoney(afternoonRule?.latePenaltyPerMinute ?? input.policy.latePenaltyRatePerMinute ?? 0),
    );
    const afternoonLatePenaltyAmount = waiveAfternoonPenalty
      ? 0
      : rawAfternoonLatePenaltyAmount;
    const latePenaltyAmount = this.capMoney(
      this.roundMoney(morningLatePenaltyAmount + afternoonLatePenaltyAmount),
      input.policy.maxLatePenaltyPerDay,
    );

    const missingMorningPenaltyAmount = isAbsent
      ? 0
      : isMorningMissing
        ? this.toMoney(morningRule?.missingPenaltyAmount ?? input.policy.missingLogPenaltyPerDay ?? 0)
        : 0;
    const rawMissingAfternoonPenaltyAmount = isAbsent
      ? 0
      : isAfternoonMissing
        ? this.toMoney(afternoonRule?.missingPenaltyAmount ?? input.policy.missingLogPenaltyPerDay ?? 0)
        : 0;
    const missingAfternoonPenaltyAmount = waiveAfternoonPenalty
      ? 0
      : rawMissingAfternoonPenaltyAmount;
    const missingCheckoutPenaltyAmount = isAbsent
      ? 0
      : isCheckoutMissing
        ? this.toMoney(checkoutRule?.missingPenaltyAmount ?? input.policy.missingLogPenaltyPerDay ?? 0)
        : 0;
    /*
     * โหมดคิดค่าปรับเป็นรายวัน (PER_DAY) คิดก้อนเดียวไม่ว่าขาดกี่รอบ
     * ถ้ายกเว้นช่วงบ่ายแล้วขาดแค่รอบบ่าย ต้องไม่เหลือค่าปรับก้อนนี้ด้วย
     * ไม่งั้นการยกเว้นจะไม่มีผลเลยสำหรับบริษัทที่ใช้โหมดนี้
     */
    const hasMissingLogForPenalty = waiveAfternoonPenalty
      ? isMorningMissing || isCheckoutMissing
      : hasMissingLog;
    const rawMissingPenaltyAmount = isAbsent
      ? 0
      : this.roundMoney(
          input.policy.missingPenaltyMode === 'PER_DAY' && hasMissingLogForPenalty
            ? this.toMoney(input.policy.missingLogPenaltyPerDay ?? 0)
            : missingMorningPenaltyAmount + missingAfternoonPenaltyAmount + missingCheckoutPenaltyAmount,
        );
    const missingLogPenaltyAmount = isAbsent
      ? 0
      : this.capMoney(
          rawMissingPenaltyAmount,
          input.policy.maxMissingPenaltyPerDay,
        );

    /* รอยเข้างานแรกของวัน ใช้ตัดสินว่ารอยออกงานข้ามเที่ยงคืนไปแล้วหรือยัง */
    const firstPunchAt = morningIn?.logTime ?? afternoonIn?.logTime ?? null;

    const rawEarlyCheckoutMinutes =
      requireCheckout && checkOut
        ? this.calculateEarlyCheckoutMinutesFromRule(
            checkOut.logTime,
            checkoutRule,
            input.policy,
            shiftWindow,
            firstPunchAt,
          )
        : 0;
    const earlyCheckoutMinutes = Math.max(
      rawEarlyCheckoutMinutes - leaveMinutesAfterLate,
      0,
    );
    const earlyCheckoutMinutesOffsetByLeave =
      rawEarlyCheckoutMinutes - earlyCheckoutMinutes;
    const earlyCheckoutPenaltyAmount = this.roundMoney(
      earlyCheckoutMinutes * this.resolveEarlyLeavePenaltyPerMinute(checkoutRule, input.policy),
    );

    const lateCheckoutMinutes = checkOut
      ? this.calculateLateCheckoutMinutesFromRule(
          checkOut.logTime,
          checkoutRule,
          input.policy,
          shiftWindow,
          firstPunchAt,
        )
      : 0;
    const extraPresenceMinutes = checkoutRule?.collectLateOutMinutes === false ? 0 : lateCheckoutMinutes;

    const paidLeaveMinutes =
      input.leaveCoverage.paidLeaveMinutes ??
      (input.leave && !input.leaveCoverage.isUnpaid
        ? this.estimateLeaveMinutes(input.leaveCoverage.durationDays)
        : 0);
    const unpaidLeaveMinutes =
      input.leaveCoverage.unpaidLeaveMinutes ??
      (input.leave && input.leaveCoverage.isUnpaid
        ? this.estimateLeaveMinutes(input.leaveCoverage.durationDays)
        : 0);

    const rawDeductionComponents: DeductionComponents = {
      latePenaltyAmount,
      missingLogPenaltyAmount,
      missingMorningPenaltyAmount: this.roundMoney(missingMorningPenaltyAmount),
      missingAfternoonPenaltyAmount: this.roundMoney(missingAfternoonPenaltyAmount),
      missingCheckoutPenaltyAmount: this.roundMoney(missingCheckoutPenaltyAmount),
      earlyCheckoutPenaltyAmount,
      absentDeductionAmount,
      unpaidLeaveDeductionAmount: this.roundMoney(input.unpaidLeaveDeductionAmount),
    };

    const deductionCapResult = this.applyDailyDeductionCap(
      rawDeductionComponents,
      input.dailyDeductionCap,
    );
    const cappedDeductionComponents = deductionCapResult.components;
    const totalDeductionAmount = deductionCapResult.totalDeductionAmount;

    const hasOutOfSessionLog = input.logs.some(
      (log) =>
        String(log.status) === 'OUT_OF_SESSION' ||
        String((log as any).note ?? '').includes('นอกช่วง'),
    );
    const reviewState = resolveAttendanceReviewState({
      hasMissingLog,
      isMorningMissing,
      isAfternoonMissing,
      isCheckoutMissing,
      isAbsent,
      absentDays,
      totalLateMinutes,
      earlyCheckoutMinutes,
      missingLogPenaltyAmount: cappedDeductionComponents.missingLogPenaltyAmount,
      absentDeductionAmount: cappedDeductionComponents.absentDeductionAmount,
      earlyCheckoutPenaltyAmount:
        cappedDeductionComponents.earlyCheckoutPenaltyAmount,
      offsiteStatus: offsiteCoverage.status,
      policySnapshot: {
        lateReviewThresholdMinutes: LATE_REVIEW_THRESHOLD_MINUTES,
        approvedOffsiteCoverage: {
          status: offsiteCoverage.status,
          needsReview: offsiteCoverage.needsReview,
          coverageReason: offsiteCoverage.coverageReason ?? null,
        },
      },
      calculationStatus: 'CALCULATED',
      calculationNote: hasOutOfSessionLog
        ? 'มีรายการลงเวลานอกช่วงที่กำหนด ต้องตรวจสอบ'
        : null,
    });
    const reviewStatus = reviewState.hasReviewIssue
      ? 'NEED_REVIEW'
      : 'CALCULATED';

    return {
      morningIn,
      afternoonIn,
      checkOut,
      morningLateMinutes,
      afternoonLateMinutes,
      totalLateMinutes,
      /*
       * นาทีสายที่ถูกใบลาหักกลบไป — ไม่ได้ใช้คิดเงิน แต่ต้องส่งออกมาเพื่อให้
       * หน้าจออธิบายได้ว่าทำไมสายถึงเป็น 0 ทั้งที่สแกนเข้าหลังเวลา
       * ถ้าไม่มีค่านี้ HR จะไล่ที่มาของตัวเลขไม่ได้เลย
       */
      lateMinutesOffsetByLeave,
      isMorningMissing,
      isAfternoonMissing,
      isCheckoutMissing,
      hasMissingLog,
      isAbsent,
      absentDays,
      earlyCheckoutMinutes,
      /* เหตุผลเดียวกับ lateMinutesOffsetByLeave — ใช้อธิบายที่มาของเลข 0 บนหน้าจอ */
      earlyCheckoutMinutesOffsetByLeave,
      lateCheckoutMinutes,
      extraPresenceMinutes,
      latePenaltyAmount: cappedDeductionComponents.latePenaltyAmount,
      /*
       * ยอดค่าปรับช่วงบ่ายที่ถูกยกเว้นไป (ก่อนเพดานรายวัน)
       * เก็บไว้ตอบคำถามย้อนหลังว่า "ยกเว้นไปเท่าไร" โดยไม่ต้องคำนวณซ้ำ
       */
      afternoonPenaltyWaivedAmount: waiveAfternoonPenalty
        ? this.roundMoney(
            rawAfternoonLatePenaltyAmount + rawMissingAfternoonPenaltyAmount,
          )
        : 0,
      missingLogPenaltyAmount: cappedDeductionComponents.missingLogPenaltyAmount,
      missingMorningPenaltyAmount: cappedDeductionComponents.missingMorningPenaltyAmount,
      missingAfternoonPenaltyAmount: cappedDeductionComponents.missingAfternoonPenaltyAmount,
      missingCheckoutPenaltyAmount: cappedDeductionComponents.missingCheckoutPenaltyAmount,
      earlyCheckoutPenaltyAmount: cappedDeductionComponents.earlyCheckoutPenaltyAmount,
      absentDeductionAmount: cappedDeductionComponents.absentDeductionAmount,
      unpaidLeaveDeductionAmount: cappedDeductionComponents.unpaidLeaveDeductionAmount,
      totalDeductionAmount,
      paidLeaveMinutes,
      unpaidLeaveMinutes,
      offsiteMinutes: offsiteCoverage.minutes,
      approvedOtMinutes: 0,
      payableOtMinutes: 0,
      offsiteStatus: offsiteCoverage.status,
      reviewStatus,
      policySnapshot: this.buildPolicySnapshot(
        input.policy,
        rules,
        input.leaveCoverage,
        offsiteCoverage,
        input.dailyDeductionCap,
        deductionCapResult,
      ),
      calculationNote: this.buildCalculationNote({
        leave: input.leave,
        leaveCoverage: input.leaveCoverage,
        offsiteCoverage,
        hasMissingLog,
        isAbsent,
        totalLateMinutes,
        earlyCheckoutMinutes,
        lateCheckoutMinutes,
        hasOutOfSessionLog,
        totalDeductionAmount,
        rawTotalDeductionAmount: deductionCapResult.rawTotalDeductionAmount,
        dailyDeductionCapAmount: deductionCapResult.dailyDeductionCapAmount,
        rawLateAndEarlyPenaltyAmount:
          deductionCapResult.rawLateAndEarlyPenaltyAmount,
        deductionCapApplied: deductionCapResult.capApplied,
      }),
    };
  }

  private normalizeRules(rules: AttendanceRuleLike[], policy: AttendancePolicyLike) {
    if (rules.length > 0) {
      return [...rules].sort((a, b) => {
        const sortA = Number(a.sortOrder ?? 0);
        const sortB = Number(b.sortOrder ?? 0);
        if (sortA !== sortB) return sortA - sortB;
        return String(a.openTime ?? '').localeCompare(String(b.openTime ?? ''));
      });
    }

    return [
      {
        sessionCode: 'MORNING_IN',
        label: 'ลงเวลาเข้า รอบที่ 1',
        punchType: 'CHECK_IN',
        openTime: '06:00',
        expectedTime: policy.morningCheckInDeadline ?? '08:00',
        closeTime: '11:59',
        lateAfterTime: policy.morningCheckInDeadline ?? '08:00',
        lateGraceMinutes: policy.lateGraceMinutes ?? 0,
        latePenaltyPerMinute: policy.latePenaltyRatePerMinute ?? 0,
        missingPenaltyAmount: policy.missingLogPenaltyPerDay ?? 0,
        requirePunch: true,
        sortOrder: 1,
      },
      {
        sessionCode: 'AFTERNOON_IN',
        label: 'ลงเวลาเข้า รอบที่ 2',
        punchType: 'CHECK_IN',
        openTime: '12:00',
        expectedTime: policy.afternoonCheckInDeadline ?? '13:00',
        closeTime: '16:59',
        lateAfterTime: policy.afternoonCheckInDeadline ?? '13:00',
        lateGraceMinutes: policy.lateGraceMinutes ?? 0,
        latePenaltyPerMinute: policy.latePenaltyRatePerMinute ?? 0,
        missingPenaltyAmount: policy.missingLogPenaltyPerDay ?? 0,
        requirePunch: true,
        sortOrder: 2,
      },
      {
        sessionCode: 'CHECK_OUT',
        label: 'ออกงาน',
        punchType: 'CHECK_OUT',
        openTime: '00:00',
        expectedTime: policy.checkoutAllowedFrom ?? '17:00',
        closeTime: '23:59',
        earlyBeforeTime: policy.checkoutAllowedFrom ?? '17:00',
        lateOutAfterTime: policy.checkoutAllowedFrom ?? '17:00',
        missingPenaltyAmount: policy.missingLogPenaltyPerDay ?? 0,
        earlyLeavePenaltyPerMinute: this.resolveEarlyLeavePenaltyPerMinute(null, policy),
        requirePunch: true,
        collectLateOutMinutes: true,
        sortOrder: 3,
      },
    ];
  }

  private findRule(rules: AttendanceRuleLike[], sessionCode: string) {
    return rules.find((rule) => rule.sessionCode === sessionCode) ?? null;
  }

  private shouldRequireRule(rule: AttendanceRuleLike | null) {
    if (!rule) return false;
    return rule.requirePunch !== false;
  }

  private isRuleClosedForMissing(
    rule: AttendanceRuleLike | null,
    workDate: Date,
    asOf: Date,
    window: ShiftWindow,
  ) {
    if (!rule) return false;

    const workDateKey = this.getBangkokDateKey(workDate);
    const asOfDateKey = this.getBangkokDateKey(asOf);

    /*
     * กะข้ามคืนยังไม่จบเมื่อพ้นเที่ยงคืน — วันทำงานเมื่อวานของกะ 22:00-02:00
     * ยังรอการตอกออกงานอยู่จนถึงตีสี่ของวันนี้ ถ้าตัดที่วันปฏิทินตรง ๆ
     * ทุกกะกลางคืนจะขึ้น "ขาดรายการออกงาน" ทันทีที่ข้ามเที่ยงคืน
     */
    const dayDiff = this.diffCalendarDays(workDateKey, asOfDateKey);

    // วันในอดีตถือว่าปิดรอบทั้งหมดแล้ว (เว้นวันก่อนหน้าของกะที่ยังลากมาไม่จบ)
    if (dayDiff < -1) return true;

    // วันอนาคตยังไม่ควรสรุปว่าไม่มีรายการ
    if (dayDiff > 0) return false;

    const closeTime = rule.closeTime ?? rule.expectedTime;
    const closeMinutes = this.toShiftRuleMinutes(closeTime, window);

    // ถ้า rule ไม่สมบูรณ์ ให้ปล่อยเป็นรอดำเนินการก่อน ไม่ตีเป็นขาดรายการทันที
    if (!Number.isFinite(closeMinutes)) return false;

    if (dayDiff === -1) {
      // เมื่อวาน: ปิดรอบแล้วถ้ากะนี้ไม่ข้ามคืน หรือข้ามคืนแต่เลยเวลาปิดของวันนี้แล้ว
      if (!window.crossesMidnight) return true;

      return this.getBangkokMinutes(asOf) + MINUTES_PER_DAY > closeMinutes;
    }

    const asOfMinutes = this.toShiftPunchMinutes(asOf, window);

    // สำคัญ: วันนี้จะถือว่าขาดรายการได้เฉพาะหลังพ้นเวลาปิดรอบแล้วเท่านั้น
    // เช่น 16:11 ยังไม่ถึง closeTime 16:59 จึงต้องเป็นรอดำเนินการ ไม่ใช่ขาดรายการลงเวลา
    return asOfMinutes > closeMinutes;
  }

  /** ผลต่างวันปฏิทินจากคีย์ YYYY-MM-DD (workDate - asOf) */
  private diffCalendarDays(workDateKey: string, asOfDateKey: string) {
    const workMs = Date.parse(`${workDateKey}T00:00:00Z`);
    const asOfMs = Date.parse(`${asOfDateKey}T00:00:00Z`);

    if (!Number.isFinite(workMs) || !Number.isFinite(asOfMs)) {
      // เทียบเป็นข้อความแทน เพื่อคงพฤติกรรมเดิมเมื่อคีย์ผิดรูป
      return workDateKey < asOfDateKey ? -2 : workDateKey > asOfDateKey ? 1 : 0;
    }

    return Math.round((workMs - asOfMs) / (24 * 60 * 60 * 1000));
  }

  /**
   * เส้นแบ่งระหว่างรอบเข้างานที่ 1 กับรอบที่ 2 บนเส้นเวลาของกะ
   *
   * เดิมตรึงไว้ที่เที่ยงวัน ซึ่งใช้ไม่ได้กับกะที่ไม่ได้เริ่มตอนเช้า
   * เช่นกะกลางคืนที่รอบสองเริ่มตอนตีหนึ่ง — การตอกทุกครั้งจะตกไปอยู่ฝั่งเดียวกันหมด
   * จึงต้องใช้เวลาเปิดรอบที่ 2 ตามที่บริษัทตั้งไว้จริงเป็นเส้นแบ่ง
   */
  private resolveSessionSplitMinutes(
    afternoonRule: AttendanceRuleLike | null,
    window: ShiftWindow,
  ) {
    const configured = afternoonRule?.openTime ?? afternoonRule?.expectedTime;
    const fromRule = this.toShiftRuleMinutes(configured, window);

    if (Number.isFinite(fromRule)) return fromRule;

    // ไม่ได้ตั้งรอบที่ 2 ไว้ ใช้เที่ยงวันแบบเดิมเพื่อไม่ให้พฤติกรรมกะปกติเปลี่ยน
    return this.toShiftRuleMinutes('12:00', window);
  }

  private findSessionLog(
    logs: any[],
    session: string,
    logType: AttendanceLogType,
    window: ShiftWindow,
    splitMinutes: number,
  ) {
    const direct = logs.find(
      (log) => log.session === session && log.logType === logType,
    );

    if (direct) return direct;

    if (!Number.isFinite(splitMinutes)) return null;

    if (session === 'MORNING') {
      return (
        logs.find(
          (log) =>
            !log.session &&
            log.logType === logType &&
            this.toShiftPunchMinutes(log.logTime, window) < splitMinutes,
        ) ?? null
      );
    }

    if (session === 'AFTERNOON') {
      return (
        logs.find(
          (log) =>
            !log.session &&
            log.logType === logType &&
            this.toShiftPunchMinutes(log.logTime, window) >= splitMinutes,
        ) ?? null
      );
    }

    return null;
  }

  private findCheckoutLog(logs: any[]) {
    const checkoutLogs = logs.filter(
      (log) =>
        log.logType === AttendanceLogType.CHECK_OUT || log.session === 'EVENING',
    );

    return checkoutLogs.at(-1) ?? null;
  }

  /**
   * เวลาที่พนักงานตอกบัตร บนเส้นเวลาของกะ
   *
   * กะข้ามคืนจำเป็นต้องใช้ตัวนี้ ไม่งั้นการตอกออกงานตอนตีสอง (120 นาที)
   * จะถูกเทียบกับเวลาเลิกงานที่อ่านได้ 120 เหมือนกันแต่คนละวัน
   */
  private toShiftPunchMinutes(logTime: Date, window: ShiftWindow) {
    const minuteOfDay = this.getBangkokMinutes(logTime);

    if (!Number.isFinite(window.anchorMinutes)) return minuteOfDay;

    return toPunchShiftMinutes(minuteOfDay, window.anchorMinutes);
  }

  /** เวลาของกฎ บนเส้นเวลาของกะเดียวกับการตอกบัตร */
  private toShiftRuleMinutes(time: string | null | undefined, window: ShiftWindow) {
    if (!Number.isFinite(window.anchorMinutes)) {
      return this.parseTimeToMinutes(time);
    }

    return timeStringToShiftMinutes(time, window.anchorMinutes);
  }

  private calculateLateMinutesFromRule(
    logTime: Date,
    rule: AttendanceRuleLike | null,
    policy: AttendancePolicyLike,
    window: ShiftWindow,
  ) {
    if (!rule || rule.punchType === 'CHECK_OUT') return 0;

    const lateAfter = rule.lateAfterTime ?? rule.expectedTime;
    if (!lateAfter) return 0;

    const punchedMinutes = this.toShiftPunchMinutes(logTime, window);
    const lateAfterMinutes = this.toShiftRuleMinutes(lateAfter, window);
    if (!Number.isFinite(lateAfterMinutes)) return 0;

    const grace = Number(rule.lateGraceMinutes ?? policy.lateGraceMinutes ?? 0);
    const lateMinutes = punchedMinutes - lateAfterMinutes - grace;

    if (lateMinutes <= 0) return 0;

    const rounding = Number(policy.lateRoundingMinutes ?? 0);
    if (rounding > 0) {
      return Math.ceil(lateMinutes / rounding) * rounding;
    }

    return lateMinutes;
  }

  /**
   * เวลาตอกออกงานบนเส้นเวลาของกะ โดยรู้ว่าอาจเลยเที่ยงคืนไปแล้ว
   *
   * ตัวแปลงเวลาปกติมีกติกาว่า เวลาที่อยู่ใน 4 ชั่วโมงก่อนหมุดเริ่มกะให้ถือว่า
   * "มาก่อนเวลา" ซึ่งถูกกับการตอกเข้างาน แต่ผิดกับการตอกออกงานหลังเที่ยงคืน
   * กะ 08:00-17:00 (หมุด 06:00) คนที่เลิกงานตีสามจะถูกอ่านเป็น 03:00 ของวันเดียวกัน
   * แล้วกลายเป็น "ออกก่อนเวลา 840 นาที" ทั้งที่ความจริงคือทำงานเกินเวลา
   *
   * ตัวเลขเวลาอย่างเดียวแยกไม่ออกว่า 06:40 คือมาแต่เช้าหรือเลิกงานเช้าวันถัดไป
   * สิ่งที่แยกออกคือ "ลำดับ" — รอยออกงานต้องมาหลังรอยเข้างานของวันเดียวกันเสมอ
   * ถ้าออกมาก่อน แปลว่าข้ามเที่ยงคืนไปแล้ว ให้บวกไปอีกหนึ่งวัน
   *
   * ใช้ได้กับทุกคนโดยไม่ต้องตั้งกะข้ามคืนรายบุคคล เพราะพนักงานคนไหนก็มีโอกาส
   * ออกไปทำงานข้างนอกแล้วกลับดึกเป็นบางวัน
   */
  private resolveCheckoutShiftMinutes(
    logTime: Date,
    window: ShiftWindow,
    firstPunchAt?: Date | null,
  ) {
    const punchedMinutes = this.toShiftPunchMinutes(logTime, window);
    if (!firstPunchAt || !Number.isFinite(punchedMinutes)) return punchedMinutes;

    const firstMinutes = this.toShiftPunchMinutes(firstPunchAt, window);
    if (!Number.isFinite(firstMinutes) || punchedMinutes >= firstMinutes) {
      return punchedMinutes;
    }

    return punchedMinutes + MINUTES_PER_DAY;
  }

  private calculateEarlyCheckoutMinutesFromRule(
    logTime: Date,
    rule: AttendanceRuleLike | null,
    policy: AttendancePolicyLike,
    window: ShiftWindow,
    firstPunchAt?: Date | null,
  ) {
    if (!rule) return 0;

    const earlyBefore = rule.earlyBeforeTime ?? rule.expectedTime ?? policy.checkoutAllowedFrom;
    if (!earlyBefore) return 0;

    const earlyBeforeMinutes = this.toShiftRuleMinutes(earlyBefore, window);
    if (!Number.isFinite(earlyBeforeMinutes)) return 0;

    const punchedMinutes = this.resolveCheckoutShiftMinutes(
      logTime,
      window,
      firstPunchAt,
    );

    return Math.max(earlyBeforeMinutes - punchedMinutes, 0);
  }

  private resolveEarlyLeavePenaltyPerMinute(
    rule: AttendanceRuleLike | null,
    policy: AttendancePolicyLike,
  ) {
    const fromRule = this.toMoney(rule?.earlyLeavePenaltyPerMinute ?? 0);
    if (fromRule > 0) return fromRule;

    const fromPolicy = this.toMoney(policy.latePenaltyRatePerMinute ?? 0);
    if (fromPolicy > 0) return fromPolicy;

    return DEFAULT_EARLY_CHECKOUT_PENALTY_PER_MINUTE;
  }

  private calculateLateCheckoutMinutesFromRule(
    logTime: Date,
    rule: AttendanceRuleLike | null,
    policy: AttendancePolicyLike,
    window: ShiftWindow,
    firstPunchAt?: Date | null,
  ) {
    if (!rule) return 0;

    const lateOutAfter = rule.lateOutAfterTime ?? rule.expectedTime ?? policy.checkoutAllowedFrom;
    if (!lateOutAfter) return 0;

    const lateOutAfterMinutes = this.toShiftRuleMinutes(lateOutAfter, window);
    if (!Number.isFinite(lateOutAfterMinutes)) return 0;

    /* ออกงานหลังเที่ยงคืนต้องนับเป็นทำงานเกินเวลา ไม่ใช่ย้อนกลับไปต้นวัน */
    const punchedMinutes = this.resolveCheckoutShiftMinutes(
      logTime,
      window,
      firstPunchAt,
    );

    return Math.max(punchedMinutes - lateOutAfterMinutes, 0);
  }


  private buildPolicySnapshot(
    policy: AttendancePolicyLike,
    rules: AttendanceRuleLike[],
    leaveCoverage?: LeaveCoverage,
    offsiteCoverage?: OffsiteCoverage,
    dailyDeductionCap?: DailyDeductionCap | null,
    deductionCapResult?: DailyDeductionCapResult,
  ) {
    return {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      timezone: policy.timezone ?? 'Asia/Bangkok',
      lateGraceMinutes: policy.lateGraceMinutes ?? 0,
      lateRoundingMinutes: policy.lateRoundingMinutes ?? 0,
      lateReviewThresholdMinutes: LATE_REVIEW_THRESHOLD_MINUTES,
      maxLatePenaltyPerDay: policy.maxLatePenaltyPerDay === null ? null : String(policy.maxLatePenaltyPerDay ?? ''),
      maxMissingPenaltyPerDay: policy.maxMissingPenaltyPerDay === null ? null : String(policy.maxMissingPenaltyPerDay ?? ''),
      missingPenaltyMode: policy.missingPenaltyMode ?? 'PER_SESSION',
      dailyDeductionCap: dailyDeductionCap
        ? {
            amount: this.roundMoney(dailyDeductionCap.amount),
            baseSalary: this.roundMoney(dailyDeductionCap.baseSalary),
            salaryDivisorDays: dailyDeductionCap.salaryDivisorDays,
            dailyRate: this.roundMoney(dailyDeductionCap.dailyRate),
            calculationMethod: dailyDeductionCap.calculationMethod,
            missingCompensation: dailyDeductionCap.missingCompensation,
            capScope: ['LATE', 'EARLY_CHECKOUT'],
            rawLateAndEarlyPenaltyAmount: deductionCapResult
              ? deductionCapResult.rawLateAndEarlyPenaltyAmount
              : null,
            cappedLateAndEarlyPenaltyAmount: deductionCapResult
              ? deductionCapResult.cappedLateAndEarlyPenaltyAmount
              : null,
            outsideCapDeductionAmount: deductionCapResult
              ? deductionCapResult.outsideCapDeductionAmount
              : null,
            rawTotalDeductionAmount: deductionCapResult
              ? deductionCapResult.rawTotalDeductionAmount
              : null,
            cappedTotalDeductionAmount: deductionCapResult
              ? deductionCapResult.totalDeductionAmount
              : null,
            capApplied: deductionCapResult?.capApplied ?? false,
            cappedReductionAmount: deductionCapResult
              ? deductionCapResult.cappedReductionAmount
              : 0,
            source: 'EMPLOYEE_COMPENSATION_BASE_SALARY',
          }
        : null,
      approvedOffsiteCoverage: offsiteCoverage
        ? {
            coversMorning: offsiteCoverage.coversMorning,
            coversAfternoon: offsiteCoverage.coversAfternoon,
            coversCheckout: offsiteCoverage.coversCheckout,
            coveredSessions: offsiteCoverage.coveredSessions ?? [],
            minutes: offsiteCoverage.minutes,
            status: offsiteCoverage.status,
            needsReview: offsiteCoverage.needsReview,
            offsiteRequestIds: offsiteCoverage.requestIds ?? [],
            coverageReason: offsiteCoverage.coverageReason ?? null,
            source: 'OFFSITE_WORK_REQUEST',
          }
        : null,
      approvedLeaveCoverage: leaveCoverage
        ? {
            coversMorning: leaveCoverage.coversMorning,
            coversAfternoon: leaveCoverage.coversAfternoon,
            coversCheckout: leaveCoverage.coversCheckout,
            coveredSessions: leaveCoverage.coveredSessions ?? [],
            durationDays: leaveCoverage.durationDays,
            paidLeaveMinutes: leaveCoverage.paidLeaveMinutes ?? 0,
            unpaidLeaveMinutes: leaveCoverage.unpaidLeaveMinutes ?? 0,
            unpaidDurationDays: leaveCoverage.unpaidDurationDays ?? 0,
            coverageReason: leaveCoverage.coverageReason,
            leaveRequestIds: leaveCoverage.leaveRequestIds ?? [],
            leaveTypeIds: leaveCoverage.leaveTypeIds ?? [],
          }
        : null,
      sessionRules: rules.map((rule) => ({
        id: rule.id,
        sessionCode: rule.sessionCode,
        label: rule.label,
        punchType: rule.punchType,
        openTime: rule.openTime,
        expectedTime: rule.expectedTime,
        closeTime: rule.closeTime,
        lateAfterTime: rule.lateAfterTime,
        earlyBeforeTime: rule.earlyBeforeTime,
        lateOutAfterTime: rule.lateOutAfterTime,
        requirePunch: rule.requirePunch !== false,
        lateGraceMinutes: rule.lateGraceMinutes ?? 0,
        latePenaltyPerMinute: String(rule.latePenaltyPerMinute ?? 0),
        missingPenaltyAmount: String(rule.missingPenaltyAmount ?? 0),
        earlyLeavePenaltyPerMinute: String(rule.earlyLeavePenaltyPerMinute ?? 0),
        collectLateOutMinutes: rule.collectLateOutMinutes !== false,
        sortOrder: rule.sortOrder ?? 0,
      })),
    };
  }

  private buildCalculationNote(params: {
    leave?: any;
    leaveCoverage: LeaveCoverage;
    offsiteCoverage?: OffsiteCoverage;
    hasMissingLog: boolean;
    isAbsent?: boolean;
    totalLateMinutes: number;
    earlyCheckoutMinutes: number;
    lateCheckoutMinutes: number;
    hasOutOfSessionLog?: boolean;
    totalDeductionAmount: number;
    rawTotalDeductionAmount?: number;
    dailyDeductionCapAmount?: number;
    rawLateAndEarlyPenaltyAmount?: number;
    deductionCapApplied?: boolean;
  }) {
    const notes: string[] = [];

    if (params.leave) {
      const leaveTypeName =
        params.leave.leaveType?.nameTh ?? 'ไม่ระบุประเภทลา';
      const leaveMode = params.leave.leaveType?.isPaid ? 'ได้รับค่าจ้าง' : 'ไม่ได้รับค่าจ้าง';
      const leaveDayType = this.formatLeaveDayType(params.leave.dayType);
      notes.push(
        ['มีใบลาอนุมัติ', leaveTypeName, leaveDayType, leaveMode]
          .filter(Boolean)
          .join(' · '),
      );
    }

    if (params.offsiteCoverage?.status) {
      if (params.offsiteCoverage.status === 'HR_APPROVED' || params.offsiteCoverage.status === 'APPROVED') {
        const coverageText = this.formatCoverageSummary(params.offsiteCoverage);
        notes.push(
          ['ทำงานนอกสถานที่อนุมัติแล้ว', coverageText]
            .filter(Boolean)
            .join(' · '),
        );
      } else {
        notes.push('มีคำขอทำงานนอกสถานที่รอตรวจสอบ');
      }
    }

    if (params.totalLateMinutes > 0) {
      notes.push(`มาสายรวม ${params.totalLateMinutes} นาที`);
    }

    if (params.earlyCheckoutMinutes > 0) {
      notes.push(`ออกก่อนเวลา ${params.earlyCheckoutMinutes} นาที`);
    }

    if (params.lateCheckoutMinutes > 0) {
      notes.push(`กลับช้า ${params.lateCheckoutMinutes} นาที ไม่ถือเป็น OT อัตโนมัติ`);
    }

    if (params.hasOutOfSessionLog) {
      notes.push('มีรายการลงเวลานอกช่วงที่กำหนด ต้องตรวจสอบ');
    }

    if (params.isAbsent) {
      notes.push('ขาดงาน 1 วัน เนื่องจากไม่พบการลงเวลาครบทั้ง 3 รอบ');
    } else if (params.hasMissingLog) {
      notes.push('มีรอบลงเวลาที่ยังไม่มีรายการ ต้องตรวจสอบ');
    }

    if (params.deductionCapApplied && (params.dailyDeductionCapAmount ?? 0) > 0) {
      notes.push(
        `จำกัดค่ามาสายและออกก่อนเวลาไม่เกิน ${this.formatMoney(params.dailyDeductionCapAmount ?? 0)} บาท` +
          ` จากยอดสองรายการก่อนจำกัด ${this.formatMoney(params.rawLateAndEarlyPenaltyAmount ?? 0)} บาท`,
      );
    }

    if (params.totalDeductionAmount <= 0) {
      notes.push('ไม่มีรายการหักเงิน');
    }

    return notes.join(' / ') || null;
  }

  private formatLeaveDayType(dayType?: string | null) {
    if (dayType === 'HALF_DAY_MORNING') return 'ครึ่งเช้า';
    if (dayType === 'HALF_DAY_AFTERNOON') return 'ครึ่งบ่าย';
    if (dayType === 'HOURLY') return 'รายชั่วโมง';
    return 'เต็มวัน';
  }

  private formatCoverageSummary(coverage: OffsiteCoverage) {
    if (coverage.coversMorning && coverage.coversAfternoon && coverage.coversCheckout) {
      return 'ครอบคลุมเวลาเข้าเช้า เข้างานบ่าย และออกงาน';
    }

    const sessions = [
      coverage.coversMorning ? 'เข้าเช้า' : null,
      coverage.coversAfternoon ? 'เข้างานบ่าย' : null,
      coverage.coversCheckout ? 'ออกงาน' : null,
    ].filter(Boolean);

    return sessions.length > 0 ? `ครอบคลุม${sessions.join(' / ')}` : '';
  }

  private applyDailyDeductionCap(
    components: DeductionComponents,
    dailyDeductionCap?: DailyDeductionCap | null,
  ): DailyDeductionCapResult {
    const normalizedComponents: DeductionComponents = {
      latePenaltyAmount: this.toNonNegativeMoney(components.latePenaltyAmount),
      missingLogPenaltyAmount: this.toNonNegativeMoney(components.missingLogPenaltyAmount),
      missingMorningPenaltyAmount: this.toNonNegativeMoney(components.missingMorningPenaltyAmount),
      missingAfternoonPenaltyAmount: this.toNonNegativeMoney(components.missingAfternoonPenaltyAmount),
      missingCheckoutPenaltyAmount: this.toNonNegativeMoney(components.missingCheckoutPenaltyAmount),
      earlyCheckoutPenaltyAmount: this.toNonNegativeMoney(components.earlyCheckoutPenaltyAmount),
      absentDeductionAmount: this.toNonNegativeMoney(components.absentDeductionAmount),
      unpaidLeaveDeductionAmount: this.toNonNegativeMoney(components.unpaidLeaveDeductionAmount),
    };

    // เพดานเงินเดือนเฉลี่ยรายวันใช้เฉพาะค่ามาสายและออกก่อนเวลา
    // ค่าลงเวลาไม่ครบ ขาดงาน และลาไม่รับค่าจ้างเป็นรายการหักแยกต่างหาก
    const rawLateAndEarlyPenaltyAmount = this.roundMoney(
      normalizedComponents.latePenaltyAmount +
        normalizedComponents.earlyCheckoutPenaltyAmount,
    );
    const outsideCapDeductionAmount = this.roundMoney(
      normalizedComponents.missingLogPenaltyAmount +
        normalizedComponents.absentDeductionAmount +
        normalizedComponents.unpaidLeaveDeductionAmount,
    );
    const rawTotalDeductionAmount = this.roundMoney(
      rawLateAndEarlyPenaltyAmount + outsideCapDeductionAmount,
    );
    const dailyDeductionCapAmount = this.toNonNegativeMoney(
      dailyDeductionCap?.amount ?? 0,
    );

    if (
      !dailyDeductionCap ||
      dailyDeductionCap.missingCompensation ||
      dailyDeductionCapAmount <= 0 ||
      rawLateAndEarlyPenaltyAmount <= dailyDeductionCapAmount
    ) {
      return {
        components: normalizedComponents,
        rawTotalDeductionAmount,
        totalDeductionAmount: rawTotalDeductionAmount,
        rawLateAndEarlyPenaltyAmount,
        cappedLateAndEarlyPenaltyAmount: rawLateAndEarlyPenaltyAmount,
        outsideCapDeductionAmount,
        capApplied: false,
        dailyDeductionCapAmount,
        cappedReductionAmount: 0,
      };
    }

    const cappedLateAndEarlyComponents = this.scaleMoneyComponents(
      {
        latePenaltyAmount: normalizedComponents.latePenaltyAmount,
        earlyCheckoutPenaltyAmount:
          normalizedComponents.earlyCheckoutPenaltyAmount,
      },
      dailyDeductionCapAmount,
    );

    const cappedComponents: DeductionComponents = {
      latePenaltyAmount: cappedLateAndEarlyComponents.latePenaltyAmount,
      missingLogPenaltyAmount: normalizedComponents.missingLogPenaltyAmount,
      missingMorningPenaltyAmount:
        normalizedComponents.missingMorningPenaltyAmount,
      missingAfternoonPenaltyAmount:
        normalizedComponents.missingAfternoonPenaltyAmount,
      missingCheckoutPenaltyAmount:
        normalizedComponents.missingCheckoutPenaltyAmount,
      earlyCheckoutPenaltyAmount:
        cappedLateAndEarlyComponents.earlyCheckoutPenaltyAmount,
      absentDeductionAmount: normalizedComponents.absentDeductionAmount,
      unpaidLeaveDeductionAmount:
        normalizedComponents.unpaidLeaveDeductionAmount,
    };
    const cappedLateAndEarlyPenaltyAmount = this.roundMoney(
      cappedComponents.latePenaltyAmount +
        cappedComponents.earlyCheckoutPenaltyAmount,
    );
    const totalDeductionAmount = this.roundMoney(
      cappedLateAndEarlyPenaltyAmount + outsideCapDeductionAmount,
    );

    return {
      components: cappedComponents,
      rawTotalDeductionAmount,
      totalDeductionAmount,
      rawLateAndEarlyPenaltyAmount,
      cappedLateAndEarlyPenaltyAmount,
      outsideCapDeductionAmount,
      capApplied: true,
      dailyDeductionCapAmount,
      cappedReductionAmount: this.roundMoney(
        rawLateAndEarlyPenaltyAmount - cappedLateAndEarlyPenaltyAmount,
      ),
    };
  }

  private scaleMoneyComponents<T extends Record<string, number>>(
    components: T,
    targetTotal: number,
  ): T {
    const result = { ...components };
    const keys = Object.keys(result) as Array<keyof T>;
    const sourceTotal = this.roundMoney(
      keys.reduce((sum, key) => sum + this.toNonNegativeMoney(result[key]), 0),
    );
    const normalizedTarget = this.roundMoney(Math.max(targetTotal, 0));

    if (sourceTotal <= 0 || normalizedTarget <= 0) {
      for (const key of keys) {
        result[key] = 0 as T[keyof T];
      }
      return result;
    }

    if (sourceTotal <= normalizedTarget) {
      for (const key of keys) {
        result[key] = this.toNonNegativeMoney(result[key]) as T[keyof T];
      }
      return result;
    }

    const ratio = normalizedTarget / sourceTotal;
    for (const key of keys) {
      result[key] = this.roundMoney(this.toNonNegativeMoney(result[key]) * ratio) as T[keyof T];
    }

    const scaledTotal = this.roundMoney(
      keys.reduce((sum, key) => sum + this.toNonNegativeMoney(result[key]), 0),
    );
    const diff = this.roundMoney(normalizedTarget - scaledTotal);

    if (diff !== 0) {
      const adjustableKey = [...keys]
        .filter((key) => this.toNonNegativeMoney(result[key]) > 0)
        .sort((a, b) => this.toNonNegativeMoney(result[b]) - this.toNonNegativeMoney(result[a]))[0];

      if (adjustableKey) {
        result[adjustableKey] = this.roundMoney(
          Math.max(this.toNonNegativeMoney(result[adjustableKey]) + diff, 0),
        ) as T[keyof T];
      }
    }

    return result;
  }

  private emptyOffsiteCoverage(): OffsiteCoverage {
    return {
      coversMorning: false,
      coversAfternoon: false,
      coversCheckout: false,
      minutes: 0,
      status: null,
      needsReview: false,
      requestIds: [],
      coveredSessions: [],
      coverageReason: null,
    };
  }

  private estimateLeaveMinutes(durationDays: number) {
    if (!Number.isFinite(durationDays) || durationDays <= 0) return 0;
    return Math.round(durationDays * 8 * 60);
  }

  private getBangkokMinutes(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);

    return hour * 60 + minute;
  }

  private getBangkokDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = parts.find((part) => part.type === 'month')?.value ?? '00';
    const day = parts.find((part) => part.type === 'day')?.value ?? '00';

    return `${year}-${month}-${day}`;
  }

  private parseTimeToMinutes(time?: string | null) {
    if (!time) return Number.NaN;

    const match = String(time).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return Number.NaN;

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return Number.NaN;

    return hour * 60 + minute;
  }

  private toMoney(value: unknown) {
    const numberValue = Number(value ?? 0);
    if (!Number.isFinite(numberValue)) return 0;
    return numberValue;
  }

  private toNonNegativeMoney(value: unknown) {
    return this.roundMoney(Math.max(this.toMoney(value), 0));
  }

  private formatMoney(value: number) {
    return this.roundMoney(value).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private roundMoney(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }

  private capMoney(value: number, cap: unknown) {
    const capValue = this.toMoney(cap);
    if (capValue > 0) {
      return Math.min(value, capValue);
    }

    return value;
  }
}
