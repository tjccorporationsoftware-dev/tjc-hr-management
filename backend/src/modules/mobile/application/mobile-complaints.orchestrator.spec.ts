import { MobileComplaintsOrchestrator } from './mobile-complaints.orchestrator';

describe('MobileComplaintsOrchestrator', () => {
  const user = { id: 'user-1' } as never;

  it('list ใช้ ESS self query และเพิ่ม hasMore จาก server pagination', async () => {
    const documents = {
      findEssComplaints: jest.fn(async () => ({
        items: [],
        meta: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
      })),
    };
    const service = new MobileComplaintsOrchestrator(documents as never);

    const result = await service.list(user, { page: 1, pageSize: 20 });

    expect(documents.findEssComplaints).toHaveBeenCalledWith(
      { page: 1, pageSize: 20 },
      user,
    );
    expect(result.meta.hasMore).toBe(true);
  });

  it('create ไม่ส่ง employeeId/companyId เพิ่มเอง และใช้ ESS domain service', async () => {
    const documents = {
      createEssComplaint: jest.fn(async (dto) => ({
        ...dto,
        id: 'cmp-1',
        complaintNo: 'CMP001',
        status: 'SUBMITTED',
      })),
    };
    const service = new MobileComplaintsOrchestrator(documents as never);

    await service.create(user, {
      title: 'ขอให้ตรวจสอบ',
      description: 'รายละเอียด',
    });

    expect(documents.createEssComplaint).toHaveBeenCalledWith(
      { title: 'ขอให้ตรวจสอบ', description: 'รายละเอียด' },
      user,
    );
  });
});
