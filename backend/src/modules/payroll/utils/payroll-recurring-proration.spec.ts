import { prorateRecurringLines } from './payroll-recurring-proration.util';
import { resolveEmploymentProration } from './payroll-employment-proration.util';
import type { PayrollExtraLineSummary } from '../types/payroll-extra-lines.types';

/**
 * กฎการหารรายการค่าตอบแทนประจำตามวันที่เป็นพนักงานจริง
 *
 *   prorateByEmploymentDays === true   → หารตามวัน
 *   prorateByEmploymentDays === false  → เต็มจำนวน
 *   ไม่มีค่า (รายการเฉพาะงวด เช่นโบนัส) → เต็มจำนวน
 */
function line(
  code: string,
  amount: number,
  prorateByEmploymentDays?: boolean,
): PayrollExtraLineSummary['earningLines'][number] {
  return {
    code,
    name: code,
    type: 'EARNING',
    sourceType: 'ALLOWANCE',
    quantity: 1,
    rate: amount,
    amount,
    sortOrder: 100,
    ...(prorateByEmploymentDays === undefined
      ? {}
      : { prorateByEmploymentDays }),
  };
}

function summaryOf(
  earningLines: PayrollExtraLineSummary['earningLines'],
  deductionLines: PayrollExtraLineSummary['deductionLines'] = [],
): PayrollExtraLineSummary {
  return { earningLines, deductionLines, infoLines: [] };
}

describe('การหารรายการประจำตามวันที่เป็นพนักงาน', () => {
  const period = {
    periodStartDate: new Date(Date.UTC(2026, 6, 1)),
    periodEndDate: new Date(Date.UTC(2026, 6, 31)),
    divisorDays: 30,
  };

  it('เข้าทำงานวันที่ 16 — ตัวที่ติ๊กหารตามวัน ตัวที่ไม่ติ๊กเต็ม โบนัสไม่ถูกแตะ', () => {
    const proration = resolveEmploymentProration({
      employee: { startDate: new Date(Date.UTC(2026, 6, 16)) },
      ...period,
    });
    expect(proration.employedDays).toBe(16);

    const result = prorateRecurringLines(
      summaryOf([
        line('FOOD', 3000, true),
        line('GROUP_INSURANCE', 800, false),
        line('BONUS', 5000),
      ]),
      proration,
    );

    const byCode = (code: string) =>
      result.earningLines.find((l) => l.code === code);

    expect(byCode('FOOD')?.amount).toBe(1600);
    expect(byCode('FOOD')?.fullAmount).toBe(3000);
    expect(byCode('GROUP_INSURANCE')?.amount).toBe(800);
    expect(byCode('BONUS')?.amount).toBe(5000);
  });

  it('ลาออกวันที่ 5 — หารตามวันที่ทำงานจริง', () => {
    const proration = resolveEmploymentProration({
      employee: {
        startDate: new Date(Date.UTC(2025, 0, 1)),
        employmentEndDate: new Date(Date.UTC(2026, 6, 5)),
      },
      ...period,
    });
    expect(proration.employedDays).toBe(5);

    const result = prorateRecurringLines(
      summaryOf([line('FOOD', 3000, true)]),
      proration,
    );

    expect(result.earningLines[0].amount).toBe(500);
  });

  it('อยู่ครบทั้งงวด — ไม่หารอะไรเลย แม้จะติ๊กไว้', () => {
    const proration = resolveEmploymentProration({
      employee: { startDate: new Date(Date.UTC(2025, 0, 1)) },
      ...period,
    });
    expect(proration.isPartial).toBe(false);

    const result = prorateRecurringLines(
      summaryOf([line('FOOD', 3000, true)]),
      proration,
    );

    expect(result.earningLines[0].amount).toBe(3000);
    expect(result.earningLines[0].fullAmount).toBeUndefined();
  });

  it('รายการหักก็เลือกได้เหมือนกัน — ค่าผ่อนงวดคงที่ต้องหักเต็ม', () => {
    const proration = resolveEmploymentProration({
      employee: { startDate: new Date(Date.UTC(2026, 6, 16)) },
      ...period,
    });

    const result = prorateRecurringLines(
      summaryOf(
        [],
        [
          { ...line('DORM', 1500, true), type: 'DEDUCTION' },
          { ...line('LOAN', 2000, false), type: 'DEDUCTION' },
        ],
      ),
      proration,
    );

    const byCode = (code: string) =>
      result.deductionLines.find((l) => l.code === code);

    expect(byCode('DORM')?.amount).toBe(800);
    expect(byCode('LOAN')?.amount).toBe(2000);
  });

  it('บันทึกที่มาไว้บนบรรทัด เพื่อให้อธิบายบนสลิปได้', () => {
    const proration = resolveEmploymentProration({
      employee: { startDate: new Date(Date.UTC(2026, 6, 16)) },
      ...period,
    });

    const result = prorateRecurringLines(
      summaryOf([line('FOOD', 3000, true)]),
      proration,
    );

    expect(result.earningLines[0].note).toContain('16/30');
  });
});
