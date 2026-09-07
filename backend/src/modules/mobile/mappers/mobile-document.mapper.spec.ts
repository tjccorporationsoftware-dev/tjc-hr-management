import { toMobileDocumentDetail, toMobileDocumentType } from './mobile-document.mapper';

describe('mobile document mapper', () => {
  it('catalog ไม่เผย field ภายในของ DocumentType', () => {
    expect(
      toMobileDocumentType({
        id: 'type-1',
        code: 'WORK_CERTIFICATE',
        nameTh: 'หนังสือรับรองการทำงาน',
        storageKey: 'should-not-leak',
        allowEmployeeRequest: true,
      } as never),
    ).toEqual(
      expect.objectContaining({
        id: 'type-1',
        code: 'WORK_CERTIFICATE',
      }),
    );
  });

  it('detail ไม่ส่ง storageKey/path และมอง DRAFT ที่ถูกส่งกลับเป็นแก้ไขได้', () => {
    const mapped = toMobileDocumentDetail({
      id: 'req-1',
      status: 'DRAFT',
      documentType: { id: 'type-1', code: 'WORK_CERTIFICATE', nameTh: 'รับรองงาน' },
      approvals: [
        {
          id: 'a-1',
          action: 'CANCEL',
          oldStatus: 'SUBMITTED',
          newStatus: 'DRAFT',
          level: 1,
        },
      ],
      files: [
        {
          id: 'f-1',
          fileName: 'a.pdf',
          fileType: 'SIGNED_DOCUMENT',
          storageKey: '../../secret.pdf',
        },
      ],
    } as never);

    expect(mapped.returnedForReview).toBe(true);
    expect(mapped.capabilities.canEdit).toBe(true);
    expect(mapped.files[0]).not.toHaveProperty('storageKey');
    expect(JSON.stringify(mapped)).not.toContain('secret.pdf');
  });
});
