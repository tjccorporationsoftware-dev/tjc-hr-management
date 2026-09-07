import { MobilePushService } from './mobile-push.service';

/**
 * Push เป็นของเสริม — กฎที่ห้ามหลุดคือ **ห้ามทำให้ธุรกรรมหลักล้ม**
 * การแจ้งเตือนถูกบันทึกลงตารางไปแล้วก่อนถึงที่นี่ ต่อให้ Expo ล่มทั้งวัน
 * ผู้ใช้เปิดแอปก็ยังเห็นแจ้งเตือนครบ
 */
describe('MobilePushService', () => {
  const payload = {
    entityId: 'leave-1',
    entityType: 'LeaveRequest',
    message: 'หัวหน้าอนุมัติใบลาของคุณแล้ว',
    title: 'อนุมัติแล้ว',
    type: 'LEAVE_APPROVED',
    userIds: ['user-1'],
  };

  function build(options: {
    devices?: { expoPushToken: string | null; id: string }[];
    fetchImpl?: jest.Mock;
  } = {}) {
    const prisma = {
      mobileDevice: {
        findMany: jest.fn(
          async (_args: { where?: Record<string, unknown> }) =>
            options.devices ?? [],
        ),
        updateMany: jest.fn(async (_args: Record<string, unknown>) => ({
          count: 0,
        })),
      },
    };

    const notifications = { setPushDispatcher: jest.fn() };

    global.fetch =
      options.fetchImpl ??
      (jest.fn(async () => ({
        json: async () => ({ data: [{ status: 'ok' }] }),
        ok: true,
        status: 200,
      })) as unknown as typeof fetch);

    /* ค่าเริ่มต้นของการตั้งค่าคือ "เปิดทุกหมวด" — เทสชุดนี้ไม่ได้ทดสอบตัวกรอง */
    const preferences = {
      allowedUserIds: jest.fn(async (userIds: string[]) => userIds),
    };

    return {
      notifications,
      preferences,
      prisma,
      service: new MobilePushService(
        prisma as never,
        notifications as never,
        preferences as never,
      ),
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ลงทะเบียนตัวเองเป็นตัวส่ง push ตอนโมดูลเริ่มทำงาน', () => {
    const { service, notifications } = build();

    service.onModuleInit();

    expect(notifications.setPushDispatcher).toHaveBeenCalledTimes(1);
  });

  it('ไม่มีเครื่องที่เปิดแจ้งเตือน ต้องไม่ยิงเน็ตเลย', async () => {
    const { service } = build({ devices: [] });

    await service.dispatch(payload);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  /* เครื่องที่ถูกถอนสิทธิ์หรือปิดแจ้งเตือนต้องไม่ได้รับข้อความ */
  it('ต้องคัดเฉพาะเครื่องที่ยังใช้งานอยู่และอนุญาตแจ้งเตือน', async () => {
    const { service, prisma } = build({
      devices: [{ expoPushToken: 'ExponentPushToken[a]', id: 'd1' }],
    });

    await service.dispatch(payload);

    const where = prisma.mobileDevice.findMany.mock.calls[0]?.[0]?.where;

    expect(where).toMatchObject({
      expoPushToken: { not: null },
      notificationPermission: 'GRANTED',
      revokedAt: null,
      userId: { in: ['user-1'] },
    });
  });

  it('ต้องแนบ entityId และประเภทคำขอไปกับข้อความเพื่อให้แตะแล้วเปิดใบได้', async () => {
    const { service } = build({
      devices: [{ expoPushToken: 'ExponentPushToken[a]', id: 'd1' }],
    });

    await service.dispatch(payload);

    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0]?.[1]?.body as string,
    );

    expect(body[0]).toMatchObject({
      body: payload.message,
      data: {
        entityId: 'leave-1',
        entityType: 'LeaveRequest',
        notificationType: 'LEAVE_APPROVED',
        requestType: 'LEAVE',
      },
      title: payload.title,
      to: 'ExponentPushToken[a]',
    });
  });

  /* entityType ที่ไม่รู้จักต้องไม่ทำให้แอปพาไปจอมั่ว */
  it('entityType ที่ยังไม่รองรับ ต้องส่ง requestType เป็น null', async () => {
    const { service } = build({
      devices: [{ expoPushToken: 'ExponentPushToken[a]', id: 'd1' }],
    });

    await service.dispatch({ ...payload, entityType: 'PayrollRun' });

    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0]?.[1]?.body as string,
    );

    expect(body[0].data).toMatchObject({
      entityId: 'leave-1',
      entityType: 'PayrollRun',
      notificationType: 'LEAVE_APPROVED',
      requestType: null,
    });
  });

  it('Expo ตอบ error ต้องไม่โยน error ออกไป', async () => {
    const { service } = build({
      devices: [{ expoPushToken: 'ExponentPushToken[a]', id: 'd1' }],
      fetchImpl: jest.fn(async () => ({
        json: async () => ({}),
        ok: false,
        status: 500,
      })) as unknown as jest.Mock,
    });

    await expect(service.dispatch(payload)).resolves.toBeUndefined();
  });

  it('เน็ตล่มต้องไม่โยน error ออกไป', async () => {
    const { service } = build({
      devices: [{ expoPushToken: 'ExponentPushToken[a]', id: 'd1' }],
      fetchImpl: jest.fn(async () => {
        throw new Error('network down');
      }) as unknown as jest.Mock,
    });

    await expect(service.dispatch(payload)).resolves.toBeUndefined();
  });

  /*
   * token ตายแล้วไม่ล้างทิ้ง จะยิงซ้ำทุกครั้งจนโดน Expo จำกัดอัตรา
   * แล้วกระทบคนที่ยังใช้งานอยู่จริง
   */
  it('token ที่ Expo บอกว่าเครื่องถอนแอปแล้ว ต้องถูกล้างทิ้ง', async () => {
    const { service, prisma } = build({
      devices: [
        { expoPushToken: 'ExponentPushToken[dead]', id: 'd1' },
        { expoPushToken: 'ExponentPushToken[ok]', id: 'd2' },
      ],
      fetchImpl: jest.fn(async () => ({
        json: async () => ({
          data: [
            { details: { error: 'DeviceNotRegistered' }, status: 'error' },
            { status: 'ok' },
          ],
        }),
        ok: true,
        status: 200,
      })) as unknown as jest.Mock,
    });

    await service.dispatch(payload);

    expect(prisma.mobileDevice.updateMany).toHaveBeenCalledWith({
      data: { expoPushToken: null, pushStatus: 'UNKNOWN' },
      where: { id: { in: ['d1'] } },
    });
  });

  it('error อื่นที่ไม่ใช่ DeviceNotRegistered ต้องไม่ล้าง token ทิ้ง', async () => {
    const { service, prisma } = build({
      devices: [{ expoPushToken: 'ExponentPushToken[a]', id: 'd1' }],
      fetchImpl: jest.fn(async () => ({
        json: async () => ({
          data: [{ details: { error: 'MessageRateExceeded' }, status: 'error' }],
        }),
        ok: true,
        status: 200,
      })) as unknown as jest.Mock,
    });

    await service.dispatch(payload);

    expect(prisma.mobileDevice.updateMany).not.toHaveBeenCalled();
  });

  it('ไม่มีผู้รับเลย ต้องออกทันทีโดยไม่แตะฐานข้อมูล', async () => {
    const { service, prisma } = build();

    await service.dispatch({ ...payload, userIds: [] });

    expect(prisma.mobileDevice.findMany).not.toHaveBeenCalled();
  });
});
