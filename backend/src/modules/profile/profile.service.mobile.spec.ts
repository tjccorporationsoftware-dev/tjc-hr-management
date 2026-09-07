import { NotFoundException } from '@nestjs/common';

import { ProfileService } from './profile.service';

describe('ProfileService mobile profile', () => {
  it('snapshot ใช้ select จำกัดข้อมูลและไม่ใช้ employeeProfileInclude ก้อนเดิม', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn(async () => ({
          id: 'user-1',
          email: 'u@example.com',
          displayName: 'User',
          phone: null,
          avatarUrl: null,
        })),
      },
      employee: {
        /*
         * ต้องประกาศพารามิเตอร์ไว้ ถึงจะไม่ได้ใช้ในตัว mock — ไม่งั้น
         * mock.calls จะมี type เป็น tuple ว่าง แล้วอ่าน argument ที่ service
         * ส่งเข้ามาไม่ได้ ซึ่งเป็นสิ่งเดียวที่เทสนี้ต้องการตรวจ
         */
        findFirst: jest.fn(
          async (_args: {
            select: Record<string, { select: Record<string, unknown> }>;
          }) => null,
        ),
      },
    };
    const service = new ProfileService(prisma as never);

    await service.getMobileProfileSnapshot('user-1');

    const query = prisma.employee.findFirst.mock.calls[0]?.[0];

    if (!query) {
      throw new Error('getMobileProfileSnapshot ต้องเรียก employee.findFirst');
    }

    expect(query.select.profile.select).toEqual(
      expect.objectContaining({
        bankAccountNo: true,
        currentAddress: true,
        educationLevel: true,
      }),
    );
    expect(query.select).not.toHaveProperty('payrollItems');
    expect(query.select).not.toHaveProperty('warningLetters');
  });

  it('download ไม่หาเอกสารต่อเมื่อบัญชีไม่ได้ผูกพนักงานที่ active', async () => {
    const prisma = {
      employee: { findFirst: jest.fn(async () => null) },
      employeeDocument: { findFirst: jest.fn() },
    };
    const service = new ProfileService(prisma as never);

    await expect(
      service.getMyDocumentFileForDownload('user-1', 'doc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employeeDocument.findFirst).not.toHaveBeenCalled();
  });
});
