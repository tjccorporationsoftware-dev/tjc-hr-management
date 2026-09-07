import { BadRequestException } from '@nestjs/common';

import { PayrollService } from '../payroll.service';

/**
 * ขอบเขตสาขาของรอบคำนวณเงินเดือน
 *
 * กติกาที่ห้ามหลุด — **ไม่เลือกสาขา = ต้องได้ทั้งบริษัทเหมือนเดิมเป๊ะ**
 * รอบเก่าทุกรอบที่สร้างก่อนมีฟิลด์นี้มี branchIds เป็น array ว่าง
 * ถ้าเผลอใส่เงื่อนไข `branchId: { in: [] }` เข้าไป Prisma จะคืน 0 แถว
 * แปลว่าเงินเดือนทั้งบริษัทหายไปเงียบ ๆ
 */
describe('PayrollService · ขอบเขตสาขาของรอบ', () => {
  function buildService(options: { branchesInCompany?: string[] } = {}) {
    const findMany = jest.fn(async (_args: Record<string, unknown>) => []);

    const prisma = {
      branch: {
        findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
          args.where.id.in
            .filter((id) => (options.branchesInCompany ?? []).includes(id))
            .map((id) => ({ id })),
        ),
      },
      employeeCompensation: { findMany },
    };

    /*
     * เทสนี้แตะเฉพาะเมธอดที่ใช้ prisma ตัวเดียว จึงสร้าง instance ตรง ๆ
     * โดยไม่ผ่าน Nest DI — dependency ตัวอื่นไม่ถูกเรียกในเส้นทางที่ทดสอบ
     */
    const service = new (PayrollService as unknown as new (
      ...args: unknown[]
    ) => PayrollService)(prisma);

    return { findMany, prisma, service };
  }

  /** ดึงเงื่อนไข employee ที่ถูกส่งเข้า Prisma */
  const employeeWhere = (findMany: jest.Mock) =>
    (findMany.mock.calls[0]?.[0] as { where: { employee: Record<string, unknown> } })
      .where.employee;

  describe('findLatestCompensationsForRun', () => {
    const period = {
      companyId: 'company-1',
      periodEndDate: new Date('2026-08-25T00:00:00.000Z'),
      periodStartDate: new Date('2026-07-26T00:00:00.000Z'),
    };

    /* ข้อสำคัญที่สุดของไฟล์นี้ */
    it('ไม่ส่ง branchIds ต้องไม่มีเงื่อนไขสาขาเลย', async () => {
      const { findMany, service } = buildService();

      await (service as never as {
        findLatestCompensationsForRun: (p: unknown) => Promise<unknown>;
      }).findLatestCompensationsForRun(period);

      expect(employeeWhere(findMany)).not.toHaveProperty('branchId');
    });

    it('ส่ง branchIds เป็น array ว่าง ก็ต้องไม่มีเงื่อนไขสาขา', async () => {
      const { findMany, service } = buildService();

      await (service as never as {
        findLatestCompensationsForRun: (p: unknown) => Promise<unknown>;
      }).findLatestCompensationsForRun({ ...period, branchIds: [] });

      expect(employeeWhere(findMany)).not.toHaveProperty('branchId');
    });

    it('เลือกสาขาแล้วต้องกรองเฉพาะสาขานั้น', async () => {
      const { findMany, service } = buildService();

      await (service as never as {
        findLatestCompensationsForRun: (p: unknown) => Promise<unknown>;
      }).findLatestCompensationsForRun({
        ...period,
        branchIds: ['branch-art'],
      });

      expect(employeeWhere(findMany).branchId).toEqual({ in: ['branch-art'] });
    });

    /* เงื่อนไขช่วงการจ้างงานต้องอยู่ครบ ไม่ถูกตัวกรองสาขามาทับ */
    it('กรองสาขาแล้วเงื่อนไขคนออกกลางงวดต้องยังอยู่', async () => {
      const { findMany, service } = buildService();

      await (service as never as {
        findLatestCompensationsForRun: (p: unknown) => Promise<unknown>;
      }).findLatestCompensationsForRun({
        ...period,
        branchIds: ['branch-art'],
      });

      const where = employeeWhere(findMany);

      expect(where.deletedAt).toBeNull();
      expect(where.OR).toHaveLength(2);
      expect(where).toHaveProperty('startDate');
    });
  });

  describe('resolveRunBranchIds', () => {
    const resolve = (service: PayrollService, ids?: string[]) =>
      (service as never as {
        resolveRunBranchIds: (
          companyId: string,
          branchIds?: string[],
        ) => Promise<string[]>;
      }).resolveRunBranchIds('company-1', ids);

    it('ไม่เลือกอะไรเลย ต้องได้ array ว่าง และไม่ต้องไปถามฐานข้อมูล', async () => {
      const { prisma, service } = buildService();

      expect(await resolve(service)).toEqual([]);
      expect(await resolve(service, [])).toEqual([]);
      expect(prisma.branch.findMany).not.toHaveBeenCalled();
    });

    it('ตัดค่าซ้ำออก', async () => {
      const { service } = buildService({ branchesInCompany: ['b1'] });

      expect(await resolve(service, ['b1', 'b1'])).toEqual(['b1']);
    });

    /*
     * ส่ง id ที่ไม่ใช่ของบริษัทนี้แล้วปล่อยผ่าน รอบจะคำนวณได้ 0 คน
     * โดยไม่มีข้อความบอกว่าเพราะอะไร — ต้องดักตั้งแต่ตอนสร้าง
     */
    it('มี id ที่ไม่ใช่ของบริษัทนี้ ต้องปฏิเสธ', async () => {
      const { service } = buildService({ branchesInCompany: ['b1'] });

      await expect(resolve(service, ['b1', 'ของบริษัทอื่น'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
