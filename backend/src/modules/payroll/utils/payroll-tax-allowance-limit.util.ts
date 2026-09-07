/**
 * เพดานค่าลดหย่อนภาษีเงินได้บุคคลธรรมดา
 * -----------------------------------------------------------------------------
 * กฎหมายไทยจำกัดค่าลดหย่อนไว้ 3 ชั้น ซึ่งชั้นเดียว (จำนวนเงินคงที่) ไม่พอ:
 *
 *   1. เพดานจำนวนเงินของประเภทนั้น       เช่น ประกันชีวิต ไม่เกิน 100,000
 *   2. เพดานเป็น % ของเงินได้             เช่น กองทุนสำรองเลี้ยงชีพ ไม่เกิน 15% ของค่าจ้าง
 *   3. เพดานรวมของกลุ่ม                   เช่น PVD + RMF + SSF + ประกันบำนาญ รวมไม่เกิน 500,000
 *
 * และมีบางประเภทที่หักได้มากกว่าที่จ่ายจริง (บริจาคเพื่อการศึกษา หักได้ 2 เท่า)
 *
 * ไฟล์นี้เป็นคณิตศาสตร์ล้วน ไม่แตะ Prisma เพื่อให้เทสต์ได้ตรงๆ
 */

/** ฐานที่ใช้คิดเพดานแบบเปอร์เซ็นต์ */
export type AllowancePercentBase =
  /** เงินได้พึงประเมินทั้งปี — ใช้กับกองทุนและประกันเกือบทั้งหมด */
  | 'GROSS_INCOME'
  /** เงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อนอื่นแล้ว — ใช้กับเงินบริจาค */
  | 'NET_AFTER_ALLOWANCE';

export const ALLOWANCE_PERCENT_BASES: AllowancePercentBase[] = [
  'GROSS_INCOME',
  'NET_AFTER_ALLOWANCE',
];

/** สาเหตุที่ยอดถูกตัดลง — ส่งกลับให้หน้าจอบอกพนักงานได้ว่าทำไมหักไม่เต็ม */
export type AllowanceCapReason =
  | 'NONE'
  | 'MAX_AMOUNT'
  | 'PERCENT_OF_INCOME'
  | 'LIMIT_GROUP';

export type AllowanceLimitGroupRule = {
  code: string;
  nameTh?: string | null;
  /** เพดานรวมเป็นจำนวนเงิน */
  maxAmount?: number | null;
  /** เพดานรวมเป็นสัดส่วนของฐาน (0.10 = 10%) */
  maxPercentOfIncome?: number | null;
  percentBase?: AllowancePercentBase | null;
};

export type AllowanceLimitInput = {
  code: string;
  nameTh?: string | null;
  /** ยอดที่อนุมัติแล้ว (ก่อนคูณตัวคูณและก่อนตัดเพดาน) */
  amount: number;
  maxAmount?: number | null;
  /** 0.15 = 15% */
  maxPercentOfIncome?: number | null;
  percentBase?: AllowancePercentBase | null;
  /** บริจาคเพื่อการศึกษาหักได้ 2 เท่า — ประเภทอื่นเป็น 1 */
  deductionMultiplier?: number | null;
  limitGroupCode?: string | null;
};

export type ResolvedAllowanceLine = {
  code: string;
  nameTh: string | null;
  /** ยอดที่พนักงานแจ้ง/อนุมัติไว้ */
  declaredAmount: number;
  /** ยอดหลังคูณตัวคูณ ก่อนตัดเพดาน */
  requestedAmount: number;
  /** ยอดที่หักได้จริง */
  allowedAmount: number;
  cappedBy: AllowanceCapReason;
  limitGroupCode: string | null;
};

export type ResolvedAllowanceGroup = {
  code: string;
  nameTh: string | null;
  requestedAmount: number;
  allowedAmount: number;
  /** เพดานที่ใช้จริงกับกลุ่มนี้ — null คือไม่จำกัด */
  limitAmount: number | null;
};

export type ResolveAllowanceTotalInput = {
  allowances: AllowanceLimitInput[];
  limitGroups?: AllowanceLimitGroupRule[];
  /** เงินได้พึงประเมินทั้งปี (ประมาณการ) */
  grossIncome: number;
  /** ค่าใช้จ่ายที่หักไปแล้ว — ใช้เป็นฐานคิด % ของเงินบริจาค */
  expenseDeduction?: number;
  /** ค่าลดหย่อนที่คิดนอกตารางนี้ เช่น ส่วนตัว + ประกันสังคม */
  baseAllowanceTotal?: number;
};

export type ResolveAllowanceTotalResult = {
  /** ผลรวมที่หักได้จริงจากรายการในตาราง (ไม่รวม baseAllowanceTotal) */
  total: number;
  lines: ResolvedAllowanceLine[];
  groups: ResolvedAllowanceGroup[];
};

const CENT = 100;

function roundMoney(value: number) {
  return Math.round(value * CENT) / CENT;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** null/0/ค่าที่อ่านไม่ออก = ไม่จำกัด */
function optionalLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolvePercentBase(value?: AllowancePercentBase | null) {
  return value === 'NET_AFTER_ALLOWANCE'
    ? 'NET_AFTER_ALLOWANCE'
    : 'GROSS_INCOME';
}

/** เพดานที่แคบที่สุดชนะ — คืน null เมื่อไม่มีเพดานเลย */
function narrowestLimit(
  maxAmount: number | null,
  maxPercentOfIncome: number | null,
  base: number,
) {
  const percentLimit =
    maxPercentOfIncome === null ? null : roundMoney(base * maxPercentOfIncome);

  if (maxAmount === null) return { limit: percentLimit, byPercent: true };
  if (percentLimit === null) return { limit: maxAmount, byPercent: false };

  return percentLimit < maxAmount
    ? { limit: percentLimit, byPercent: true }
    : { limit: maxAmount, byPercent: false };
}

function capLine(row: AllowanceLimitInput, base: number) {
  const declaredAmount = positiveNumber(row.amount);
  const multiplier = optionalLimit(row.deductionMultiplier) ?? 1;
  const requestedAmount = roundMoney(declaredAmount * multiplier);

  const { limit, byPercent } = narrowestLimit(
    optionalLimit(row.maxAmount),
    optionalLimit(row.maxPercentOfIncome),
    base,
  );

  if (limit === null || requestedAmount <= limit) {
    return {
      declaredAmount,
      requestedAmount,
      allowedAmount: requestedAmount,
      cappedBy: 'NONE' as AllowanceCapReason,
    };
  }

  return {
    declaredAmount,
    requestedAmount,
    allowedAmount: roundMoney(Math.max(limit, 0)),
    cappedBy: (byPercent
      ? 'PERCENT_OF_INCOME'
      : 'MAX_AMOUNT') as AllowanceCapReason,
  };
}

/**
 * ตัดยอดกลุ่มที่เกินเพดานแบบตามสัดส่วน
 *
 * กฎหมายไม่ได้บอกว่าถ้าเกินต้องตัดตัวไหนก่อน (ผู้เสียภาษีเลือกเองตอนยื่น)
 * ระบบจึงตัดตามสัดส่วน เพราะอธิบายได้ตรงไปตรงมาและไม่เอนเอียงไปทางกองทุนใด
 * ยอดรวมที่หักได้เท่ากันทุกวิธี ต่างกันแค่การแสดงผลรายบรรทัด
 */
function applyGroupLimit(
  lines: ResolvedAllowanceLine[],
  group: AllowanceLimitGroupRule,
  base: number,
) {
  const members = lines.filter((line) => line.limitGroupCode === group.code);
  const requestedAmount = roundMoney(
    members.reduce((sum, line) => sum + line.allowedAmount, 0),
  );

  const { limit } = narrowestLimit(
    optionalLimit(group.maxAmount),
    optionalLimit(group.maxPercentOfIncome),
    base,
  );

  const resolved: ResolvedAllowanceGroup = {
    code: group.code,
    nameTh: group.nameTh ?? null,
    requestedAmount,
    allowedAmount: requestedAmount,
    limitAmount: limit,
  };

  if (!members.length || limit === null || requestedAmount <= limit) {
    return resolved;
  }

  const ratio = requestedAmount > 0 ? limit / requestedAmount : 0;
  let distributed = 0;

  members.forEach((line, index) => {
    const isLast = index === members.length - 1;
    // บรรทัดสุดท้ายรับเศษสตางค์ เพื่อให้ผลรวมเท่ากับเพดานพอดี
    const allowed = isLast
      ? roundMoney(limit - distributed)
      : roundMoney(line.allowedAmount * ratio);

    distributed = roundMoney(distributed + allowed);
    line.allowedAmount = Math.max(allowed, 0);
    line.cappedBy = 'LIMIT_GROUP';
  });

  resolved.allowedAmount = roundMoney(Math.max(limit, 0));
  return resolved;
}

function runPass(
  rows: AllowanceLimitInput[],
  limitGroups: AllowanceLimitGroupRule[],
  base: number,
) {
  const lines: ResolvedAllowanceLine[] = rows.map((row) => {
    const capped = capLine(row, base);

    return {
      code: row.code,
      nameTh: row.nameTh ?? null,
      declaredAmount: capped.declaredAmount,
      requestedAmount: capped.requestedAmount,
      allowedAmount: capped.allowedAmount,
      cappedBy: capped.cappedBy,
      limitGroupCode: row.limitGroupCode?.trim() || null,
    };
  });

  const usedGroupCodes = new Set(
    lines
      .map((line) => line.limitGroupCode)
      .filter((code): code is string => Boolean(code)),
  );

  const groups = limitGroups
    .filter((group) => usedGroupCodes.has(group.code))
    .map((group) => applyGroupLimit(lines, group, base));

  const total = roundMoney(
    lines.reduce((sum, line) => sum + line.allowedAmount, 0),
  );

  return { lines, groups, total };
}

/**
 * คิดค่าลดหย่อนรวมหลังตัดเพดานครบทุกชั้น
 *
 * แบ่งเป็น 2 รอบ เพราะเงินบริจาคใช้ฐาน "เงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อน"
 * จึงต้องรู้ยอดค่าลดหย่อนอื่นให้ครบก่อน ตรงตามลำดับในแบบ ภ.ง.ด.91
 */
export function resolveAllowanceTotal(
  input: ResolveAllowanceTotalInput,
): ResolveAllowanceTotalResult {
  const limitGroups = input.limitGroups ?? [];
  const grossIncome = Math.max(Number(input.grossIncome) || 0, 0);
  const expenseDeduction = Math.max(Number(input.expenseDeduction) || 0, 0);
  const baseAllowanceTotal = Math.max(Number(input.baseAllowanceTotal) || 0, 0);

  const grossBased: AllowanceLimitInput[] = [];
  const netBased: AllowanceLimitInput[] = [];

  for (const row of input.allowances) {
    if (resolvePercentBase(row.percentBase) === 'NET_AFTER_ALLOWANCE') {
      netBased.push(row);
    } else {
      grossBased.push(row);
    }
  }

  const firstPass = runPass(grossBased, limitGroups, grossIncome);

  const netBase = Math.max(
    grossIncome - expenseDeduction - baseAllowanceTotal - firstPass.total,
    0,
  );
  const secondPass = runPass(netBased, limitGroups, netBase);

  return {
    total: roundMoney(firstPass.total + secondPass.total),
    lines: [...firstPass.lines, ...secondPass.lines],
    groups: [...firstPass.groups, ...secondPass.groups],
  };
}
