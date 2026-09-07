import {
  MOBILE_MAINTENANCE_JOB_PURGE_IDEMPOTENCY,
  MOBILE_MAINTENANCE_SCHEDULER_ID,
} from '../mobile.constants';
import { MobileMaintenanceService } from './mobile-maintenance.service';

/**
 * บทที่ 13.4 — งานล้าง Idempotency Record ที่หมดอายุ
 *
 * ข้อพลาดที่แพงที่สุดของงานประเภทนี้คือ "ลบเกิน" — ถ้าเผลอลบแถวที่ยังไม่หมดอายุ
 * เกราะกันลงเวลาซ้ำจะหายไปเงียบ ๆ และไปโผล่เป็นรายการซ้ำในระบบเงินเดือน
 */
describe('MobileMaintenanceService', () => {
  function buildService(env: Record<string, string> = {}) {
    const deleteMany = jest.fn(() => Promise.resolve({ count: 3 }));
    const upsertJobScheduler = jest.fn(() => Promise.resolve(undefined));

    const prisma = {
      mobileIdempotencyRecord: { deleteMany },
    };

    const configService = {
      get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback),
    };

    const service = new MobileMaintenanceService(
      prisma as never,
      configService as never,
      { upsertJobScheduler } as never,
    );

    return { deleteMany, service, upsertJobScheduler };
  }

  it('ลบเฉพาะแถวที่ expiresAt ผ่านมาแล้วเท่านั้น', async () => {
    const { deleteMany, service } = buildService();
    const now = new Date('2026-08-03T03:00:00.000Z');

    const result = await service.purgeExpiredIdempotencyRecords(now);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(result).toEqual({ deleted: 3 });
  });

  it('ตั้งตารางเวลาด้วย id คงที่ เพื่อให้หลาย instance ไม่สร้างงานซ้อนกัน', async () => {
    const { service, upsertJobScheduler } = buildService();

    await service.onModuleInit();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      MOBILE_MAINTENANCE_SCHEDULER_ID,
      { pattern: '0 3 * * *' },
      { name: MOBILE_MAINTENANCE_JOB_PURGE_IDEMPOTENCY },
    );
  });

  it('เปลี่ยนรอบเวลาได้ผ่าน env โดยไม่ต้องแก้โค้ด', async () => {
    const { service, upsertJobScheduler } = buildService({
      MOBILE_IDEMPOTENCY_CLEANUP_CRON: '30 4 * * *',
    });

    await service.onModuleInit();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      MOBILE_MAINTENANCE_SCHEDULER_ID,
      { pattern: '30 4 * * *' },
      expect.anything(),
    );
  });

  it('ปิดงานได้ด้วย env', async () => {
    const { service, upsertJobScheduler } = buildService({
      MOBILE_IDEMPOTENCY_CLEANUP_ENABLED: 'false',
    });

    await service.onModuleInit();

    expect(upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('Redis ล่มต้องไม่ทำให้ backend เปิดไม่ขึ้น', async () => {
    const { service, upsertJobScheduler } = buildService();

    upsertJobScheduler.mockRejectedValue(new Error('redis down'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
