import { MobileComplaintsController } from './mobile-complaints.controller';

describe('MobileComplaintsController', () => {
  const user = { id: 'user-1' } as never;

  it('detail ใช้ identity จาก token และ id ของเรื่องเท่านั้น', async () => {
    const complaints = { detail: jest.fn(async () => ({ id: 'cmp-1' })) };
    const controller = new MobileComplaintsController(
      complaints as never,
      { executeOptional: jest.fn(async ({ handler }) => handler()) } as never,
    );

    await controller.detail(user, 'cmp-1');

    expect(complaints.detail).toHaveBeenCalledWith(user, 'cmp-1');
  });

  it('cancel ส่งเฉพาะ note ที่ client ระบุให้ ESS service ตัดสินสถานะ', async () => {
    const complaints = { cancel: jest.fn(async () => ({ id: 'cmp-1' })) };
    const controller = new MobileComplaintsController(
      complaints as never,
      { executeOptional: jest.fn(async ({ handler }) => handler()) } as never,
    );

    await controller.cancel(user, 'cmp-1', { note: 'ยื่นผิดเรื่อง' }, 'cmp-key');

    expect(complaints.cancel).toHaveBeenCalledWith(user, 'cmp-1', {
      note: 'ยื่นผิดเรื่อง',
    });
  });

  it('create ใช้ idempotency wrapper แต่ไม่บังคับ key สำหรับ build เก่า', async () => {
    const complaints = { create: jest.fn(async () => ({ id: 'cmp-1' })) };
    const idempotency = { executeOptional: jest.fn(async ({ handler }) => handler()) };
    const controller = new MobileComplaintsController(
      complaints as never,
      idempotency as never,
    );

    await controller.create(
      user,
      { category: 'GENERAL', description: 'รายละเอียด', subject: 'หัวข้อ' } as never,
      null,
    );

    expect(idempotency.executeOptional).toHaveBeenCalledWith(
      expect.objectContaining({ key: null, userId: 'user-1' }),
    );
  });

});
