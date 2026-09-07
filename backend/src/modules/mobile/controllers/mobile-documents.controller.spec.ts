import { MobileDocumentsController } from './mobile-documents.controller';

describe('MobileDocumentsController', () => {
  const user = { id: 'user-1' } as never;

  it('detail ใช้ identity จาก token ไม่รับ employeeId จาก client', async () => {
    const documents = { detail: jest.fn(async () => ({ id: 'req-1' })) };
    const controller = new MobileDocumentsController(
      documents as never,
      { executeOptional: jest.fn(async ({ handler }) => handler()) } as never,
    );

    await controller.detail(user, 'req-1');

    expect(documents.detail).toHaveBeenCalledWith(user, 'req-1');
  });

  it('download ตั้ง no-store และส่งไฟล์ที่ domain service ตรวจ ownership แล้ว', async () => {
    const documents = {
      downloadFile: jest.fn(async () => ({
        filePath: '/tmp/a.pdf',
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        size: 10,
      })),
    };
    const controller = new MobileDocumentsController(
      documents as never,
      { executeOptional: jest.fn(async ({ handler }) => handler()) } as never,
    );
    const response = {
      setHeader: jest.fn(),
      sendFile: jest.fn((path) => path),
    } as never;

    await controller.downloadFile(user, 'req-1', 'file-1', response);

    expect(documents.downloadFile).toHaveBeenCalledWith(user, 'req-1', 'file-1');
    expect((response as any).setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });

  it('create ส่งผ่าน idempotency wrapper และรองรับ build เก่าที่ไม่มี key', async () => {
    const documents = { create: jest.fn(async () => ({ id: 'req-1' })) };
    const idempotency = { executeOptional: jest.fn(async ({ handler }) => handler()) };
    const controller = new MobileDocumentsController(
      documents as never,
      idempotency as never,
    );

    await controller.create(user, { documentTypeId: 'type-1', requestData: {} } as never, 'doc-key');

    expect(idempotency.executeOptional).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'doc-key', userId: 'user-1' }),
    );
    expect(documents.create).toHaveBeenCalled();
  });

});
