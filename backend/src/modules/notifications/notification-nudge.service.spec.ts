import { NotificationNudgeService } from './notification-nudge.service';

/**
 * งานสะกิดต้องยิงถูกคน ถูกครั้ง และดับเงียบเมื่อไม่มีอะไรต้องบอก
 *
 * เทสนี้ไม่แตะฐานข้อมูลจริง — สนใจว่าเงื่อนไขคัดเลือกกับข้อความที่ส่งถูกไหม
 * เพราะสองอย่างนี้คือสิ่งที่ผู้ใช้เห็นบนหน้าจอล็อกจริง ๆ
 */

function buildService(overrides: {
  leaveRequests?: unknown[];
  notificationGroups?: { _count: { _all: number }; userId: string }[];
  payrollItems?: unknown[];
  payrollRuns?: unknown[];
}) {
  const notifyNudge = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    leaveRequest: {
      findMany: jest.fn().mockResolvedValue(overrides.leaveRequests ?? []),
    },
    notification: {
      groupBy: jest.fn().mockResolvedValue(overrides.notificationGroups ?? []),
    },
    payrollItem: {
      findMany: jest.fn().mockResolvedValue(overrides.payrollItems ?? []),
    },
    payrollRun: {
      findMany: jest.fn().mockResolvedValue(overrides.payrollRuns ?? []),
    },
  };

  const service = new NotificationNudgeService(
    prisma as never,
    {
      notifyNudge,
    } as never,
  );

  return { notifyNudge, prisma, service };
}

describe('NotificationNudgeService', () => {
  it('เด้งบอกสลิปใหม่ให้พนักงานที่มีรายการในงวดที่เปิดแล้ว', async () => {
    const { notifyNudge, service } = buildService({
      payrollItems: [
        { employee: { id: 'emp-1', userId: 'user-1' }, id: 'item-1' },
        /* ไม่มีบัญชีผู้ใช้ = ยังไม่ได้เปิดแอป ไม่มีที่ให้เด้ง */
        { employee: { id: 'emp-2', userId: null }, id: 'item-2' },
      ],
      payrollRuns: [
        { id: 'run-1', period: { code: '2026-08', name: 'งวด ส.ค. 2569' } },
      ],
    });

    const result = await service.syncPayslipReadyNudges(new Date());

    expect(result.notifiedCount).toBe(1);
    expect(notifyNudge).toHaveBeenCalledTimes(1);
    expect(notifyNudge).toHaveBeenCalledWith(
      ['user-1'],
      expect.objectContaining({
        sourceKey: 'nudge:payslip-ready:run-1:emp-1',
        type: 'PAYSLIP_READY',
      }),
    );
  });

  it('รวมใบค้างของคนเดียวกันเป็นข้อความเดียว ไม่เด้งทีละใบ', async () => {
    const { notifyNudge, service } = buildService({
      notificationGroups: [{ _count: { _all: 4 }, userId: 'boss-1' }],
    });

    const result = await service.syncStaleApprovalNudges(
      new Date('2026-09-06T08:30:00'),
    );

    expect(result.notifiedCount).toBe(1);
    expect(notifyNudge).toHaveBeenCalledTimes(1);
    expect(notifyNudge.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('4 รายการ'),
        type: 'APPROVAL_QUEUE_STALE',
      }),
    );
  });

  it('บอกหัวหน้าเมื่อลูกทีมเริ่มลาพรุ่งนี้ และข้ามคนที่ไม่มีหัวหน้า', async () => {
    const { notifyNudge, service } = buildService({
      leaveRequests: [
        {
          employee: {
            displayName: 'สมชาย ใจดี',
            firstName: 'สมชาย',
            lastName: 'ใจดี',
            supervisor: { id: 'boss-1', userId: 'boss-user-1' },
          },
          endDate: new Date('2026-09-08'),
          id: 'leave-1',
          leaveType: { nameTh: 'ลาพักร้อน' },
        },
        {
          employee: {
            displayName: 'ไม่มีหัวหน้า',
            firstName: null,
            lastName: null,
            supervisor: null,
          },
          endDate: new Date('2026-09-08'),
          id: 'leave-2',
          leaveType: { nameTh: 'ลากิจ' },
        },
      ],
    });

    const result = await service.syncLeaveStartingTomorrowNudges(
      new Date('2026-09-06T08:30:00'),
    );

    expect(result.notifiedCount).toBe(1);
    expect(notifyNudge).toHaveBeenCalledWith(
      ['boss-user-1'],
      expect.objectContaining({
        message: expect.stringContaining('สมชาย ใจดี'),
        sourceKey: 'nudge:leave-tomorrow:leave-1',
      }),
    );
  });

  it('ไม่มีอะไรต้องบอกก็ไม่เด้ง', async () => {
    const { notifyNudge, service } = buildService({});

    await service.syncDailyNudges(new Date());

    expect(notifyNudge).not.toHaveBeenCalled();
  });
});
