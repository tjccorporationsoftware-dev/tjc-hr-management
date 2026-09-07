/**
 * แปลงสลิปเงินเดือนให้เป็นรูปแบบที่จอมือถืออ่านง่าย
 *
 * เรื่องเงินห้ามคำนวณซ้ำที่นี่เด็ดขาด — ทุกตัวเลขต้องมาจาก PayrollItem ตรง ๆ
 * ถ้าแอปบวกเองแล้วได้ไม่ตรงกับสลิปกระดาษแม้บาทเดียว พนักงานจะเลิกเชื่อทั้งระบบ
 * ที่นี่ทำแค่ "เลือก field, แปลง Decimal เป็น number, และจัดกลุ่มรายการ"
 */

type LineLike = {
  amount?: unknown;
  name?: string | null;
  type?: string | null;
  component?: { nameTh?: string | null } | null;
};

type PayrollItemLike = {
  employee?: { displayName?: string | null; employeeCode?: string | null } | null;
  id: string;
  lines?: LineLike[] | null;
  run?: {
    company?: { nameTh?: string | null } | null;
    period?: {
      code?: string | null;
      endDate?: Date | null;
      name?: string | null;
      paymentDate?: Date | null;
      startDate?: Date | null;
    } | null;
  } | null;
  status?: string | null;
  totalDeductions?: unknown;
  totalEarnings?: unknown;
  totalGrossPay?: unknown;
  totalNetPay?: unknown;
};

const amount = (value: unknown) => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/** ชื่อ component เป็นชื่อทางการที่ HR ตั้ง จึงมาก่อนชื่อที่พิมพ์ตอนปรับยอด */
const lineName = (line: LineLike) =>
  line.component?.nameTh ?? line.name ?? 'ไม่ระบุ';

export function toMobilePayslipListItem(item: PayrollItemLike) {
  const period = item.run?.period ?? null;

  return {
    id: item.id,
    netPay: amount(item.totalNetPay),
    paymentDate: period?.paymentDate ?? null,
    periodCode: period?.code ?? null,
    periodEnd: period?.endDate ?? null,
    periodName: period?.name ?? period?.code ?? 'ไม่ระบุงวด',
    periodStart: period?.startDate ?? null,
    status: item.status ?? null,
    totalDeductions: amount(item.totalDeductions),
    totalEarnings: amount(item.totalEarnings),
  };
}

/**
 * รายละเอียดสลิป
 *
 * `EMPLOYER_CONTRIBUTION` ไม่รวมในยอดหักโดยตั้งใจ — เป็นเงินสมทบฝั่งนายจ้าง
 * ที่ไม่ได้หักจากพนักงาน ถ้าเอาไปรวมกับรายการหักผู้ใช้จะคิดว่าโดนหักสองเท่า
 * ส่วน `INFO` เป็นบรรทัดข้อมูลเฉย ๆ ไม่กระทบยอดเงิน
 */
export function toMobilePayslipDetail(item: PayrollItemLike) {
  const lines = item.lines ?? [];

  const pick = (type: string) =>
    lines
      .filter((line) => line.type === type)
      .map((line) => ({ amount: amount(line.amount), name: lineName(line) }));

  return {
    ...toMobilePayslipListItem(item),
    companyName: item.run?.company?.nameTh ?? null,
    deductions: pick('DEDUCTION'),
    earnings: pick('EARNING'),
    employeeCode: item.employee?.employeeCode ?? null,
    employeeName: item.employee?.displayName ?? null,
    employerContributions: pick('EMPLOYER_CONTRIBUTION'),
    grossPay: amount(item.totalGrossPay),
    notes: pick('INFO'),
  };
}
