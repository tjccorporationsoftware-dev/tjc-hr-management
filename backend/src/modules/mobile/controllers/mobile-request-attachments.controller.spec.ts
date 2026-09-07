import { MobileRequestAttachmentsController } from './mobile-request-attachments.controller';

/**
 * ช่องโหว่ที่เทสชุดนี้กันไว้
 *
 * `uploadAttachment` ของ service เดิมค้นใบด้วย tenant scope ซึ่งกว้างระดับบริษัท
 * ไม่ใช่ "ของฉัน" ถ้า controller เรียกตรง ๆ พนักงานคนไหนก็แนบไฟล์เข้าใบลา
 * ของเพื่อนร่วมบริษัทได้ ทุก route จึงต้องเรียก findMyOne ก่อนเสมอ
 * และต้องหยุดทันทีเมื่อ findMyOne โยน error
 */
describe('MobileRequestAttachmentsController · ต้องเป็นใบของตัวเองเท่านั้น', () => {
  const user = { id: 'user-1', scope: { level: 'COMPANY' } };
  const file = {
    filename: 'a.jpg',
    mimetype: 'image/jpeg',
    originalname: 'a.jpg',
    path: '/tmp/a.jpg',
    size: 1024,
  } as never;
  const dto = { title: 'ใบรับรองแพทย์' } as never;

  function build(options: { notMine?: boolean } = {}) {
    const denied = async () => {
      if (options.notMine) {
        throw new Error('ไม่พบคำขอ');
      }

      return {};
    };

    const leaveAttachmentService = {
      findAttachments: jest.fn(async () => []),
      getAttachmentFileForDownload: jest.fn(async () => ({
        fileName: 'a.jpg',
        filePath: 'C:\\storage\\a.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      })),
      removeAttachment: jest.fn(async () => ({ deleted: true, id: 'att-1' })),
      uploadAttachment: jest.fn(async () => ({ id: 'att-1' })),
    };
    const leaveRequestsService = { findMyOne: jest.fn(denied) };
    const overtimeRequestsService = {
      findMyAttachments: jest.fn(async () => []),
      findMyOne: jest.fn(denied),
      getMyAttachmentFileForDownload: jest.fn(async () => ({
        fileName: 'a.jpg',
        filePath: 'C:\\storage\\a.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      })),
      removeAttachment: jest.fn(async () => ({ deleted: true, id: 'att-2' })),
      uploadAttachment: jest.fn(async () => ({ id: 'att-2' })),
    };
    const timeAdjustRequestsService = {
      findMyAttachments: jest.fn(async () => []),
      findMyOne: jest.fn(denied),
      getMyAttachmentFileForDownload: jest.fn(async () => ({
        fileName: 'a.jpg',
        filePath: 'C:\\storage\\a.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      })),
      removeAttachment: jest.fn(async () => ({ deleted: true, id: 'att-3' })),
      uploadAttachment: jest.fn(async () => ({ id: 'att-3' })),
    };

    const idempotency = {
      executeOptional: jest.fn(async ({ handler }) => handler()),
    };

    return {
      controller: new MobileRequestAttachmentsController(
        leaveAttachmentService as never,
        leaveRequestsService as never,
        overtimeRequestsService as never,
        timeAdjustRequestsService as never,
        idempotency as never,
      ),
      idempotency,
      leaveAttachmentService,
      leaveRequestsService,
      overtimeRequestsService,
      timeAdjustRequestsService,
    };
  }

  it('ใบลาของคนอื่น ต้องไม่ถูกอัปโหลดไฟล์เข้าไป', async () => {
    const { controller, leaveAttachmentService } = build({ notMine: true });

    await expect(
      controller.uploadLeaveAttachment(user as never, 'leave-1', file, dto, null),
    ).rejects.toThrow('ไม่พบคำขอ');

    expect(leaveAttachmentService.uploadAttachment).not.toHaveBeenCalled();
  });

  it('ใบ OT ของคนอื่น ต้องไม่ถูกอัปโหลดไฟล์เข้าไป', async () => {
    const { controller, overtimeRequestsService } = build({ notMine: true });

    await expect(
      controller.uploadOvertimeAttachment(user as never, 'ot-1', file, dto, null),
    ).rejects.toThrow('ไม่พบคำขอ');

    expect(overtimeRequestsService.uploadAttachment).not.toHaveBeenCalled();
  });

  it('ใบแก้เวลาของคนอื่น ต้องไม่ถูกอัปโหลดไฟล์เข้าไป', async () => {
    const { controller, timeAdjustRequestsService } = build({ notMine: true });

    await expect(
      controller.uploadTimeAdjustAttachment(user as never, 'ta-1', file, dto, null),
    ).rejects.toThrow('ไม่พบคำขอ');

    expect(timeAdjustRequestsService.uploadAttachment).not.toHaveBeenCalled();
  });

  it('การดูรายการไฟล์แนบก็ต้องตรวจความเป็นเจ้าของเหมือนกัน', async () => {
    const { controller, leaveAttachmentService } = build({ notMine: true });

    await expect(
      controller.listLeaveAttachments(user as never, 'leave-1'),
    ).rejects.toThrow('ไม่พบคำขอ');

    expect(leaveAttachmentService.findAttachments).not.toHaveBeenCalled();
  });

  it('ใบของตัวเอง ต้องอัปโหลดผ่านและส่ง userId ไปบันทึกว่าใครแนบ', async () => {
    const { controller, leaveAttachmentService, leaveRequestsService } =
      build();

    await controller.uploadLeaveAttachment(
      user as never,
      'leave-1',
      file,
      dto,
      null,
    );

    expect(leaveRequestsService.findMyOne).toHaveBeenCalledWith(
      'leave-1',
      user,
    );
    expect(leaveAttachmentService.uploadAttachment).toHaveBeenCalledWith(
      'leave-1',
      dto,
      file,
      user.scope,
      user.id,
    );
  });

  it('ดาวน์โหลดไฟล์ใบลาต้องตรวจความเป็นเจ้าของก่อนอ่านไฟล์', async () => {
    const { controller, leaveAttachmentService } = build({ notMine: true });
    const response = {
      sendFile: jest.fn(),
      setHeader: jest.fn(),
    } as never;

    await expect(
      controller.downloadLeaveAttachment(
        user as never,
        'leave-1',
        'att-1',
        response,
      ),
    ).rejects.toThrow('ไม่พบคำขอ');

    expect(
      leaveAttachmentService.getAttachmentFileForDownload,
    ).not.toHaveBeenCalled();
  });
  it('ลบไฟล์ใบลาของคนอื่นไม่ได้และต้องหยุดก่อนเรียก removeAttachment', async () => {
    const { controller, leaveAttachmentService } = build({ notMine: true });

    await expect(
      controller.deleteLeaveAttachment(user as never, 'leave-1', 'att-1', null),
    ).rejects.toThrow('ไม่พบคำขอ');

    expect(leaveAttachmentService.removeAttachment).not.toHaveBeenCalled();
  });

  it('ลบไฟล์ OT ของตัวเองต้องตรวจ ownership ก่อนแล้วส่ง tenant scope เดิมให้ service', async () => {
    const { controller, overtimeRequestsService } = build();

    await controller.deleteOvertimeAttachment(
      user as never,
      'ot-1',
      'att-2',
      null,
    );

    expect(overtimeRequestsService.findMyOne).toHaveBeenCalledWith(
      'ot-1',
      user,
    );
    expect(overtimeRequestsService.removeAttachment).toHaveBeenCalledWith(
      'ot-1',
      'att-2',
      user.scope,
    );
  });

  it('ลบไฟล์แก้เวลาของตัวเองต้องตรวจ ownership ก่อนแล้วใช้กฎสถานะจาก domain service', async () => {
    const { controller, timeAdjustRequestsService } = build();

    await controller.deleteTimeAdjustAttachment(
      user as never,
      'ta-1',
      'att-3',
      null,
    );

    expect(timeAdjustRequestsService.findMyOne).toHaveBeenCalledWith(
      'ta-1',
      user,
    );
    expect(timeAdjustRequestsService.removeAttachment).toHaveBeenCalledWith(
      'ta-1',
      'att-3',
      user.scope,
    );
  });

});
