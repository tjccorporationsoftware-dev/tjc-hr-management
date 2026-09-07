/**
 * เงินที่ต้องจ่ายตอนพนักงานออกจากงาน
 * -----------------------------------------------------------------------------
 * อ้างอิง พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541
 *   มาตรา 118  ค่าชดเชยตามอายุงาน (บันไดขั้น เก็บเป็น master data ตั้งค่าได้)
 *   มาตรา 17   ค่าจ้างแทนการบอกกล่าวล่วงหน้า เมื่อเลิกจ้างโดยไม่บอกล่วงหน้า
 *   มาตรา 67   ค่าจ้างสำหรับวันหยุดพักผ่อนประจำปีที่ยังไม่ได้ใช้
 *   มาตรา 121-122 ค่าชดเชยพิเศษ กรณีย้ายสถานประกอบกิจการหรือใช้เครื่องจักรแทนคน
 *
 * ไฟล์นี้เป็นคณิตศาสตร์ล้วน ไม่แตะ Prisma
 *
 * หมายเหตุสำคัญ: บันไดค่าชดเชยไม่ได้ hardcode ไว้ที่นี่ ผู้เรียกต้องส่งเข้ามา
 * เพราะแต่ละบริษัทอาจให้ดีกว่ากฎหมาย และกฎหมายเองก็แก้ได้
 */

import { toMoney } from './payroll-money.util';

/** เหตุที่ออกจากงาน — ตัวกำหนดว่าได้ค่าชดเชยตามกฎหมายหรือไม่ */
export type SeparationReason =
  /** เลิกจ้างโดยลูกจ้างไม่มีความผิด — ได้ค่าชดเชย */
  | 'TERMINATION'
  /** เลิกจ้างเพราะลูกจ้างกระทำผิดร้ายแรง (มาตรา 119) — ไม่ได้ค่าชดเชย */
  | 'TERMINATION_WITH_CAUSE'
  /** ลาออกเอง — ไม่ได้ค่าชดเชย */
  | 'RESIGNATION'
  /** เกษียณอายุ — ได้ค่าชดเชยตามมาตรา 118/1 */
  | 'RETIREMENT'
  /** สิ้นสุดสัญญาจ้างที่มีกำหนดระยะเวลา */
  | 'CONTRACT_END'
  /** เสียชีวิต */
  | 'DECEASED';

/** ขั้นบันไดค่าชดเชย — ทำงานถึง minServiceMonths แล้วได้ payDays วัน */
export type SeverancePayTier = {
  minServiceMonths: number;
  payDays: number;
};

export type SeveranceInput = {
  reason: SeparationReason;
  /** ค่าจ้างอัตราสุดท้าย ต่อเดือน */
  monthlyWage: number;
  /** จำนวนเดือนที่ทำงาน นับถึงวันสุดท้ายที่ทำงาน */
  serviceMonths: number;
  /** บันไดค่าชดเชยของบริษัทนี้ เรียงอย่างไรก็ได้ */
  tiers: SeverancePayTier[];
  /** ตัวหารค่าจ้างต่อวัน ปกติ 30 */
  salaryDivisorDays?: number;

  /** จำนวนวันที่ต้องจ่ายแทนการบอกกล่าวล่วงหน้า 0 = บอกล่วงหน้าครบแล้ว */
  noticePayDays?: number;
  /** วันหยุดพักผ่อนประจำปีที่เหลือและต้องจ่ายเป็นเงิน */
  unusedLeaveDays?: number;
  /** ค่าชดเชยพิเศษ กรอกเป็นจำนวนวัน */
  specialSeveranceDays?: number;
  /** เงินก้อนอื่นที่ตกลงจ่ายเพิ่ม เช่น เงินตามข้อตกลงยุติข้อพิพาท */
  otherSeparationPay?: number;
};

export type SeveranceLine = {
  code:
    | 'SEVERANCE'
    | 'NOTICE_PAY'
    | 'UNUSED_LEAVE'
    | 'SPECIAL_SEVERANCE'
    | 'OTHER';
  nameTh: string;
  days: number;
  amount: number;
  /** ค่าชดเชยตามกฎหมายเท่านั้นที่ได้สิทธิยกเว้นภาษีตามกฎกระทรวง 126 */
  isStatutorySeverance: boolean;
};

export type SeveranceResult = {
  /** ค่าจ้างต่อวันที่ใช้คำนวณ */
  dailyWage: number;
  /** จำนวนวันค่าชดเชยตามบันได 0 = ไม่เข้าเงื่อนไข */
  severanceDays: number;
  lines: SeveranceLine[];
  /** เฉพาะค่าชดเชยตามกฎหมาย (มาตรา 118) */
  statutorySeveranceAmount: number;
  /** รวมทุกรายการที่จ่ายตอนออกจากงาน */
  totalAmount: number;
};

const DEFAULT_SALARY_DIVISOR_DAYS = 30;

/**
 * ปัด 2 ตำแหน่งแบบกัน floating-point error — ใช้ตัวกลางจาก payroll-money.util
 * ของเดิมเป็น Math.round ตรง ๆ ซึ่งคืน 1.00 ให้ค่าที่เก็บเป็น 1.005
 * (double เก็บเป็น 1.00499999999999989) และตัวนี้ใช้กับค่าชดเชย/ภาษีเงินก้อน
 * ที่เป็นเงินหลักแสน
 */
function roundMoney(value: number) {
  return toMoney(value);
}

function positiveNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** เหตุที่ทำให้ได้ค่าชดเชยตามมาตรา 118 */
export function isEligibleForStatutorySeverance(reason: SeparationReason) {
  return reason === 'TERMINATION' || reason === 'RETIREMENT';
}

/**
 * บันไดค่าชดเชยตาม พ.ร.บ.คุ้มครองแรงงาน มาตรา 118
 *
 * ใช้เป็น "ขั้นต่ำตามกฎหมาย" เมื่อบริษัทยังไม่ได้ตั้งบันไดของตัวเอง
 * บริษัทตั้งให้จ่ายมากกว่านี้ได้ แต่จ่ายน้อยกว่าไม่ได้ ระบบจึงต้องมีค่านี้เสมอ
 * แทนที่จะคิดเป็น 0 เมื่อไม่มีการตั้งค่า (ซึ่งผิดกฎหมายและตรวจไม่เจอ)
 *
 *  120 วัน–1 ปี  = 30 วัน
 *  1–3 ปี        = 90 วัน
 *  3–6 ปี        = 180 วัน
 *  6–10 ปี       = 240 วัน
 *  10–20 ปี      = 300 วัน
 *  20 ปีขึ้นไป    = 400 วัน
 */
export const STATUTORY_SEVERANCE_TIERS: SeverancePayTier[] = [
  { minServiceMonths: 4, payDays: 30 },
  { minServiceMonths: 12, payDays: 90 },
  { minServiceMonths: 36, payDays: 180 },
  { minServiceMonths: 72, payDays: 240 },
  { minServiceMonths: 120, payDays: 300 },
  { minServiceMonths: 240, payDays: 400 },
];

/**
 * หาจำนวนวันค่าชดเชยจากบันได — ได้ขั้นสูงสุดที่อายุงานถึง
 * อายุงานไม่ถึงขั้นต่ำสุดของบันได = ไม่ได้ค่าชดเชย (ปกติคือทำงานไม่ถึง 120 วัน)
 */
export function resolveSeveranceDays(
  serviceMonths: number,
  tiers: SeverancePayTier[],
) {
  const months = Math.max(Number(serviceMonths) || 0, 0);

  return tiers
    .filter((tier) => months >= Math.max(Number(tier.minServiceMonths) || 0, 0))
    .reduce((best, tier) => Math.max(best, positiveNumber(tier.payDays)), 0);
}

export function calculateSeverance(input: SeveranceInput): SeveranceResult {
  const divisor =
    positiveNumber(input.salaryDivisorDays) || DEFAULT_SALARY_DIVISOR_DAYS;
  const dailyWage = roundMoney(positiveNumber(input.monthlyWage) / divisor);

  const severanceDays = isEligibleForStatutorySeverance(input.reason)
    ? resolveSeveranceDays(input.serviceMonths, input.tiers)
    : 0;

  const lines: SeveranceLine[] = [];

  if (severanceDays > 0) {
    lines.push({
      code: 'SEVERANCE',
      nameTh: 'ค่าชดเชยตามกฎหมาย',
      days: severanceDays,
      amount: roundMoney(dailyWage * severanceDays),
      isStatutorySeverance: true,
    });
  }

  const noticePayDays = positiveNumber(input.noticePayDays);
  if (noticePayDays > 0) {
    lines.push({
      code: 'NOTICE_PAY',
      nameTh: 'ค่าจ้างแทนการบอกกล่าวล่วงหน้า',
      days: noticePayDays,
      amount: roundMoney(dailyWage * noticePayDays),
      isStatutorySeverance: false,
    });
  }

  const unusedLeaveDays = positiveNumber(input.unusedLeaveDays);
  if (unusedLeaveDays > 0) {
    lines.push({
      code: 'UNUSED_LEAVE',
      nameTh: 'ค่าจ้างวันหยุดพักผ่อนประจำปีที่ยังไม่ได้ใช้',
      days: unusedLeaveDays,
      amount: roundMoney(dailyWage * unusedLeaveDays),
      isStatutorySeverance: false,
    });
  }

  const specialSeveranceDays = positiveNumber(input.specialSeveranceDays);
  if (specialSeveranceDays > 0) {
    lines.push({
      code: 'SPECIAL_SEVERANCE',
      nameTh: 'ค่าชดเชยพิเศษ',
      days: specialSeveranceDays,
      amount: roundMoney(dailyWage * specialSeveranceDays),
      // ค่าชดเชยพิเศษเป็นคนละก้อนกับมาตรา 118 จึงไม่นับรวมในสิทธิยกเว้น
      isStatutorySeverance: false,
    });
  }

  const otherSeparationPay = positiveNumber(input.otherSeparationPay);
  if (otherSeparationPay > 0) {
    lines.push({
      code: 'OTHER',
      nameTh: 'เงินอื่นที่จ่ายเมื่อออกจากงาน',
      days: 0,
      amount: roundMoney(otherSeparationPay),
      isStatutorySeverance: false,
    });
  }

  const statutorySeveranceAmount = roundMoney(
    lines
      .filter((line) => line.isStatutorySeverance)
      .reduce((sum, line) => sum + line.amount, 0),
  );
  const totalAmount = roundMoney(
    lines.reduce((sum, line) => sum + line.amount, 0),
  );

  return {
    dailyWage,
    severanceDays,
    lines,
    statutorySeveranceAmount,
    totalAmount,
  };
}

/** นับอายุงานเป็นเดือน จากวันเริ่มงานถึงวันสุดท้ายที่ทำงาน (นับวันสุดท้ายด้วย) */
export function serviceMonthsBetween(startDate: Date, lastWorkingDate: Date) {
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(lastWorkingDate.getTime()) ||
    lastWorkingDate < startDate
  ) {
    return 0;
  }

  const years = lastWorkingDate.getFullYear() - startDate.getFullYear();
  const months = lastWorkingDate.getMonth() - startDate.getMonth();
  let total = years * 12 + months;

  // ยังไม่ถึงวันครบเดือน ให้ตัดเดือนสุดท้ายทิ้ง
  if (lastWorkingDate.getDate() < startDate.getDate()) {
    total -= 1;
  }

  return Math.max(total, 0);
}
