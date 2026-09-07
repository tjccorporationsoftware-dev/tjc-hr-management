import { PayrollAttendanceDeductionImportService } from './payroll-attendance-deduction-import.service';

/**
 * รายการหักจากเวลาทำงานต้องลดฐานภาษีให้ถูก
 *
 * เดิมธง isTaxable / isSocialSecurityBase มาจาก attendance_payroll_rules อย่างเดียว
 * บริษัทที่ยังไม่ได้ตั้งกฎ (สถานะเริ่มต้นของทุกบริษัทใหม่) จะได้ false ทั้งหมด
 * กลายเป็นเก็บภาษีจากค่าจ้างที่ลูกจ้างไม่ได้รับ
 *
 * ฐานประกันสังคมเป็นคนละเรื่อง — ผู้ใช้เลือกให้คิดเงินสมทบจากเงินเดือนเต็ม
 * ค่าตั้งต้นจึงเป็น false และตั้งทับได้ที่ attendance_payroll_rules
 */
describe('PayrollAttendanceDeductionImportService · ฐานภาษี/ประกันสังคมของรายการหัก', () => {
  const service = new PayrollAttendanceDeductionImportService();

  const summaryRow = (over: Record<string, unknown> = {}) => ({
    id: 'sum-1',
    employeeId: 'emp-1',
    workDate: new Date('2026-07-07'),
    morningInAt: null,
    afternoonInAt: null,
    checkOutAt: null,
    totalLateMinutes: 0,
    isMorningMissing: false,
    isAfternoonMissing: false,
    isCheckoutMissing: false,
    hasMissingLog: false,
    latePenaltyAmount: 0,
    missingLogPenaltyAmount: 0,
    isAbsent: false,
    absentDays: 0,
    absentDeductionAmount: 0,
    unpaidLeaveDeductionAmount: 0,
    earlyCheckoutMinutes: 0,
    earlyCheckoutPenaltyAmount: 0,
    totalDeductionAmount: 0,
    leaveIsPaid: null,
    leaveDurationDays: 0,
    lockedAt: new Date('2026-07-26'),
    ...over,
  });

  const txWith = (rows: unknown[]) =>
    ({
      attendanceDailySummary: { findMany: jest.fn().mockResolvedValue(rows) },
    }) as never;

  const collect = (rows: unknown[], extra: Record<string, unknown> = {}) =>
    service.collectEmployeeAttendanceDeductions(txWith(rows), {
      companyId: 'com-1',
      employeeId: 'emp-1',
      periodStartDate: new Date('2026-06-26'),
      periodEndDate: new Date('2026-07-25'),
      baseSalary: 14400,
      activeRules: [],
      activeComponents: [],
      ...extra,
    });

  const absenceComponent = {
    id: 'comp-absence',
    code: 'ABSENCE_DEDUCTION',
    isTaxable: true,
    isSocialSecurityBase: true,
    sortOrder: 630,
  };

  it('ยังไม่ตั้งกฎ แต่มี PayrollComponent → ใช้ธงจาก component', async () => {
    const result = await collect(
      [summaryRow({ isAbsent: true, absentDays: 1, absentDeductionAmount: 480 })],
      { activeComponents: [absenceComponent] },
    );

    const line = result.deductionLines.find((l) => l.code === 'ABSENCE_DEDUCTION');
    expect(line?.amount).toBe(480);
    expect(line?.isSocialSecurityBase).toBe(true);
    expect(line?.isTaxable).toBe(true);
    expect(line?.componentId).toBe('comp-absence');
  });

  it('ตั้งกฎไว้แล้ว → กฎชนะ component', async () => {
    const result = await collect(
      [summaryRow({ isAbsent: true, absentDays: 1, absentDeductionAmount: 480 })],
      {
        activeComponents: [absenceComponent],
        activeRules: [
          {
            id: 'rule-1',
            code: 'ATT-ABSENCE',
            name: 'หักขาดงาน',
            kind: 'ABSENCE',
            componentId: 'comp-from-rule',
            componentCode: 'ABSENCE_DEDUCTION',
            isTaxable: false,
            isSocialSecurityBase: false,
            sortOrder: 10,
          },
        ],
      },
    );

    const line = result.deductionLines.find((l) => l.code === 'ABSENCE_DEDUCTION');
    expect(line?.isSocialSecurityBase).toBe(false);
    expect(line?.componentId).toBe('comp-from-rule');
  });

  it('ลาไม่รับค่าจ้างลดฐานภาษี แต่ไม่ลดฐานประกันสังคมเป็นค่าตั้งต้น', async () => {
    const result = await collect([
      summaryRow({
        leaveIsPaid: false,
        leaveDurationDays: 1,
        unpaidLeaveDeductionAmount: 400,
      }),
    ]);

    const line = result.deductionLines.find(
      (l) => l.code === 'ATTENDANCE_UNPAID_LEAVE_DEDUCTION',
    );
    expect(line?.amount).toBe(400);
    expect(line?.isTaxable).toBe(true);
    // เงินสมทบคิดจากเงินเดือนเต็ม วันที่ไม่ได้ทำงานจึงไม่ลดฐาน
    expect(line?.isSocialSecurityBase).toBe(false);
  });

  describe('จำนวนวันทำงานจริง', () => {
    it('นับเฉพาะวันที่มีการสแกนและไม่ได้ขาดงาน', async () => {
      const result = await collect([
        summaryRow({ id: 's1', morningInAt: new Date('2026-06-29T01:30:00Z') }),
        summaryRow({ id: 's2', checkOutAt: new Date('2026-06-30T10:30:00Z') }),
        // วันหยุด/วันลา ไม่มีการสแกน
        summaryRow({ id: 's3' }),
        // ขาดงาน
        summaryRow({ id: 's4', isAbsent: true, absentDays: 1 }),
      ]);

      expect(result.workedDays).toBe(2);
    });

    it('ไม่มีการสแกนเลยทั้งงวด = 0 วัน', async () => {
      const result = await collect([summaryRow(), summaryRow({ id: 's2' })]);
      expect(result.workedDays).toBe(0);
    });
  });
});
