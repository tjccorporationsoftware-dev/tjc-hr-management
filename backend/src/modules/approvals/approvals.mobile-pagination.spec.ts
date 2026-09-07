import { ApprovalsService } from './approvals.service';

/**
 * Mobile pagination ต้องไม่ย้อนกลับไปใช้ Approval Center ที่โหลด source ละ 5000
 * และต้องขอเพียง top window ที่จำเป็นต่อหน้าปัจจุบันเท่านั้น
 */
describe('ApprovalsService.findMobileApprovals', () => {
  function build() {
    const service = new ApprovalsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const target = service as any;

    target.resolveApproverEmployee = jest.fn(async () => ({
      id: 'manager-1',
      companyId: 'company-1',
      positionId: null,
      userId: 'user-1',
    }));
    target.getActorId = jest.fn(() => 'user-1');
    target.resolveActorRoleCodes = jest.fn(async () => ['MANAGER']);

    const sourceResult = (type: string) => ({
      items: [
        {
          createdAt: new Date('2026-08-20T01:00:00.000Z'),
          id: `${type}-1`,
          submittedAt: new Date('2026-08-20T02:00:00.000Z'),
          type,
        },
      ],
      total: 1,
      totalExact: true,
    });

    target.findMobileLeaveItems = jest.fn(async () => sourceResult('LEAVE'));
    target.findMobileOvertimeItems = jest.fn(async () =>
      sourceResult('OVERTIME'),
    );
    target.findMobileTimeAdjustItems = jest.fn(async () =>
      sourceResult('TIME_ADJUST'),
    );
    target.findMobileOffsiteItems = jest.fn(async () =>
      sourceResult('OFFSITE'),
    );
    target.findMobileDocumentItems = jest.fn(async () =>
      sourceResult('DOCUMENT'),
    );

    return { service, target };
  }

  it('หน้า 2 ขนาด 10 ต้องขอ top 21 ต่อ source ไม่ใช่ 5000', async () => {
    const { service, target } = build();

    await service.findMobileApprovals({ id: 'user-1' }, {
      page: 2,
      pageSize: 10,
      type: 'ALL',
    });

    for (const name of [
      'findMobileLeaveItems',
      'findMobileOvertimeItems',
      'findMobileTimeAdjustItems',
      'findMobileOffsiteItems',
      'findMobileDocumentItems',
    ]) {
      expect(target[name]).toHaveBeenCalled();
      const firstCall = target[name].mock.calls[0] ?? [];
      expect(firstCall[firstCall.length - 1]).toBe(21);
    }
  });


  it('read scope ของ detail/history ต้องใช้ ALL-visible guard ไม่ใช่ pending-only action guard', async () => {
    const { service, target } = build();
    target.ensureLeaveRequestVisibleInScope = jest.fn(async () => ({
      id: 'leave-history-1',
    }));
    target.ensureLeaveRequestInScope = jest.fn(async () => ({
      id: 'leave-history-1',
    }));

    await service.ensureApprovalInScope(
      { id: 'user-1' },
      'LEAVE',
      'leave-history-1',
    );

    expect(target.ensureLeaveRequestVisibleInScope).toHaveBeenCalledWith(
      'leave-history-1',
      expect.objectContaining({ companyId: 'company-1' }),
      'user-1',
    );
    expect(target.ensureLeaveRequestInScope).not.toHaveBeenCalled();
  });

  it('เลือกประเภทเดียวต้องไม่ query source อื่น และส่ง search/date/status ต่อครบ', async () => {
    const { service, target } = build();

    await service.findMobileApprovals({ id: 'user-1' }, {
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      page: 1,
      pageSize: 20,
      q: 'สมชาย',
      status: 'APPROVED',
      type: 'LEAVE',
    });

    expect(target.findMobileLeaveItems).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1' }),
      'user-1',
      'APPROVED',
      'สมชาย',
      '2026-08-01',
      '2026-08-31',
      21,
    );
    expect(target.findMobileOvertimeItems).not.toHaveBeenCalled();
    expect(target.findMobileTimeAdjustItems).not.toHaveBeenCalled();
    expect(target.findMobileOffsiteItems).not.toHaveBeenCalled();
  });

  it('นับ pending badge จาก scope เดียวกับ Mobile inbox โดยไม่ใช้ sourceFetchLimit ของเว็บ', async () => {
    const { service, target } = build();
    target.countMobilePendingOffsiteItems = jest.fn(async () => 3);

    const count = await service.countMobilePendingApprovals({ id: 'user-1' });

    expect(count).toBe(6);
    expect(target.findMobileLeaveItems).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1' }),
      'user-1',
      'SUBMITTED',
      undefined,
      undefined,
      undefined,
      1,
    );
    expect(target.countMobilePendingOffsiteItems).toHaveBeenCalled();
  });

});
