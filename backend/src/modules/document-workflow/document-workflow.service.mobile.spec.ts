import { DocumentWorkflowService } from './document-workflow.service';

describe('DocumentWorkflowService mobile document helpers', () => {
  it('catalog Mobile บังคับ allowEmployeeRequest=true และจำกัดบริษัทพนักงาน/shared', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn(async () => ({ id: 'emp-1', companyId: 'co-1' })),
      },
      documentType: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };
    const service = new DocumentWorkflowService(prisma as never, {} as never);

    await service.findMobileEssDocumentTypes({ page: 1, pageSize: 20 }, { id: 'user-1' });

    expect(prisma.documentType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          allowEmployeeRequest: true,
          OR: [{ companyId: 'co-1' }, { companyId: null }],
        }),
      }),
    );
  });

  it('Mobile update ปฏิเสธรายการที่ไม่ใช่ DRAFT โดยไม่เปลี่ยน Web behavior เดิม', async () => {
    const service = new DocumentWorkflowService({} as never, {} as never);
    jest
      .spyOn(service, 'findEssDocumentRequest')
      .mockResolvedValue({ status: 'SUBMITTED' } as never);

    await expect(
      service.updateMobileEssDocumentRequest(
        'req-1',
        { title: 'แก้ไข' },
        { id: 'user-1' },
      ),
    ).rejects.toThrow('แก้ไขคำร้องผ่านแอปได้เฉพาะฉบับร่าง');
  });

});
