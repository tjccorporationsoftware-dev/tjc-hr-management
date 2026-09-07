import { ForbiddenException } from '@nestjs/common';

import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import { ReportsService } from './reports.service';

/**
 * ขอบเขตข้อมูลของรายงาน
 * -----------------------------------------------------------------------------
 * รายงานรับ companyId/branchId มาจาก query string ของผู้เรียกตรง ๆ
 * เดิมล็อกแค่ระดับบริษัท บัญชีระดับสาขาจึงส่ง branchId ของสาขาอื่นเข้ามาแล้ว
 * ดึงบันทึกเวลาและข้อมูลค่าตอบแทนข้ามสาขาได้
 *
 * ไฟล์นี้ดัก where ที่ส่งเข้า Prisma จริง ๆ แทนการเชื่อว่าโค้ดกรองแล้ว
 * เพราะจุดพลาดอยู่ที่ค่าที่ไหลไปถึง query ไม่ใช่ที่ตัวฟังก์ชันช่วยกรอง
 */
describe('ReportsService · ขอบเขตบริษัท/สาขา', () => {
  const globalScope: TenantScope = {
    level: 'GLOBAL',
    companyId: null,
    branchId: null,
  };

  const companyScope: TenantScope = {
    level: 'COMPANY',
    companyId: 'com-1',
    branchId: null,
  };

  const branchScope: TenantScope = {
    level: 'BRANCH',
    companyId: 'com-1',
    branchId: 'br-1',
  };

  function buildService() {
    const capturedWhere: Record<string, unknown>[] = [];

    const prisma = {
      attendanceDailySummary: {
        findMany: jest.fn((args: { where: Record<string, unknown> }) => {
          capturedWhere.push(args.where);
          return Promise.resolve([]);
        }),
      },
      exportFile: {
        findMany: jest.fn((args: { where: Record<string, unknown> }) => {
          capturedWhere.push(args.where);
          return Promise.resolve([]);
        }),
        count: jest.fn(() => Promise.resolve(0)),
        groupBy: jest.fn(() => Promise.resolve([])),
        findFirst: jest.fn((args: { where: Record<string, unknown> }) => {
          capturedWhere.push(args.where);
          return Promise.resolve(null);
        }),
      },
      reportLog: {
        create: jest.fn(() => Promise.resolve({})),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };

    return {
      service: new ReportsService(prisma as never),
      capturedWhere,
      prisma,
    };
  }

  /** ดึงตัวกรองพนักงานออกจาก where ของรายงานบันทึกเวลา */
  function employeeFilterOf(where: Record<string, unknown>) {
    return (where.employee ?? {}) as {
      companyId?: string;
      branchId?: string;
    };
  }

  describe('รายงานบันทึกเวลา', () => {
    it('บัญชีระดับสาขาถูกล็อกไว้ที่สาขาตัวเอง แม้ส่ง branchId ของสาขาอื่นมา', async () => {
      const { service, capturedWhere } = buildService();

      await service.getAttendanceReport(
        { companyId: 'com-9', branchId: 'br-9' } as never,
        'user-1',
        branchScope,
      );

      const filter = employeeFilterOf(capturedWhere[0]);

      expect(filter.companyId).toBe('com-1');
      expect(filter.branchId).toBe('br-1');
    });

    it('บัญชีระดับบริษัทเลือกสาขาที่จะดูได้เอง แต่ข้ามบริษัทไม่ได้', async () => {
      const { service, capturedWhere } = buildService();

      await service.getAttendanceReport(
        { companyId: 'com-9', branchId: 'br-2' } as never,
        'user-1',
        companyScope,
      );

      const filter = employeeFilterOf(capturedWhere[0]);

      expect(filter.companyId).toBe('com-1');
      expect(filter.branchId).toBe('br-2');
    });

    it('ระดับแพลตฟอร์มยังกรองเองได้ตามปกติ', async () => {
      const { service, capturedWhere } = buildService();

      await service.getAttendanceReport(
        { companyId: 'com-9', branchId: 'br-9' } as never,
        'user-1',
        globalScope,
      );

      const filter = employeeFilterOf(capturedWhere[0]);

      expect(filter.companyId).toBe('com-9');
      expect(filter.branchId).toBe('br-9');
    });

    /*
     * migration user_scope_consistency_chk ยังยอมให้มีบัญชีระดับสาขาที่ไม่ผูก
     * บริษัทไว้ชั่วคราว เดิมบัญชีแบบนั้นจะไม่ถูกกรองอะไรเลย = เห็นทุกบริษัท
     */
    it('บัญชีที่ยังไม่ผูกบริษัทต้องถูกปฏิเสธ ไม่ใช่เห็นทุกบริษัท', async () => {
      const { service, prisma } = buildService();

      await expect(
        service.getAttendanceReport({} as never, 'user-1', {
          level: 'BRANCH',
          companyId: null,
          branchId: null,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.attendanceDailySummary.findMany).not.toHaveBeenCalled();
    });
  });

  describe('ไฟล์ Export', () => {
    /*
     * ตาราง ExportFile มีแค่ companyId ไม่มี branchId จึงกรองผ่าน scope
     * ของคนที่สร้างไฟล์แทน — ไฟล์ที่คนระดับบริษัทสร้าง (scopedBranchId เป็น null)
     * ต้องไม่หลุดไปให้บัญชีระดับสาขาเห็น เพราะข้างในเป็นข้อมูลของทุกสาขา
     */
    it('บัญชีระดับสาขาเห็นเฉพาะไฟล์ที่คนสาขาเดียวกันสร้าง', async () => {
      const { service, capturedWhere } = buildService();

      await service.findExportFiles({} as never, branchScope);

      expect(capturedWhere[0]).toMatchObject({
        createdBy: { is: { scopedBranchId: 'br-1' } },
      });
    });

    it('บัญชีระดับบริษัทไม่ถูกจำกัดเพิ่ม เพราะ companyId คุมอยู่แล้ว', async () => {
      const { service, capturedWhere } = buildService();

      await service.findExportFiles({} as never, companyScope);

      expect(capturedWhere[0]).not.toHaveProperty('createdBy');
      expect(capturedWhere[0]).toMatchObject({ companyId: 'com-1' });
    });

    /*
     * ต้องกรองแบบเดียวกับตอนแสดงรายการ ไม่งั้นไฟล์ที่ถูกซ่อนจากรายการ
     * ยังโหลดได้อยู่ถ้ารู้ id
     */
    it('การดาวน์โหลดตรงต้องกรองเหมือนตอนแสดงรายการ', async () => {
      const { service, capturedWhere } = buildService();

      await expect(
        service.downloadExportFile('export-1', branchScope, 'user-1'),
      ).rejects.toThrow();

      expect(capturedWhere[0]).toMatchObject({
        id: 'export-1',
        createdBy: { is: { scopedBranchId: 'br-1' } },
      });
    });
  });
});
