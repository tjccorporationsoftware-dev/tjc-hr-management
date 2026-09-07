import {
  resolveAllowanceTotal,
  type AllowanceLimitGroupRule,
  type AllowanceLimitInput,
} from './payroll-tax-allowance-limit.util';

const RETIREMENT_GROUP: AllowanceLimitGroupRule = {
  code: 'RETIREMENT',
  nameTh: 'กองทุนเพื่อการเกษียณ',
  maxAmount: 500000,
};

const DONATION_GROUP: AllowanceLimitGroupRule = {
  code: 'DONATION',
  nameTh: 'เงินบริจาค',
  maxPercentOfIncome: 0.1,
  percentBase: 'NET_AFTER_ALLOWANCE',
};

function findLine(
  result: ReturnType<typeof resolveAllowanceTotal>,
  code: string,
) {
  const line = result.lines.find((row) => row.code === code);
  if (!line) throw new Error(`ไม่พบบรรทัด ${code}`);
  return line;
}

describe('resolveAllowanceTotal', () => {
  it('ไม่ตั้งเพดานไว้ ก็หักได้เต็มตามที่อนุมัติ', () => {
    const result = resolveAllowanceTotal({
      allowances: [
        { code: 'SPOUSE', amount: 60000 },
        { code: 'PARENT', amount: 60000 },
      ],
      grossIncome: 600000,
    });

    expect(result.total).toBe(120000);
    expect(findLine(result, 'SPOUSE').cappedBy).toBe('NONE');
  });

  it('ตัดตามเพดานจำนวนเงินของประเภทนั้น', () => {
    const result = resolveAllowanceTotal({
      allowances: [
        { code: 'LIFE_INSURANCE', amount: 150000, maxAmount: 100000 },
      ],
      grossIncome: 1000000,
    });

    expect(result.total).toBe(100000);
    expect(findLine(result, 'LIFE_INSURANCE').cappedBy).toBe('MAX_AMOUNT');
  });

  it('ตัดตามเพดานเปอร์เซ็นต์ของเงินได้เมื่อแคบกว่าเพดานจำนวนเงิน', () => {
    // PVD 15% ของเงินได้ 400,000 = 60,000 ซึ่งแคบกว่าเพดาน 500,000
    const result = resolveAllowanceTotal({
      allowances: [
        {
          code: 'PROVIDENT_FUND',
          amount: 90000,
          maxAmount: 500000,
          maxPercentOfIncome: 0.15,
        },
      ],
      grossIncome: 400000,
    });

    expect(result.total).toBe(60000);
    expect(findLine(result, 'PROVIDENT_FUND').cappedBy).toBe(
      'PERCENT_OF_INCOME',
    );
  });

  it('เพดานจำนวนเงินชนะเมื่อแคบกว่าเพดานเปอร์เซ็นต์', () => {
    // SSF 30% ของ 2,000,000 = 600,000 แต่เพดานจริงคือ 200,000
    const result = resolveAllowanceTotal({
      allowances: [
        {
          code: 'SSF',
          amount: 300000,
          maxAmount: 200000,
          maxPercentOfIncome: 0.3,
        },
      ],
      grossIncome: 2000000,
    });

    expect(result.total).toBe(200000);
    expect(findLine(result, 'SSF').cappedBy).toBe('MAX_AMOUNT');
  });

  it('บังคับเพดานรวมของกลุ่มกองทุนเกษียณ และตัดตามสัดส่วน', () => {
    const allowances: AllowanceLimitInput[] = [
      {
        code: 'PROVIDENT_FUND',
        amount: 300000,
        maxAmount: 500000,
        maxPercentOfIncome: 0.15,
        limitGroupCode: 'RETIREMENT',
      },
      {
        code: 'RMF',
        amount: 300000,
        maxAmount: 500000,
        maxPercentOfIncome: 0.3,
        limitGroupCode: 'RETIREMENT',
      },
    ];

    const result = resolveAllowanceTotal({
      allowances,
      limitGroups: [RETIREMENT_GROUP],
      grossIncome: 5000000,
    });

    // แต่ละตัวผ่านเพดานของตัวเองที่ 300,000 แต่รวมกัน 600,000 เกินเพดานกลุ่ม 500,000
    expect(result.total).toBe(500000);
    expect(findLine(result, 'PROVIDENT_FUND').allowedAmount).toBe(250000);
    expect(findLine(result, 'RMF').allowedAmount).toBe(250000);
    expect(findLine(result, 'RMF').cappedBy).toBe('LIMIT_GROUP');

    const group = result.groups.find((row) => row.code === 'RETIREMENT');
    expect(group?.requestedAmount).toBe(600000);
    expect(group?.allowedAmount).toBe(500000);
  });

  it('ยอดรวมกลุ่มตรงเพดานพอดีแม้ตัดแล้วมีเศษสตางค์', () => {
    const result = resolveAllowanceTotal({
      allowances: [
        { code: 'A', amount: 100000, limitGroupCode: 'RETIREMENT' },
        { code: 'B', amount: 100000, limitGroupCode: 'RETIREMENT' },
        { code: 'C', amount: 100000, limitGroupCode: 'RETIREMENT' },
      ],
      limitGroups: [{ code: 'RETIREMENT', maxAmount: 100000 }],
      grossIncome: 5000000,
    });

    const sum = result.lines.reduce((acc, line) => acc + line.allowedAmount, 0);
    expect(Math.round(sum * 100) / 100).toBe(100000);
    expect(result.total).toBe(100000);
  });

  it('ไม่แตะรายการที่อยู่นอกกลุ่มเมื่อกลุ่มเกินเพดาน', () => {
    const result = resolveAllowanceTotal({
      allowances: [
        {
          code: 'PROVIDENT_FUND',
          amount: 400000,
          limitGroupCode: 'RETIREMENT',
        },
        { code: 'RMF', amount: 400000, limitGroupCode: 'RETIREMENT' },
        { code: 'SPOUSE', amount: 60000 },
      ],
      limitGroups: [RETIREMENT_GROUP],
      grossIncome: 5000000,
    });

    expect(findLine(result, 'SPOUSE').allowedAmount).toBe(60000);
    expect(findLine(result, 'SPOUSE').cappedBy).toBe('NONE');
    expect(result.total).toBe(560000);
  });

  it('บริจาคเพื่อการศึกษาหักได้ 2 เท่าของที่จ่ายจริง', () => {
    const result = resolveAllowanceTotal({
      allowances: [
        {
          code: 'DONATION_EDUCATION',
          amount: 10000,
          deductionMultiplier: 2,
          percentBase: 'NET_AFTER_ALLOWANCE',
          limitGroupCode: 'DONATION',
        },
      ],
      limitGroups: [DONATION_GROUP],
      grossIncome: 1000000,
      expenseDeduction: 100000,
      baseAllowanceTotal: 60000,
    });

    expect(findLine(result, 'DONATION_EDUCATION').requestedAmount).toBe(20000);
    expect(result.total).toBe(20000);
  });

  it('เงินบริจาคใช้ฐานหลังหักค่าใช้จ่ายและค่าลดหย่อนอื่น', () => {
    // ฐาน = 1,000,000 - 100,000 (ค่าใช้จ่าย) - 60,000 (ส่วนตัว) - 300,000 (PVD) = 540,000
    // เพดานบริจาค 10% = 54,000
    const result = resolveAllowanceTotal({
      allowances: [
        { code: 'PROVIDENT_FUND', amount: 300000 },
        {
          code: 'DONATION_GENERAL',
          amount: 200000,
          percentBase: 'NET_AFTER_ALLOWANCE',
          limitGroupCode: 'DONATION',
        },
      ],
      limitGroups: [DONATION_GROUP],
      grossIncome: 1000000,
      expenseDeduction: 100000,
      baseAllowanceTotal: 60000,
    });

    expect(findLine(result, 'DONATION_GENERAL').allowedAmount).toBe(54000);
    expect(result.total).toBe(354000);
  });

  it('ไม่มีเงินได้เหลือ ก็หักบริจาคไม่ได้ และไม่ติดลบ', () => {
    const result = resolveAllowanceTotal({
      allowances: [
        {
          code: 'DONATION_GENERAL',
          amount: 50000,
          percentBase: 'NET_AFTER_ALLOWANCE',
          limitGroupCode: 'DONATION',
        },
      ],
      limitGroups: [DONATION_GROUP],
      grossIncome: 100000,
      expenseDeduction: 50000,
      baseAllowanceTotal: 60000,
    });

    expect(findLine(result, 'DONATION_GENERAL').allowedAmount).toBe(0);
    expect(result.total).toBe(0);
  });

  it('ยอดติดลบหรืออ่านไม่ออก ถือเป็นศูนย์', () => {
    const result = resolveAllowanceTotal({
      allowances: [
        { code: 'A', amount: -5000 },
        { code: 'B', amount: Number.NaN },
      ],
      grossIncome: 500000,
    });

    expect(result.total).toBe(0);
  });

  it('ไม่มีรายการค่าลดหย่อนเลย ได้ศูนย์ ไม่พัง', () => {
    const result = resolveAllowanceTotal({
      allowances: [],
      limitGroups: [RETIREMENT_GROUP, DONATION_GROUP],
      grossIncome: 500000,
    });

    expect(result.total).toBe(0);
    expect(result.lines).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
  });

  it('รายการที่ไม่ตั้งเพดานและไม่เข้ากลุ่ม ให้ผลเท่าการบวกตรงๆ แบบเดิม', () => {
    // กันไม่ให้ระบบเก่าที่ยังไม่ได้ตั้งเพดานใหม่ ได้ตัวเลขเปลี่ยน
    const allowances: AllowanceLimitInput[] = [
      { code: 'PERSONAL', amount: 60000 },
      { code: 'CHILD', amount: 90000 },
      { code: 'LIFE_INSURANCE', amount: 123456.78 },
    ];

    const result = resolveAllowanceTotal({ allowances, grossIncome: 900000 });
    const legacyTotal = allowances.reduce((sum, row) => sum + row.amount, 0);

    expect(result.total).toBe(Math.round(legacyTotal * 100) / 100);
  });
});
