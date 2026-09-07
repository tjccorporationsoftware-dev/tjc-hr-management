import { toMoney } from './payroll-money.util';
import type { EmploymentProration } from './payroll-employment-proration.util';
import type {
  PayrollExtraLine,
  PayrollExtraLineSummary,
} from '../types/payroll-extra-lines.types';

/**
 * หารรายการค่าตอบแทนประจำตามสัดส่วนวันที่เป็นพนักงานจริงในงวด
 * ------------------------------------------------------------
 * หารเฉพาะบรรทัดที่ตั้ง prorateByEmploymentDays ไว้เป็น true
 *
 *   true      → ค่าอาหาร ค่าเดินทาง ค่าตำแหน่ง — เข้าวันที่ 16 ได้ครึ่งเดียว
 *   false     → ประกันกลุ่มรายเดือน ค่าผ่อนงวดคงที่ — เต็มจำนวนเสมอ
 *   ไม่มีค่า  → รายการเฉพาะงวด (โบนัส ปรับปรุง) ยอดคือยอดของงวดนั้นอยู่แล้ว ไม่ต้องหารซ้ำ
 *
 * เก็บ fullAmount กับ note ไว้ด้วย เพื่อให้สลิปอธิบายได้ว่าหักมาจากยอดเท่าไร
 * ไม่งั้นพนักงานเห็นค่าอาหาร 1,600 ทั้งที่ตกลงกันไว้ 3,000 แล้วไม่รู้ว่าทำไม
 */
export function prorateRecurringLines(
  summary: PayrollExtraLineSummary,
  proration: EmploymentProration,
): PayrollExtraLineSummary {
  if (!proration.isPartial) return summary;

  const apply = (lines: PayrollExtraLine[]) =>
    lines.map((line) => {
      if (line.prorateByEmploymentDays !== true) return line;

      const fullAmount = line.amount;
      const amount = toMoney(fullAmount * proration.factor);
      if (amount === fullAmount) return line;

      return {
        ...line,
        amount,
        fullAmount,
        note:
          line.note ??
          `คิดตามวันที่เป็นพนักงาน ${proration.employedDays}/${proration.divisorDays} วัน จากยอดเต็ม ${fullAmount.toLocaleString('th-TH')}`,
      };
    });

  return {
    ...summary,
    earningLines: apply(summary.earningLines),
    deductionLines: apply(summary.deductionLines),
    infoLines: apply(summary.infoLines),
  };
}
