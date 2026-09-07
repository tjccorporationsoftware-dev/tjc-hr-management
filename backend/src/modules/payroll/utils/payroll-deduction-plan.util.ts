import { toMoney } from './payroll-money.util';

/**
 * สูตรหักเงินเดือนแบบผ่อนงวด
 * -----------------------------------------------------------------------------
 * แยกออกมาเป็น pure function เพื่อให้เขียนเทสต์คุมได้
 * ตัวเลขพวกนี้ไปโผล่ในสลิปและแบบนำส่ง กยศ.
 */

export type DeductionPlanInput = {
  /** ยอดหนี้ทั้งหมด — null = หักไปเรื่อย ๆ จนกว่าจะสั่งหยุด */
  totalAmount?: number | null;
  installmentAmount: number;
  paidAmount: number;
  /** true = เงินเหลือไม่พอให้หักเท่าที่หักได้ / false = ข้ามงวดนั้น */
  allowPartialDeduction?: boolean;
};

export type DeductionPlanResult = {
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  isPartial: boolean;
  /** true = หักครบยอดแล้ว ควรปิดแผน */
  completed: boolean;
  skippedReason: 'NO_BALANCE' | 'NO_NET_PAY' | 'PARTIAL_NOT_ALLOWED' | null;
};

/** ยอดคงเหลือที่ยังต้องหักอีก (null = ไม่จำกัด) */
export function resolveOutstandingBalance(
  plan: Pick<DeductionPlanInput, 'totalAmount' | 'paidAmount'>,
): number | null {
  const total = plan.totalAmount;

  if (total === null || total === undefined) return null;

  return Math.max(toMoney(total) - toMoney(plan.paidAmount), 0);
}

/**
 * คำนวณยอดหักของงวดนี้
 *
 * ลำดับการตัด
 *   1) ไม่เกินยอดคงเหลือของแผน (งวดสุดท้ายจึงหักน้อยกว่าปกติได้)
 *   2) ไม่เกินเงินที่พนักงานยังเหลือรับจริงในงวดนั้น
 *      ถ้าไม่พอและแผนไม่อนุญาตให้หักบางส่วน จะข้ามงวดนี้ไปทั้งงวด
 *
 * `availableNetPay` คือเงินสุทธิที่เหลือหลังหักรายการอื่นไปแล้ว
 * กันไม่ให้ยอดสุทธิติดลบจากการหักหนี้
 */
export function resolveDeductionForPeriod(
  plan: DeductionPlanInput,
  availableNetPay: number,
): DeductionPlanResult {
  const outstanding = resolveOutstandingBalance(plan);
  const balanceBefore = outstanding ?? toMoney(plan.installmentAmount);

  const empty = (
    skippedReason: DeductionPlanResult['skippedReason'],
  ): DeductionPlanResult => ({
    amount: 0,
    balanceBefore,
    balanceAfter: balanceBefore,
    isPartial: false,
    completed: outstanding !== null && outstanding <= 0,
    skippedReason,
  });

  if (outstanding !== null && outstanding <= 0) {
    return empty('NO_BALANCE');
  }

  const installment = Math.max(toMoney(plan.installmentAmount), 0);
  if (installment <= 0) return empty('NO_BALANCE');

  // งวดสุดท้ายหักเท่าที่เหลือ
  const dueAmount =
    outstanding === null ? installment : Math.min(installment, outstanding);

  const room = Math.max(toMoney(availableNetPay), 0);

  if (room <= 0) return empty('NO_NET_PAY');

  if (room < dueAmount && plan.allowPartialDeduction === false) {
    return empty('PARTIAL_NOT_ALLOWED');
  }

  const amount = toMoney(Math.min(dueAmount, room));
  if (amount <= 0) return empty('NO_NET_PAY');

  const balanceAfter =
    outstanding === null ? balanceBefore : toMoney(outstanding - amount);

  return {
    amount,
    balanceBefore,
    balanceAfter,
    isPartial: amount < dueAmount,
    completed: outstanding !== null && balanceAfter <= 0,
    skippedReason: null,
  };
}

/**
 * หักหลายแผนพร้อมกันในงวดเดียว
 *
 * เรียงตาม priority (เลขน้อยหักก่อน) เพราะถ้าเงินไม่พอหักทุกแผน
 * ต้องรู้ว่าแผนไหนได้สิทธิ์ก่อน — กยศ. เป็นหน้าที่ตามกฎหมายจึงควรตั้ง priority ต่ำสุด
 */
export function resolveDeductionsForPeriod<
  T extends DeductionPlanInput & { id: string; priority?: number },
>(plans: T[], availableNetPay: number) {
  const ordered = [...(plans ?? [])].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
  );

  let room = Math.max(toMoney(availableNetPay), 0);
  const results: Array<{ plan: T; result: DeductionPlanResult }> = [];

  for (const plan of ordered) {
    const result = resolveDeductionForPeriod(plan, room);
    results.push({ plan, result });
    room = toMoney(room - result.amount);
  }

  return {
    results,
    totalDeducted: toMoney(
      results.reduce((sum, item) => sum + item.result.amount, 0),
    ),
    remainingNetPay: room,
  };
}
