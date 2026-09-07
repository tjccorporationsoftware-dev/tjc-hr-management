/*
 * การปัดเศษจำนวนเงิน OT ตามนโยบาย (OvertimePolicy.amountRoundingMode)
 * ใช้ร่วมกันระหว่าง payroll (ยอดจริง) และหน้า preview ฝั่ง attendance
 * เพื่อไม่ให้ตัวเลขที่ HR เห็นก่อนส่ง ต่างจากยอดที่ payroll คิดจริง
 */

export type OvertimeAmountRoundingModeValue =
  | 'NONE'
  | 'ROUND_DOWN'
  | 'ROUND_UP'
  | 'ROUND_NEAREST';

export function applyOvertimeAmountRounding(
  amount: number,
  mode?: OvertimeAmountRoundingModeValue | null,
) {
  if (!Number.isFinite(amount)) return 0;

  switch (mode) {
    case 'ROUND_DOWN':
      return Math.floor(amount);
    case 'ROUND_UP':
      return Math.ceil(amount);
    case 'ROUND_NEAREST':
      return Math.round(amount);
    default:
      return amount;
  }
}
