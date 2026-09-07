import { approvalBlockReason } from './approval-gate';

/**
 * ด่านกันอนุมัติเอกสารโดยไม่ได้อ่าน
 *
 * นี่คือเงื่อนไขเดียวที่ทำให้เปิดคำร้องเอกสารบนมือถือได้ ถ้าด่านนี้พังคือ
 * กลับไปสู่ปัญหาที่เคยเป็นเหตุผลให้ตัดฟีเจอร์นี้ออกทั้งประเภท
 */
describe('approvalBlockReason', () => {
  const attachment = (id: string) => ({
    createdAt: null,
    downloadSupported: true,
    fileName: `${id}.pdf`,
    id,
    mimeType: 'application/pdf',
    size: 1024,
    title: null,
  });

  const empty = new Set<string>();

  it('คำขอประเภทอื่นกดอนุมัติได้เลย ไม่ต้องเปิดไฟล์', () => {
    for (const type of ['LEAVE', 'OVERTIME', 'TIME_ADJUST', 'OFFSITE']) {
      expect(
        approvalBlockReason({
          detail: null,
          item: { id: 'r-1', type: type as never },
          openedAttachments: empty,
        }),
      ).toBeNull();
    }
  });

  it('เอกสารที่ยังไม่เคยเปิดแผ่นรายละเอียด ต้องกดอนุมัติไม่ได้', () => {
    const reason = approvalBlockReason({
      detail: null,
      item: { id: 'd-1', type: 'DOCUMENT' },
      openedAttachments: empty,
    });

    expect(reason).toBe('เปิดดูรายละเอียดและไฟล์แนบก่อนจึงจะอนุมัติได้');
  });

  it('เอกสารที่ไม่มีไฟล์แนบเลย กดได้ทันทีหลังเปิดดูรายละเอียด', () => {
    expect(
      approvalBlockReason({
        detail: { attachments: [] },
        item: { id: 'd-1', type: 'DOCUMENT' },
        openedAttachments: empty,
      }),
    ).toBeNull();
  });

  it('ยังเปิดไฟล์ไม่ครบ ต้องบอกว่าเหลืออีกกี่ไฟล์', () => {
    const reason = approvalBlockReason({
      detail: { attachments: [attachment('f-1'), attachment('f-2')] },
      item: { id: 'd-1', type: 'DOCUMENT' },
      openedAttachments: new Set(['d-1:f-1']),
    });

    expect(reason).toBe('เปิดอ่านไฟล์แนบให้ครบก่อน (เหลืออีก 1 ไฟล์)');
  });

  it('เปิดครบทุกไฟล์แล้วจึงกดอนุมัติได้', () => {
    expect(
      approvalBlockReason({
        detail: { attachments: [attachment('f-1'), attachment('f-2')] },
        item: { id: 'd-1', type: 'DOCUMENT' },
        openedAttachments: new Set(['d-1:f-1', 'd-1:f-2']),
      }),
    ).toBeNull();
  });

  it('ไฟล์ที่เปิดของใบอื่นต้องไม่นับให้ใบนี้', () => {
    const reason = approvalBlockReason({
      detail: { attachments: [attachment('f-1')] },
      item: { id: 'd-2', type: 'DOCUMENT' },
      /* id ไฟล์เดียวกันแต่คนละใบ — ต้องไม่ผ่าน */
      openedAttachments: new Set(['d-1:f-1']),
    });

    expect(reason).toBe('เปิดอ่านไฟล์แนบให้ครบก่อน (เหลืออีก 1 ไฟล์)');
  });
});
