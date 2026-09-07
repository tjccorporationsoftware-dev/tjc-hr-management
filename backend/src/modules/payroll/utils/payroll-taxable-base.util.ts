import { addMoney, toMoney } from './payroll-money.util';

/**
 * ฐานเงินได้ของงวดนี้ ที่ส่งต่อให้ Tax Engine
 * -----------------------------------------------------------------------------
 * แยกเป็น 3 ก้อน เพราะภาษีคิดคนละวิธี
 *   regular  เงินเดือนประจำ -> เอาไปคูณงวดที่เหลือเพื่อประมาณการทั้งปี
 *   bonus    โบนัส          -> คิดเป็นส่วนต่างของภาษีทั้งปี หักในงวดที่จ่ายเลย
 *   other    เงินก้อนอื่น    -> คิดแบบเดียวกับโบนัส
 */
export type TaxableIncomeSplit = {
  totalTaxableIncome: number;
  regularTaxableIncome: number;
  bonusIncome: number;
  otherOneTimeIncome: number;
};

export type TaxableLineInput = {
  type?: string | null;
  sourceType?: string | null;
  code?: string | null;
  amount?: unknown;
  isTaxable?: boolean | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? '').toUpperCase();
}

export function isRegularTaxLine(line: TaxableLineInput) {
  const sourceType = normalize(line?.sourceType);
  return sourceType === 'BASE_SALARY' || sourceType === 'ALLOWANCE';
}

export function isBonusTaxLine(line: TaxableLineInput) {
  const sourceType = normalize(line?.sourceType);
  const code = normalize(line?.code);
  return sourceType === 'BONUS' || code.includes('BONUS');
}

/**
 * แยกเงินได้ของงวดนี้ออกเป็นก้อน ๆ
 *
 * รายการหักที่ติดธง isTaxable จะถูก "ลบ" ออกจากฐานเงินเดือนประจำ
 * เพราะเป็นค่าจ้างที่ลูกจ้างไม่ได้รับจริง (ลาไม่รับค่าจ้าง ขาดงาน)
 * ถ้าไม่ลบออก ลูกจ้างจะถูกหักภาษีจากเงินที่ไม่เคยได้รับ
 *
 * ส่วนรายการที่หักจากค่าจ้างที่เกิดขึ้นแล้ว (ค่าปรับมาสาย ภาษี ประกันสังคม
 * เงินกู้) ตั้ง isTaxable = false จึงไม่กระทบฐาน
 */
export function splitTaxableIncome(
  lines: TaxableLineInput[] = [],
): TaxableIncomeSplit {
  const split = (lines ?? []).reduce<TaxableIncomeSplit>(
    (acc, line) => {
      const amount = toMoney(line?.amount);
      if (amount <= 0) return acc;

      const lineType = normalize(line?.type) || 'EARNING';

      if (lineType === 'DEDUCTION') {
        // ลดฐานเฉพาะรายการที่ระบุไว้ว่าให้ลด
        if (line?.isTaxable !== true) return acc;

        acc.regularTaxableIncome = addMoney(acc.regularTaxableIncome, -amount);
        acc.totalTaxableIncome = addMoney(acc.totalTaxableIncome, -amount);
        return acc;
      }

      // บรรทัดข้อมูลประกอบ (INFO) และเงินสมทบนายจ้าง ไม่ใช่เงินได้ของลูกจ้าง
      if (lineType !== 'EARNING') return acc;
      if (line?.isTaxable === false) return acc;

      acc.totalTaxableIncome = addMoney(acc.totalTaxableIncome, amount);

      if (isBonusTaxLine(line)) {
        acc.bonusIncome = addMoney(acc.bonusIncome, amount);
      } else if (isRegularTaxLine(line)) {
        acc.regularTaxableIncome = addMoney(acc.regularTaxableIncome, amount);
      } else {
        acc.otherOneTimeIncome = addMoney(acc.otherOneTimeIncome, amount);
      }

      return acc;
    },
    {
      totalTaxableIncome: 0,
      regularTaxableIncome: 0,
      bonusIncome: 0,
      otherOneTimeIncome: 0,
    },
  );

  // หักเกินจนติดลบไม่ควรกลายเป็นเงินได้ติดลบ ให้หยุดที่ศูนย์
  return {
    totalTaxableIncome: Math.max(split.totalTaxableIncome, 0),
    regularTaxableIncome: Math.max(split.regularTaxableIncome, 0),
    bonusIncome: Math.max(split.bonusIncome, 0),
    otherOneTimeIncome: Math.max(split.otherOneTimeIncome, 0),
  };
}
