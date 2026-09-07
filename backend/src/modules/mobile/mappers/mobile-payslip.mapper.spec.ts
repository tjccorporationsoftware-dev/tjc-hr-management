import {
  toMobilePayslipDetail,
  toMobilePayslipListItem,
} from './mobile-payslip.mapper';

/**
 * สลิปเป็นของที่พนักงานเอาไปเทียบกับยอดเงินเข้าบัญชี
 * ถ้าเลขไม่ตรงแม้บาทเดียวจะกลายเป็นเรื่องทันที เทสชุดนี้จึงคุมสองอย่าง:
 * ยอดต้องมาจาก field ของ backend ตรง ๆ และการจัดกลุ่มต้องไม่ทำให้เข้าใจผิด
 */
describe('mobile payslip mapper', () => {
  const item = {
    employee: { displayName: 'สมชาย ใจดี', employeeCode: '670001' },
    id: 'item-1',
    lines: [
      { amount: '15000.00', name: 'เงินเดือน', type: 'EARNING' },
      {
        amount: '1200.00',
        component: { nameTh: 'ค่าล่วงเวลา' },
        name: 'OT',
        type: 'EARNING',
      },
      { amount: '750.00', name: 'ประกันสังคม', type: 'DEDUCTION' },
      {
        amount: '750.00',
        name: 'ประกันสังคม (นายจ้าง)',
        type: 'EMPLOYER_CONTRIBUTION',
      },
      { amount: '0', name: 'วันทำงาน 30 วัน', type: 'INFO' },
    ],
    run: {
      company: { nameTh: 'ทีเจซี จำกัด' },
      period: {
        code: '2026-07',
        name: 'งวดกรกฎาคม 2569',
        paymentDate: new Date('2026-07-25T00:00:00.000Z'),
      },
    },
    status: 'PAID',
    totalDeductions: '750.00',
    totalEarnings: '16200.00',
    totalGrossPay: '16200.00',
    totalNetPay: '15450.00',
  };

  it('แปลง Decimal ที่มาเป็นสตริงให้เป็นตัวเลขได้ถูกต้อง', () => {
    const result = toMobilePayslipListItem(item as never);

    expect(result).toMatchObject({
      id: 'item-1',
      netPay: 15450,
      periodName: 'งวดกรกฎาคม 2569',
      totalDeductions: 750,
      totalEarnings: 16200,
    });
  });

  it('ไม่มีชื่องวดต้องถอยไปใช้รหัสงวด ไม่ใช่ปล่อยว่าง', () => {
    const result = toMobilePayslipListItem({
      ...item,
      run: { ...item.run, period: { ...item.run.period, name: null } },
    } as never);

    expect(result.periodName).toBe('2026-07');
  });

  /*
   * ข้อสำคัญที่สุด: เงินสมทบฝั่งนายจ้างไม่ใช่เงินที่หักจากพนักงาน
   * ถ้าไปกองรวมกับรายการหัก ผู้ใช้จะอ่านว่าโดนหักประกันสังคมสองเท่า
   */
  it('เงินสมทบนายจ้างต้องแยกออกจากรายการหัก', () => {
    const result = toMobilePayslipDetail(item as never);

    expect(result.deductions).toEqual([
      { amount: 750, name: 'ประกันสังคม' },
    ]);
    expect(result.employerContributions).toEqual([
      { amount: 750, name: 'ประกันสังคม (นายจ้าง)' },
    ]);
  });

  it('บรรทัด INFO ต้องไม่ปนอยู่ในรายได้หรือรายการหัก', () => {
    const result = toMobilePayslipDetail(item as never);

    expect(result.earnings).toHaveLength(2);
    expect(result.deductions).toHaveLength(1);
    expect(result.notes).toHaveLength(1);
  });

  /* ชื่อ component เป็นชื่อทางการที่ HR ตั้งไว้ ต้องมาก่อนชื่อที่พิมพ์ตอนปรับยอด */
  it('ใช้ชื่อจาก component ก่อนชื่อในบรรทัด', () => {
    const result = toMobilePayslipDetail(item as never);

    expect(result.earnings[1]?.name).toBe('ค่าล่วงเวลา');
  });

  it('ยอดรวมต้องมาจาก field ของ backend ไม่ใช่บวกจากบรรทัดเอง', () => {
    /* จงใจให้ผลรวมของบรรทัดไม่ตรงกับ totalEarnings */
    const result = toMobilePayslipDetail({
      ...item,
      lines: [{ amount: '1', name: 'เงินเดือน', type: 'EARNING' }],
    } as never);

    expect(result.totalEarnings).toBe(16200);
  });

  it('สลิปที่ไม่มีบรรทัดเลยต้องไม่พัง', () => {
    const result = toMobilePayslipDetail({
      ...item,
      lines: null,
    } as never);

    expect(result.earnings).toEqual([]);
    expect(result.deductions).toEqual([]);
  });
});
