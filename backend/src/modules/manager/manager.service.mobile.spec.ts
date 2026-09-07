import { ForbiddenException } from '@nestjs/common';

import { ManagerService } from './manager.service';

/**
 * เมธอดฝั่ง Mobile ของ ManagerService
 *
 * สิ่งที่ต้องคุมไว้ด้วยเทสคือ **ขอบเขตทีม** เป็นหลัก — จอ drill-down รับ
 * employeeId มาจาก client และถ้าหลุด หัวหน้าคนหนึ่งจะเปิดดูเวลาเข้าออกและ
 * ใบลาของพนักงานทั้งบริษัทได้ ซึ่งเป็นข้อมูลส่วนบุคคล
 */
describe('ManagerService · เมธอดสำหรับ Mobile', () => {
  function build(teamIds: string[] = ['emp-1', 'emp-2']) {
    const prisma = {
      attendanceLog: {
        count: jest.fn(async () => 0),
        /*
         * ต้องประกาศพารามิเตอร์ไว้แม้ไม่ได้ใช้ ไม่งั้น mock.calls จะมี type
         * เป็น tuple ว่าง แล้วอ่าน where ที่ service ส่งเข้ามาไม่ได้ ซึ่งเป็น
         * สิ่งเดียวที่เทสขอบเขตทีมต้องการตรวจ
         */
        findMany: jest.fn(
          async (_args: { where: { employeeId: { in: string[] } } }) =>
            [] as unknown[],
        ),
      },
      employee: { findMany: jest.fn(async () => []) },
      leaveRequest: { findMany: jest.fn(async () => []) },
      offsiteWorkRequest: { findMany: jest.fn(async () => []) },
      overtimeRequest: { findMany: jest.fn(async () => []) },
      timeAdjustRequest: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (jobs: Promise<unknown>[]) =>
        Promise.all(jobs),
      ),
    };

    const service = new ManagerService(prisma as never, {} as never);
    const target = service as unknown as Record<string, unknown>;

    target.resolveManagerEmployee = jest.fn(async () => ({
      id: 'manager-1',
      companyId: 'company-1',
      branchId: null,
      departmentId: null,
      divisionId: null,
      employeeTypeId: null,
    }));
    target.findDirectTeamIds = jest.fn(async () => teamIds);

    return { prisma, service, target };
  }

  const user = { id: 'user-1' } as never;

  describe('findMobileTeamAttendance', () => {
    it('กรองด้วยรายชื่อลูกทีมเสมอ แม้ client ไม่ได้ส่ง employeeId', async () => {
      const { prisma, service } = build();

      await service.findMobileTeamAttendance(user, {});

      const where = prisma.attendanceLog.findMany.mock.calls[0]?.[0] as
        | { where: { employeeId: { in: string[] } } }
        | undefined;

      expect(where?.where.employeeId.in).toEqual(['emp-1', 'emp-2']);
    });

    it('employeeId ที่ไม่ใช่ลูกทีมต้องถูกตัดออกจนไม่เหลือขอบเขต', async () => {
      const { prisma, service } = build();

      await service.findMobileTeamAttendance(user, {
        employeeId: 'someone-else',
      });

      const where = prisma.attendanceLog.findMany.mock.calls[0]?.[0] as
        | { where: { employeeId: { in: string[] } } }
        | undefined;

      /* ว่าง = query คืนศูนย์รายการ ไม่ใช่ทั้งบริษัท */
      expect(where?.where.employeeId.in).toEqual([]);
    });

    it('employeeId ที่เป็นลูกทีมจริงต้องเหลือเฉพาะคนนั้น', async () => {
      const { prisma, service } = build();

      await service.findMobileTeamAttendance(user, { employeeId: 'emp-2' });

      const where = prisma.attendanceLog.findMany.mock.calls[0]?.[0] as
        | { where: { employeeId: { in: string[] } } }
        | undefined;

      expect(where?.where.employeeId.in).toEqual(['emp-2']);
    });
  });

  describe('findMobileTeamRequests', () => {
    it('หัวหน้าที่ยังไม่มีลูกทีมต้องไม่ยิง query ใบคำขอเลย', async () => {
      const { prisma, service } = build([]);

      const result = await service.findMobileTeamRequests(user, {});

      expect(result.items).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      expect(prisma.leaveRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.overtimeRequest.findMany).not.toHaveBeenCalled();
    });

    it('ขอเฉพาะประเภทที่ระบุ ไม่ยิงอีกสามตาราง', async () => {
      const { prisma, service } = build();

      await service.findMobileTeamRequests(user, { type: 'LEAVE' });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalled();
      expect(prisma.overtimeRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.timeAdjustRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.offsiteWorkRequest.findMany).not.toHaveBeenCalled();
    });

    it('เรียงรวมทุกประเภทตามวันที่ยื่นจากใหม่ไปเก่า', async () => {
      const { prisma, service } = build();

      prisma.leaveRequest.findMany = jest.fn(async () => [
        { id: 'leave-old', submittedAt: new Date('2026-08-01T00:00:00.000Z') },
      ]) as never;
      prisma.overtimeRequest.findMany = jest.fn(async () => [
        { id: 'ot-new', submittedAt: new Date('2026-08-19T00:00:00.000Z') },
      ]) as never;

      const result = await service.findMobileTeamRequests(user, {});

      expect(result.items.map((row) => (row.item as { id: string }).id)).toEqual(
        ['ot-new', 'leave-old'],
      );
    });

    it('ฉบับร่างที่ยังไม่มีวันที่ยื่นต้องใช้ createdAt แทน ไม่ตกไปท้ายสุด', async () => {
      const { prisma, service } = build();

      prisma.leaveRequest.findMany = jest.fn(async () => [
        {
          id: 'leave-draft',
          createdAt: new Date('2026-08-20T00:00:00.000Z'),
          submittedAt: null,
        },
      ]) as never;
      prisma.overtimeRequest.findMany = jest.fn(async () => [
        { id: 'ot-sent', submittedAt: new Date('2026-08-10T00:00:00.000Z') },
      ]) as never;

      const result = await service.findMobileTeamRequests(user, {});

      expect((result.items[0]?.item as { id: string }).id).toBe('leave-draft');
    });

    it('บอก hasMore เมื่อมีรายการเกินหน้าที่ขอ', async () => {
      const { prisma, service } = build();

      prisma.leaveRequest.findMany = jest.fn(async () =>
        Array.from({ length: 3 }, (_, index) => ({
          id: `leave-${index}`,
          submittedAt: new Date(`2026-08-1${index}T00:00:00.000Z`),
        })),
      ) as never;

      const result = await service.findMobileTeamRequests(user, {
        pageSize: '2',
      });

      expect(result.items).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
    });
  });

  describe('findMobileTeamMember', () => {
    it('ปฏิเสธเมื่อพนักงานไม่ได้อยู่ในทีมของผู้เรียก', async () => {
      const { service, target } = build();

      target.getTeamSummary = jest.fn(async () => ({
        date: '2026-08-21',
        holiday: null,
        members: [{ employee: { id: 'emp-1' } }],
        month: '2026-08',
      }));

      await expect(
        service.findMobileTeamMember(user, 'emp-99'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('คืนสมาชิกที่ขอพร้อมบริบทของวันและเดือนที่ดู', async () => {
      const { service, target } = build();

      target.getTeamSummary = jest.fn(async () => ({
        date: '2026-08-21',
        holiday: { name: 'วันหยุดพิเศษ' },
        members: [
          { employee: { id: 'emp-1' } },
          { employee: { id: 'emp-2' }, pendingRequests: 3 },
        ],
        month: '2026-08',
      }));

      const result = await service.findMobileTeamMember(user, 'emp-2');

      expect(result.member.employee.id).toBe('emp-2');
      expect(result.member.pendingRequests).toBe(3);
      expect(result.month).toBe('2026-08');
      expect(result.holiday?.name).toBe('วันหยุดพิเศษ');
    });

    it('ส่งเดือนที่เลือกต่อให้ getTeamSummary ไม่ใช่ใช้เดือนปัจจุบันเสมอ', async () => {
      const { service, target } = build();

      const getTeamSummary = jest.fn(async () => ({
        date: '2026-05-31',
        holiday: null,
        members: [{ employee: { id: 'emp-1' } }],
        month: '2026-05',
      }));
      target.getTeamSummary = getTeamSummary;

      await service.findMobileTeamMember(user, 'emp-1', { month: '2026-05' });

      expect(getTeamSummary).toHaveBeenCalledWith(user, { month: '2026-05' });
    });
  });
});
