import { MobileRequestsController } from './mobile-requests.controller';

describe('MobileRequestsController', () => {
  const user = {
    id: 'user-1',
    email: 'employee@example.com',
    displayName: 'Employee',
    permissions: ['ESS_ACCESS'],
    roles: ['EMPLOYEE'],
    scope: { level: 'COMPANY', companyId: 'c1', branchId: null },
  } as never;

  function build() {
    const requests = {
      cancel: jest.fn(async () => ({ status: 'CANCELLED' })),
      create: jest.fn(async () => ({ id: 'req-1' })),
      deleteDraft: jest.fn(async () => ({ deleted: true })),
      detail: jest.fn(async () => ({ id: 'req-1' })),
      getLeaveCatalog: jest.fn(async () => ({ leaveTypes: [] })),
      list: jest.fn(async () => ({ items: [], meta: {} })),
      submit: jest.fn(async () => ({ status: 'SUBMITTED' })),
      update: jest.fn(async () => ({ status: 'DRAFT' })),
    };

    const idempotency = {
      executeOptional: jest.fn(async ({ handler }) => handler()),
    };

    return {
      controller: new MobileRequestsController(
        requests as never,
        idempotency as never,
      ),
      idempotency,
      requests,
    };
  }

  it('ส่ง submit=false ตอนสร้างร่างต่อ domain โดยไม่บังคับ submit=true', async () => {
    const { controller, requests } = build();

    await controller.createLeave(user, {
      leaveTypeId: 'lt-1',
      startDate: '2026-08-20',
      endDate: '2026-08-20',
      reason: 'พักรักษาตัว',
      submit: false,
    }, 'key-create');

    expect(requests.create).toHaveBeenCalledWith(
      'LEAVE',
      expect.objectContaining({ submit: false }),
      user,
    );
  });

  it('update/submit ใช้ type ที่ตายตัวของ route ไม่รับ type จาก body', async () => {
    const { controller, requests } = build();

    await controller.updateOvertime(user, 'ot-1', { reason: 'แก้ข้อมูล' }, 'key-update');
    await controller.submitOvertime(user, 'ot-1', 'key-submit');

    expect(requests.update).toHaveBeenCalledWith(
      'OVERTIME',
      'ot-1',
      { reason: 'แก้ข้อมูล' },
      user,
    );
    expect(requests.submit).toHaveBeenCalledWith('OVERTIME', 'ot-1', user);
  });

  it('เปิด delete route เฉพาะ Offsite', async () => {
    const { controller, requests } = build();

    await controller.deleteOffsite(user, 'os-1', 'key-delete');

    expect(requests.deleteDraft).toHaveBeenCalledWith('OFFSITE', 'os-1', user);
  });

  it('ส่ง idempotency key เข้า wrapper แต่ยังรองรับ build เก่าที่ไม่มี key', async () => {
    const { controller, idempotency } = build();

    await controller.submitLeave(user, 'leave-1', 'intent-key');
    await controller.submitLeave(user, 'leave-2', null);

    expect(idempotency.executeOptional).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ key: 'intent-key', userId: 'user-1' }),
    );
    expect(idempotency.executeOptional).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ key: null, userId: 'user-1' }),
    );
  });

});
