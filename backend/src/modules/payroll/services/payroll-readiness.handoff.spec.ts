import { PayrollReadinessService } from './payroll-readiness.service';

/**
 * ใบลา/OT ที่อนุมัติแล้วต้องผ่านหน้า HR Review ก่อนถึงจะเข้า Payroll
 *
 * payroll-handoff-import อ่านเฉพาะ hr_review_items ที่ PAYROLL_READY หรือ
 * SENT_TO_PAYROLL ถ้าข้ามขั้นนี้ ระบบยังคำนวณเงินเดือนได้และไม่มีด่านไหนเตือน
 * แต่จำนวนวันลาบนสลิปจะเป็น 0 ทั้งที่พนักงานลาจริง
 */
type Finder = {
  findApprovedSourcesMissingHandoff(params: {
    companyId: string;
    employeeIds: string[];
    periodId: string;
    payrollRunId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<Array<{ sourceType: string; sourceId: string; label: string }>>;
};

describe('PayrollReadinessService · ใบลา/OT ที่ยังไม่ส่งเข้า Payroll', () => {
  const build = (opts: {
    leaves?: unknown[];
    overtimes?: unknown[];
    readyItems?: unknown[];
  }) => {
    const service = Object.create(
      PayrollReadinessService.prototype,
    ) as unknown as Finder & { prisma: unknown };

    (service as { prisma: unknown }).prisma = {
      leaveRequest: { findMany: jest.fn().mockResolvedValue(opts.leaves ?? []) },
      overtimeRequest: {
        findMany: jest.fn().mockResolvedValue(opts.overtimes ?? []),
      },
      hrReviewItem: {
        findMany: jest.fn().mockResolvedValue(opts.readyItems ?? []),
      },
    };

    return service;
  };

  const params = {
    companyId: 'com-1',
    employeeIds: ['emp-1'],
    periodId: 'per-1',
    payrollRunId: 'run-1',
    periodStart: new Date('2026-06-26'),
    periodEnd: new Date('2026-07-25'),
  };

  const leave = {
    id: 'lv-1',
    employeeId: 'emp-1',
    startDate: new Date('2026-07-02'),
    requestNo: 'LV-0001',
    leaveType: { nameTh: 'ลาป่วย', code: 'SICK_CERTIFIED' },
  };
  const overtime = {
    id: 'ot-1',
    employeeId: 'emp-1',
    workDate: new Date('2026-07-15'),
    requestNo: 'OT-0001',
  };

  it('ยังไม่ส่งเข้า Payroll เลย = รายงานทั้งใบลาและ OT', async () => {
    const service = build({ leaves: [leave], overtimes: [overtime] });
    const result = await service.findApprovedSourcesMissingHandoff(params);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.sourceType).sort()).toEqual(['LEAVE', 'OVERTIME']);
    expect(result[0].label).toContain('ลาป่วย');
  });

  it('ส่งเข้า Payroll แล้วบางส่วน = รายงานเฉพาะที่เหลือ', async () => {
    const service = build({
      leaves: [leave],
      overtimes: [overtime],
      readyItems: [{ sourceType: 'LEAVE', sourceId: 'lv-1' }],
    });
    const result = await service.findApprovedSourcesMissingHandoff(params);

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe('OVERTIME');
  });

  it('ส่งครบแล้ว = ไม่มีรายการค้าง', async () => {
    const service = build({
      leaves: [leave],
      overtimes: [overtime],
      readyItems: [
        { sourceType: 'LEAVE', sourceId: 'lv-1' },
        { sourceType: 'OVERTIME', sourceId: 'ot-1' },
      ],
    });

    expect(await service.findApprovedSourcesMissingHandoff(params)).toEqual([]);
  });

  it('ไม่มีใบลา/OT ที่อนุมัติในงวด = ไม่มีรายการค้าง', async () => {
    const service = build({});
    expect(await service.findApprovedSourcesMissingHandoff(params)).toEqual([]);
  });
});
