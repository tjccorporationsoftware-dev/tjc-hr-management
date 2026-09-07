import { ConflictException } from '@nestjs/common';

import { MobileIdempotencyService } from './mobile-idempotency.service';

/**
 * BE-MOB-005 — ซองกัน mutation ซ้ำ
 *
 * เคสที่ต้องกันจริง: แอปกดลงเวลา เน็ตหลุดตอนรอ response แล้วกดซ้ำ
 * ถ้าไม่มีซองนี้ พนักงานจะได้ log สองรายการในรอบเดียว ซึ่งจะไปโผล่เป็น
 * เวลาทำงานผิดในสรุปรายวันและตัวเลขที่ส่งเข้า payroll
 */
describe('MobileIdempotencyService', () => {
  const scope = 'attendance:punch';
  const userId = 'user-1';
  const key = 'key-1';
  const futureExpiry = () => new Date(Date.now() + 60_000);

  function buildService(existingRecord: unknown) {
    const prisma = {
      mobileIdempotencyRecord: {
        findUnique: jest.fn(async () => existingRecord),
        create: jest.fn(
          async (_args: { data: { requestHash: string } }) => ({
            id: 'record-1',
          }),
        ),
        update: jest.fn(async () => ({ id: 'record-1' })),
        delete: jest.fn(async () => ({ id: 'record-1' })),
      },
    };

    const service = new MobileIdempotencyService(prisma as never, {
      get: jest.fn(() => '48'),
    } as never);

    return { prisma, service };
  }

  /** ดึง hash ที่ service คำนวณจาก payload ชุดหนึ่ง โดยไม่ผูกกับสูตร hash ในโค้ด */
  async function hashOf(payload: unknown) {
    const { prisma, service } = buildService(null);
    await service.begin({ key, requestPayload: payload, scope, userId });

    const call = prisma.mobileIdempotencyRecord.create.mock.calls[0]?.[0];

    if (!call) {
      throw new Error('service ต้องเรียก create เพื่อเริ่มรอบใหม่');
    }

    return call.data.requestHash;
  }

  it('ยังไม่เคยมี key นี้ ให้เริ่มรอบใหม่', async () => {
    const { service, prisma } = buildService(null);

    const result = await service.begin({
      key,
      requestPayload: { punchType: 'MORNING_IN' },
      scope,
      userId,
    });

    expect(result).toEqual({ status: 'STARTED', recordId: 'record-1' });
    expect(prisma.mobileIdempotencyRecord.create).toHaveBeenCalledTimes(1);
  });

  it('key เดิม payload เดิม และทำเสร็จแล้ว ต้องคืนผลเดิมโดยไม่ทำงานซ้ำ', async () => {
    const payload = { punchType: 'MORNING_IN' };
    const { service, prisma } = buildService({
      completedAt: new Date(),
      expiresAt: futureExpiry(),
      id: 'record-1',
      requestHash: await hashOf(payload),
      responseBody: { attendanceLogId: 'log-1' },
    });

    const result = await service.begin({
      key,
      requestPayload: payload,
      scope,
      userId,
    });

    expect(result).toEqual({
      status: 'REPLAY',
      responseBody: { attendanceLogId: 'log-1' },
    });
    expect(prisma.mobileIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('key เดิมแต่ payload ต่าง ต้องเป็น IDEMPOTENCY_CONFLICT', async () => {
    const { service } = buildService({
      completedAt: new Date(),
      expiresAt: futureExpiry(),
      id: 'record-1',
      requestHash: await hashOf({ punchType: 'MORNING_IN' }),
      responseBody: {},
    });

    await expect(
      service.begin({
        key,
        requestPayload: { punchType: 'CHECK_OUT' },
        scope,
        userId,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('คำขอเดิมยังทำไม่เสร็จ ต้องบอกให้ไปเช็คสถานะ ไม่ใช่ทำซ้ำ', async () => {
    const payload = { punchType: 'MORNING_IN' };
    const { service } = buildService({
      completedAt: null,
      expiresAt: futureExpiry(),
      id: 'record-1',
      requestHash: await hashOf(payload),
      responseBody: null,
    });

    await expect(
      service.begin({ key, requestPayload: payload, scope, userId }),
    ).rejects.toThrow(ConflictException);
  });

  it('ลำดับ key ใน JSON ต่างกัน ต้องถือเป็นคำขอเดียวกัน', async () => {
    const left = await hashOf({ a: 1, b: { c: 2, d: 3 } });
    const right = await hashOf({ b: { d: 3, c: 2 }, a: 1 });

    expect(left).toBe(right);
  });

  it('record ที่หมดอายุแล้ว ต้องเริ่มรอบใหม่บนแถวเดิม', async () => {
    const { service, prisma } = buildService({
      completedAt: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
      id: 'record-1',
      requestHash: 'hash-เก่า',
      responseBody: {},
    });

    const result = await service.begin({
      key,
      requestPayload: { punchType: 'MORNING_IN' },
      scope,
      userId,
    });

    expect(result.status).toBe('STARTED');
    expect(prisma.mobileIdempotencyRecord.update).toHaveBeenCalledTimes(1);
    expect(prisma.mobileIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('release ต้องลบ record ทิ้ง ไม่ให้ผู้ใช้ติด 409 ค้างทั้งที่ยังไม่มีรายการถูกบันทึก', async () => {
    const { service, prisma } = buildService(null);

    await service.release('record-1');

    expect(prisma.mobileIdempotencyRecord.delete).toHaveBeenCalledWith({
      where: { id: 'record-1' },
    });
  });

  it('executeOptional ไม่มี key ต้องทำงานแบบ build เก่าโดยไม่สร้าง record', async () => {
    const { service, prisma } = buildService(null);
    const handler = jest.fn(async () => ({ ok: true }));

    await expect(
      service.executeOptional({
        handler,
        key: null,
        requestPayload: { action: 'create' },
        scope: 'requests:mutation',
        userId,
      }),
    ).resolves.toEqual({ ok: true });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(prisma.mobileIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('executeOptional key เดิมที่สำเร็จต้อง replay และไม่เรียก handler ซ้ำ', async () => {
    const payload = { action: 'approve', id: 'req-1' };
    const { service } = buildService({
      completedAt: new Date(),
      expiresAt: futureExpiry(),
      id: 'record-1',
      requestHash: await hashOf(payload),
      responseBody: { status: 'APPROVED' },
    });
    const handler = jest.fn(async () => ({ status: 'APPROVED' }));

    await expect(
      service.executeOptional({
        handler,
        key,
        requestPayload: payload,
        scope: 'approvals:mutation',
        userId,
      }),
    ).resolves.toEqual({ status: 'APPROVED' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('executeOptional ต้อง release key เมื่อ domain mutation fail', async () => {
    const { service, prisma } = buildService(null);

    await expect(
      service.executeOptional({
        handler: async () => {
          throw new Error('domain failed');
        },
        key,
        requestPayload: { action: 'submit' },
        scope: 'requests:mutation',
        userId,
      }),
    ).rejects.toThrow('domain failed');

    expect(prisma.mobileIdempotencyRecord.delete).toHaveBeenCalledWith({
      where: { id: 'record-1' },
    });
  });


  it('complete fail หลัง domain สำเร็จต้องไม่ release key เพื่อกัน mutation ซ้ำ', async () => {
    const { service, prisma } = buildService(null);
    prisma.mobileIdempotencyRecord.update.mockRejectedValueOnce(
      new Error('complete failed'),
    );

    await expect(
      service.executeOptional({
        handler: async () => ({ id: 'req-1' }),
        key,
        requestPayload: { action: 'create' },
        scope: 'requests:mutation',
        userId,
      }),
    ).rejects.toThrow('complete failed');

    expect(prisma.mobileIdempotencyRecord.delete).not.toHaveBeenCalled();
  });

});
