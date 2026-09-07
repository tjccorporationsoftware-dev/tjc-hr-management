import {
  toMobileComplaintDetail,
  toMobileComplaintListItem,
} from './mobile-complaint.mapper';

describe('mobile complaint mapper', () => {
  it('list ส่งเฉพาะข้อมูลสรุป ไม่เผย identity/path ภายใน', () => {
    const mapped = toMobileComplaintListItem({
      id: 'cmp-1',
      complaintNo: 'CMP20260820001',
      title: 'ทดสอบ',
      status: 'SUBMITTED',
      employeeId: 'employee-secret',
      companyId: 'company-secret',
      submittedById: 'user-secret',
    } as never);

    expect(mapped).toEqual(
      expect.objectContaining({
        id: 'cmp-1',
        complaintNo: 'CMP20260820001',
        status: 'SUBMITTED',
      }),
    );
    expect(mapped).not.toHaveProperty('employeeId');
    expect(mapped).not.toHaveProperty('companyId');
    expect(mapped).not.toHaveProperty('submittedById');
  });

  it('detail ให้ถอนเรื่องได้เฉพาะ SUBMITTED และลดข้อมูล handler เหลือที่ใช้บนมือถือ', () => {
    const pending = toMobileComplaintDetail({
      id: 'cmp-1',
      status: 'SUBMITTED',
      description: 'รายละเอียด',
      handledBy: { id: 'user-2', displayName: 'HR', email: 'private@example.com' },
    } as never);
    const inProgress = toMobileComplaintDetail({ id: 'cmp-2', status: 'IN_PROGRESS' } as never);

    expect(pending.capabilities.canCancel).toBe(true);
    expect(inProgress.capabilities.canCancel).toBe(false);
    expect(pending.handler).toEqual({ displayName: 'HR' });
    expect(pending.handler).not.toHaveProperty('email');
  });
});
