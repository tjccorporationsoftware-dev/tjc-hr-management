import { approvalDetailSchema } from '@/features/approvals/approvals';
import {
  requestDetailSchema,
  requestListSchema,
} from '@/features/requests/requests.types';

describe('Mobile request contracts', () => {
  const base = {
    id: 'leave-1',
    status: 'SUBMITTED',
    title: 'ลาป่วย',
    type: 'LEAVE',
  };

  it('อ่าน pagination meta จาก backend ได้', () => {
    const result = requestListSchema.parse({
      items: [base],
      meta: {
        hasMore: true,
        page: 1,
        pageSize: 20,
        total: 25,
        totalPages: 2,
      },
    });

    expect(result.meta).toEqual({
      hasMore: true,
      page: 1,
      pageSize: 20,
      total: 25,
      totalPages: 2,
    });
  });

  it('แปลง timeline และ attachment dates เป็น Date', () => {
    const result = requestDetailSchema.parse({
      ...base,
      attachments: [
        {
          createdAt: '2026-08-20T03:00:00.000Z',
          downloadSupported: true,
          fileName: 'medical.pdf',
          id: 'attachment-1',
        },
      ],
      details: [{ label: 'จำนวนวัน', value: '1 วัน' }],
      timeline: [
        {
          actedAt: '2026-08-20T04:00:00.000Z',
          id: 'step-1',
          status: 'APPROVED',
          stepNo: 1,
          title: 'หัวหน้างาน',
        },
      ],
    });

    expect(result.attachments[0]?.createdAt).toBeInstanceOf(Date);
    expect(result.timeline[0]?.actedAt).toBeInstanceOf(Date);
  });

  /*
   * แอปรุ่นเก่ายังต้องอ่าน response ใหม่ได้ และแอปรุ่นใหม่ต้องอ่าน response
   * จาก backend ที่ยังไม่ได้ deploy ได้ด้วย (§3.1 ข้อ 9 รองรับข้ามรุ่น)
   * สามฟิลด์นี้จึงต้อง default เป็น [] ไม่ใช่ throw
   */
  it('approval detail รุ่นใหม่มีรายละเอียดและยังรับ payload รุ่นเก่าได้', () => {
    const oldPayload = approvalDetailSchema.parse({
      employeeName: 'สมชาย ใจดี',
      ...base,
    });

    expect(oldPayload.attachments).toEqual([]);
    expect(oldPayload.details).toEqual([]);
    expect(oldPayload.timeline).toEqual([]);
  });
});
