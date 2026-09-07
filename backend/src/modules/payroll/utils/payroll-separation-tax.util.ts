/**
 * ภาษีของเงินที่ได้รับเมื่อออกจากงาน
 * -----------------------------------------------------------------------------
 * เงินก้อนตอนออกจากงานเสียภาษีไม่เหมือนเงินเดือนปกติ มี 2 ชั้นที่ต้องทำให้ถูก
 *
 * ชั้นที่ 1 — ยกเว้นภาษี (กฎกระทรวง ฉบับที่ 126 ข้อ 2(51))
 *   ค่าชดเชยตามกฎหมายแรงงาน ยกเว้นภาษีส่วนที่ไม่เกินค่าจ้าง 300 วัน
 *   และไม่เกิน 300,000 บาท เอาอันที่น้อยกว่า
 *   ใช้เฉพาะกรณีเลิกจ้าง ไม่ใช้กับลาออกเองและเกษียณตามระเบียบ
 *
 * ชั้นที่ 2 — แยกคำนวณภาษีต่างหาก (มาตรา 48(5) + ใบแนบ ภ.ง.ด.90/91)
 *   ถ้าทำงานตั้งแต่ 5 ปีขึ้นไป เลือกแยกเงินก้อนนี้ออกจากเงินได้อื่นได้
 *   หักค่าใช้จ่าย = 7,000 × ปีที่ทำงาน แต่ไม่เกินเงินได้ แล้วเหลือเท่าไรหักอีกกึ่งหนึ่ง
 *   ที่เหลือเอาไปเข้าขั้นภาษีตามปกติ โดยไม่ต้องรวมกับเงินเดือน
 *
 * ตัวเลข 300 / 300,000 / 7,000 / 5 ปี ไม่ได้ hardcode — ส่งเข้ามาจากค่าตั้งค่าบริษัท
 * เพราะกฎกระทรวงแก้ได้ และเคยแก้มาแล้ว (เดิมยกเว้นแค่ 300 วัน ไม่เกิน 300,000)
 *
 * ไฟล์นี้เป็นคณิตศาสตร์ล้วน ไม่แตะ Prisma
 */

import { toMoney } from './payroll-money.util';

/** ขั้นภาษีเงินได้บุคคลธรรมดา — ใช้ชุดเดียวกับที่คิดภาษีเงินเดือน */
export type SeparationTaxBracket = {
  minIncome: number;
  maxIncome: number | null;
  rate: number;
};

export type SeparationTaxSettings = {
  /** จำนวนวันค่าจ้างสูงสุดที่ยกเว้นภาษีได้ ปกติ 300 */
  exemptMaxDays?: number | null;
  /** เพดานเงินยกเว้นภาษี ปกติ 300,000 */
  exemptMaxAmount?: number | null;
  /** ค่าใช้จ่ายที่หักได้ต่อปีที่ทำงาน ปกติ 7,000 */
  expensePerServiceYear?: number | null;
  /** อายุงานขั้นต่ำที่แยกคำนวณภาษีได้ ปกติ 5 ปี */
  minServiceYearsForSeparateTax?: number | null;
};

export type SeparationTaxInput = {
  /** ค่าชดเชยตามกฎหมาย (มาตรา 118) เท่านั้น */
  statutorySeveranceAmount: number;
  /** เงินก้อนอื่นที่จ่ายเพราะเหตุออกจากงาน เช่น ค่าบอกกล่าว เงินตามข้อตกลง */
  otherSeparationAmount?: number;
  /** ค่าจ้างต่อวัน ใช้คิดเพดานยกเว้น 300 วัน */
  dailyWage: number;
  /** จำนวนปีที่ทำงาน เศษเดือนตั้งแต่ 6 เดือนขึ้นไปนับเป็น 1 ปี */
  serviceYears: number;
  /** ได้สิทธิยกเว้นภาษีหรือไม่ — เลิกจ้างได้ ลาออกเองไม่ได้ */
  eligibleForExemption: boolean;
  brackets: SeparationTaxBracket[];
  settings?: SeparationTaxSettings;
};

export type SeparationTaxResult = {
  /** เงินก้อนทั้งหมดที่จ่ายเพราะเหตุออกจากงาน */
  grossSeparationIncome: number;
  /** ส่วนที่ยกเว้นภาษี */
  exemptAmount: number;
  /** เพดานยกเว้นที่คำนวณได้ ใช้อธิบายให้พนักงานเข้าใจ */
  exemptLimitByDays: number | null;
  exemptLimitByAmount: number | null;
  /** เงินได้ที่ต้องเสียภาษีหลังหักส่วนยกเว้น */
  taxableSeparationIncome: number;
  /** แยกคำนวณภาษีต่างหากได้หรือไม่ */
  canCalculateSeparately: boolean;
  /** ค่าใช้จ่ายในใบแนบ = 7,000 × ปีทำงาน (ไม่เกินเงินได้) */
  serviceExpense: number;
  /** หักกึ่งหนึ่งของยอดที่เหลือ */
  halfDeduction: number;
  /** เงินได้สุทธิที่เอาเข้าขั้นภาษีในใบแนบ */
  netSeparationIncome: number;
  /** ภาษีของเงินก้อนนี้เมื่อแยกคำนวณ */
  separateTax: number;
};

const DEFAULT_EXEMPT_MAX_DAYS = 300;
const DEFAULT_EXEMPT_MAX_AMOUNT = 300000;
const DEFAULT_EXPENSE_PER_SERVICE_YEAR = 7000;
const DEFAULT_MIN_SERVICE_YEARS = 5;

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

function settingOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** เศษเดือนตั้งแต่ 6 เดือนขึ้นไปนับเป็น 1 ปี ตามวิธีนับในใบแนบ */
export function separationServiceYears(serviceMonths: number) {
  const months = Math.max(Number(serviceMonths) || 0, 0);
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder >= 6 ? years + 1 : years;
}

/** คิดภาษีตามขั้นบันได — แยกไว้ให้ทดสอบตรงๆ ได้ */
export function calculateTaxFromBrackets(
  netIncome: number,
  brackets: SeparationTaxBracket[],
) {
  const income = Math.max(Number(netIncome) || 0, 0);
  if (income <= 0 || !brackets.length) return 0;

  const sorted = [...brackets].sort((a, b) => a.minIncome - b.minIncome);
  let tax = 0;

  for (const bracket of sorted) {
    const lower = Math.max(Number(bracket.minIncome) || 0, 0);
    if (income <= lower) break;

    const upper =
      bracket.maxIncome === null || bracket.maxIncome === undefined
        ? income
        : Math.min(Number(bracket.maxIncome), income);
    if (upper <= lower) continue;

    tax += (upper - lower) * (Number(bracket.rate) || 0);
  }

  return roundMoney(tax);
}

export function calculateSeparationTax(
  input: SeparationTaxInput,
): SeparationTaxResult {
  const settings = input.settings ?? {};
  const exemptMaxDays = settingOrDefault(
    settings.exemptMaxDays,
    DEFAULT_EXEMPT_MAX_DAYS,
  );
  const exemptMaxAmount = settingOrDefault(
    settings.exemptMaxAmount,
    DEFAULT_EXEMPT_MAX_AMOUNT,
  );
  const expensePerServiceYear = settingOrDefault(
    settings.expensePerServiceYear,
    DEFAULT_EXPENSE_PER_SERVICE_YEAR,
  );
  const minServiceYears = settingOrDefault(
    settings.minServiceYearsForSeparateTax,
    DEFAULT_MIN_SERVICE_YEARS,
  );

  const statutorySeverance = positiveNumber(input.statutorySeveranceAmount);
  const otherSeparation = positiveNumber(input.otherSeparationAmount);
  const grossSeparationIncome = roundMoney(
    statutorySeverance + otherSeparation,
  );
  const dailyWage = positiveNumber(input.dailyWage);
  const serviceYears = Math.max(Math.floor(Number(input.serviceYears) || 0), 0);

  // ยกเว้นภาษีคิดจากค่าชดเชยตามกฎหมายเท่านั้น เงินก้อนอื่นไม่ได้สิทธิ
  const exemptLimitByDays = input.eligibleForExemption
    ? roundMoney(dailyWage * exemptMaxDays)
    : null;
  const exemptLimitByAmount = input.eligibleForExemption
    ? exemptMaxAmount
    : null;

  const exemptAmount = input.eligibleForExemption
    ? roundMoney(
        Math.min(
          statutorySeverance,
          exemptLimitByDays ?? 0,
          exemptLimitByAmount ?? 0,
        ),
      )
    : 0;

  const taxableSeparationIncome = roundMoney(
    Math.max(grossSeparationIncome - exemptAmount, 0),
  );

  const canCalculateSeparately =
    serviceYears >= minServiceYears && taxableSeparationIncome > 0;

  if (!canCalculateSeparately) {
    return {
      grossSeparationIncome,
      exemptAmount,
      exemptLimitByDays,
      exemptLimitByAmount,
      taxableSeparationIncome,
      canCalculateSeparately: false,
      serviceExpense: 0,
      halfDeduction: 0,
      netSeparationIncome: 0,
      separateTax: 0,
    };
  }

  // ค่าใช้จ่ายหักได้ไม่เกินเงินได้ ไม่งั้นยอดจะติดลบ
  const serviceExpense = roundMoney(
    Math.min(expensePerServiceYear * serviceYears, taxableSeparationIncome),
  );
  const afterExpense = roundMoney(taxableSeparationIncome - serviceExpense);
  const halfDeduction = roundMoney(afterExpense / 2);
  const netSeparationIncome = roundMoney(afterExpense - halfDeduction);
  const separateTax = calculateTaxFromBrackets(
    netSeparationIncome,
    input.brackets,
  );

  return {
    grossSeparationIncome,
    exemptAmount,
    exemptLimitByDays,
    exemptLimitByAmount,
    taxableSeparationIncome,
    canCalculateSeparately: true,
    serviceExpense,
    halfDeduction,
    netSeparationIncome,
    separateTax,
  };
}
