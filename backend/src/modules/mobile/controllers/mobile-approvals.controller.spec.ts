import { BadRequestException } from '@nestjs/common';

import { MobileApprovalsController } from './mobile-approvals.controller';

/**
 * จออนุมัติบนมือถือกดง่ายกว่าบนเว็บมาก (ปุ่มอยู่บนรายการเลย)
 * สองอย่างที่ต้องไม่หลุด:
 *   1. ปฏิเสธหรือส่งกลับต้องมีเหตุผลเสมอ ไม่งั้นผู้ยื่นไม่รู้ว่าต้องแก้อะไร
 *   2. ใบขอเอกสารเปิดไฟล์แนบได้เฉพาะผู้ที่ใบนั้นอยู่ในคิวของเขา
 */
describe('MobileApprovalsController', () => {
  const user = { id: 'user-1' } as never;

  function build(items: Record<string, unknown>[] = []) {
    const approvals = {
      approveLeaveRequest: jest.fn(async () => ({ ok: true })),
      approveOffsiteRequest: jest.fn(async () => ({ ok: true })),
      approveOvertimeRequest: jest.fn(async () => ({ ok: true })),
      approveDocumentRequest: jest.fn(async () => ({ ok: true })),
      approveTimeAdjustRequest: jest.fn(async () => ({ ok: true })),
      ensureApprovalInScope: jest.fn(async () => ({ id: 'request-1' })),
      findApprovalDetail: jest.fn(async () => items[0] ?? null),
      findMobileApprovals: jest.fn(
        async (_user: unknown, query: Record<string, unknown>) => {
          const supported = items;
          const page = Number(query.page ?? 1);
          const pageSize = Number(query.pageSize ?? 20);
          const start = (page - 1) * pageSize;
          const end = start + pageSize;

          return {
            items: supported.slice(start, end),
            meta: {
              hasMore: end < supported.length,
              page,
              pageSize,
              total: supported.length,
              totalExact: true,
              totalPages: Math.ceil(supported.length / pageSize),
            },
          };
        },
      ),
      rejectLeaveRequest: jest.fn(async () => ({ ok: true })),
      rejectOffsiteRequest: jest.fn(async () => ({ ok: true })),
      rejectOvertimeRequest: jest.fn(async () => ({ ok: true })),
      rejectDocumentRequest: jest.fn(async () => ({ ok: true })),
      rejectTimeAdjustRequest: jest.fn(async () => ({ ok: true })),
      returnLeaveRequest: jest.fn(async () => ({ ok: true })),
      returnOffsiteRequest: jest.fn(async () => ({ ok: true })),
      returnOvertimeRequest: jest.fn(async () => ({ ok: true })),
      returnDocumentRequest: jest.fn(async () => ({ ok: true })),
      returnTimeAdjustRequest: jest.fn(async () => ({ ok: true })),
    };
    const documents = {
      getDocumentFileForDownload: jest.fn(async () => downloadFile),
    };
    const downloadFile = {
      fileName: 'evidence.pdf',
      filePath: 'C:\\storage\\evidence.pdf',
      mimeType: 'application/pdf',
      size: 2048,
    };
    const leaveAttachments = {
      getAttachmentFileForDownload: jest.fn(async () => downloadFile),
    };
    const overtimeRequests = {
      getAttachmentFileForDownload: jest.fn(async () => downloadFile),
    };
    const timeAdjustRequests = {
      getAttachmentFileForDownload: jest.fn(async () => downloadFile),
    };

    return {
      approvals,
      controller: new MobileApprovalsController(
        approvals as never,
        documents as never,
        leaveAttachments as never,
        overtimeRequests as never,
        timeAdjustRequests as never,
        { executeOptional: jest.fn(async ({ handler }) => handler()) } as never,
      ),
      documents,
      leaveAttachments,
      overtimeRequests,
      timeAdjustRequests,
    };
  }

  describe('list', () => {
    it('ใบขอเอกสารอยู่ในรายการเดียวกับคำขอประเภทอื่น', async () => {
      const { controller } = build([
        { id: 'l1', title: 'ลาป่วย', type: 'LEAVE' },
        { id: 'd1', title: 'ขอหนังสือรับรอง', type: 'DOCUMENT' },
      ]);

      const result = await controller.list(user);

      expect(result.items.map((item) => item.type)).toEqual([
        'LEAVE',
        'DOCUMENT',
      ]);
    });

    it('ประเภทที่ไม่รู้จักต้องถูกปฏิเสธ ไม่ใช่เงียบแล้วคืนทุกประเภท', async () => {
      const { controller } = build();

      await expect(
        controller.list(user, { type: 'payroll' as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ส่ง slug ที่ถูกต้อง ต้องแปลงเป็นประเภทของ service เดิม', async () => {
      const { controller, approvals } = build();

      await controller.list(user, { type: 'time-adjust' });

      expect(approvals.findMobileApprovals.mock.calls[0]?.[1]).toMatchObject({
        type: 'TIME_ADJUST',
      });
    });

    it('สรุปข้อมูลใบลาให้อ่านจบในบรรทัดเดียว', async () => {
      const { controller } = build([
        {
          detail: {
            endDate: new Date('2026-08-18T00:00:00.000Z'),
            startDate: new Date('2026-08-16T00:00:00.000Z'),
            totalDays: 3,
          },
          employee: { displayName: 'สมชาย ใจดี', employeeCode: '670001' },
          id: 'l1',
          title: 'ลาพักร้อน',
          type: 'LEAVE',
        },
      ]);

      const result = await controller.list(user);

      expect(result.items[0]).toMatchObject({
        employeeName: 'สมชาย ใจดี',
        summary: '2026-08-16 – 2026-08-18 · 3 วัน',
      });
    });

    it('ใช้ pagination ที่ service ฝั่ง Mobile คืนมาโดยไม่ตัดหน้าใน controller ซ้ำ', async () => {
      const { controller } = build([
        ...Array.from({ length: 25 }, (_, index) => ({
          id: `l${index + 1}`,
          title: 'ลาป่วย',
          type: 'LEAVE',
        })),
      ]);

      const result = await controller.list(user, { page: 2, pageSize: 10 });

      expect(result.items).toHaveLength(10);
      expect(result.items[0]?.id).toBe('l11');
      expect(result.meta).toMatchObject({
        hasMore: true,
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('รายการต้องส่งเฉพาะ summary ไม่แบก timeline และไฟล์แนบมาทั้งก้อน', async () => {
      const { controller } = build([
        {
          approvalSteps: [{ id: 'step-1', status: 'APPROVED', stepNo: 1 }],
          detail: {
            attachments: [{ fileName: 'medical.pdf', id: 'file-1' }],
            startDate: new Date('2026-08-20T00:00:00.000Z'),
          },
          id: 'l1',
          title: 'ลาป่วย',
          type: 'LEAVE',
        },
      ]);

      const result = await controller.list(user);

      expect(result.items[0]).not.toHaveProperty('attachments');
      expect(result.items[0]).not.toHaveProperty('details');
      expect(result.items[0]).not.toHaveProperty('timeline');
    });
  });

  describe('detail', () => {
    it('โหลดรายละเอียดจาก service ด้วย scope ของผู้อนุมัติและคืน timeline/ไฟล์แนบ', async () => {
      const { approvals, controller } = build([
        {
          approvalSteps: [
            {
              actedAt: new Date('2026-08-20T03:00:00.000Z'),
              actedBy: { displayName: 'หัวหน้า สมชาย' },
              id: 'step-1',
              nameTh: 'หัวหน้างาน',
              status: 'APPROVED',
              stepNo: 1,
            },
          ],
          detail: {
            attachments: [
              {
                fileName: 'medical.pdf',
                id: 'file-1',
                mimeType: 'application/pdf',
              },
            ],
            endDate: new Date('2026-08-20T00:00:00.000Z'),
            startDate: new Date('2026-08-20T00:00:00.000Z'),
            totalDays: 1,
          },
          id: 'l1',
          title: 'ลาป่วย',
          type: 'LEAVE',
        },
      ]);

      const result = await controller.detail(user, 'leave', 'l1');

      expect(approvals.findApprovalDetail).toHaveBeenCalledWith(
        user,
        'LEAVE',
        'l1',
      );
      expect(result).toMatchObject({
        attachments: [
          expect.objectContaining({
            downloadSupported: true,
            fileName: 'medical.pdf',
            id: 'file-1',
          }),
        ],
        timeline: [
          expect.objectContaining({
            actorName: 'หัวหน้า สมชาย',
            status: 'APPROVED',
            title: 'หัวหน้างาน',
          }),
        ],
      });
    });

    it('ประเภทที่ไม่รู้จักต้องถูกปฏิเสธ ไม่ใช่ตกไปเป็นประเภทใดประเภทหนึ่ง', async () => {
      const { controller } = build();

      await expect(
        controller.detail(user, 'payroll', 'p1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('ไฟล์แนบของใบขอเอกสาร', () => {
    /*
     * ไฟล์ของใบขอเอกสารอาจมีสำเนาบัตรประชาชน การเปิดจึงต้องผ่านด่านเดียวกับ
     * การอนุมัติ ไม่ใช่แค่รู้ id ไฟล์ก็เปิดได้
     */
    it('ตรวจว่าใบอยู่ในคิวของผู้เรียกก่อนเปิดไฟล์', async () => {
      const { approvals, controller, documents } = build();
      const response = { setHeader: jest.fn(), sendFile: jest.fn() };

      await controller.downloadAttachment(
        user,
        'document',
        'd1',
        'file-1',
        response as never,
      );

      expect(approvals.ensureApprovalInScope).toHaveBeenCalledWith(
        user,
        'DOCUMENT',
        'd1',
      );
      expect(documents.getDocumentFileForDownload).toHaveBeenCalled();
      expect(response.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, no-store',
      );
    });

    it('ใบทำงานนอกสถานที่ไม่มีไฟล์แนบ ต้องปฏิเสธไปตรง ๆ', async () => {
      const { controller } = build();

      await expect(
        controller.downloadAttachment(
          user,
          'offsite',
          'o1',
          'file-1',
          {} as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('downloadAttachment', () => {
    it('ต้องตรวจ scope ผู้อนุมัติก่อนส่งไฟล์', async () => {
      const { approvals, controller, leaveAttachments } = build();
      const response = {
        sendFile: jest.fn((path: string) => path),
        setHeader: jest.fn(),
      } as never;

      await controller.downloadAttachment(
        user,
        'leave',
        'l1',
        'a1',
        response,
      );

      expect(approvals.ensureApprovalInScope).toHaveBeenCalledWith(
        user,
        'LEAVE',
        'l1',
      );
      expect(leaveAttachments.getAttachmentFileForDownload).toHaveBeenCalled();
    });
  });

  describe('act', () => {
    it('อนุมัติไม่ต้องมีเหตุผล', async () => {
      const { controller, approvals } = build();

      await controller.act(user, 'leave', 'l1', 'approve', {}, null);

      expect(approvals.approveLeaveRequest).toHaveBeenCalled();
    });

    it('ไม่อนุมัติต้องมีเหตุผล ไม่งั้นปฏิเสธตั้งแต่ต้น', async () => {
      const { controller, approvals } = build();

      await expect(
        controller.act(user, 'leave', 'l1', 'reject', {}, null),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(approvals.rejectLeaveRequest).not.toHaveBeenCalled();
    });

    it('เหตุผลที่มีแต่ช่องว่างต้องไม่ผ่าน', async () => {
      const { controller } = build();

      await expect(
        controller.act(user, 'leave', 'l1', 'reject', { reason: '   ' }, null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ส่งกลับต้องมีเหตุผลเช่นกัน', async () => {
      const { controller } = build();

      await expect(
        controller.act(user, 'overtime', 'o1', 'return', {}, null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('เรียก service ให้ตรงกับประเภทและการกระทำ', async () => {
      const { controller, approvals } = build();

      await controller.act(user, 'offsite', 'x1', 'reject', {
        reason: 'ไม่มีความจำเป็น',
      }, null);

      expect(approvals.rejectOffsiteRequest).toHaveBeenCalledWith(
        user,
        'x1',
        { reason: 'ไม่มีความจำเป็น' },
      );
      expect(approvals.rejectLeaveRequest).not.toHaveBeenCalled();
    });

    it('การกระทำที่ไม่รู้จักต้องถูกปฏิเสธ', async () => {
      const { controller } = build();

      await expect(
        controller.act(user, 'leave', 'l1', 'delete', {}, null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
