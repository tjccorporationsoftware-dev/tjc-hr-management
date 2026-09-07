import { MobileDocumentsOrchestrator } from './mobile-documents.orchestrator';

describe('MobileDocumentsOrchestrator', () => {
  const user = { id: 'user-1' } as never;

  it('list ใช้ ESS self query และ map pagination เป็น hasMore', async () => {
    const documents = {
      findEssDocumentRequests: jest.fn(async () => ({
        items: [],
        meta: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
        summary: { total: 21 },
      })),
    };
    const service = new MobileDocumentsOrchestrator(documents as never);

    const result = await service.list(user, { page: 1, pageSize: 20 });

    expect(documents.findEssDocumentRequests).toHaveBeenCalledWith(
      { page: 1, pageSize: 20 },
      user,
    );
    expect(result.meta.hasMore).toBe(true);
  });

  it('create ใช้ domain service ที่ตรวจประเภทเอกสารสำหรับ Mobile', async () => {
    const documents = {
      createMobileEssDocumentRequest: jest.fn(async (dto) => ({
        ...dto,
        id: 'req-1',
        status: 'DRAFT',
        documentType: { id: dto.documentTypeId, code: 'WORK_CERTIFICATE', nameTh: 'รับรองงาน' },
        approvals: [],
        files: [],
      })),
    };
    const service = new MobileDocumentsOrchestrator(documents as never);

    await service.create(user, {
      documentTypeId: 'type-1',
      title: 'ขอหนังสือรับรองการทำงาน',
    });

    expect(documents.createMobileEssDocumentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ documentTypeId: 'type-1' }),
      user,
    );
  });
});
