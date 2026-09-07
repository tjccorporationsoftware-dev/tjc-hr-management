import { resolveNotificationDestination } from './notification-navigation';

const flags = {
  announcements: true,
  approvals: true,
  attendance: true,
  attendancePhotoRequired: false,
  complaints: true,
  documents: true,
  executive: false,
  leave: true,
  offlinePunch: true,
  offsite: true,
  overtime: true,
  payslip: true,
  schedule: true,
  team: true,
  timeAdjust: true,
};

describe('resolveNotificationDestination', () => {
  it('opens pending request notifications in approval detail, not requester detail', () => {
    expect(
      resolveNotificationDestination(
        {
          entityId: 'leave-1',
          entityType: 'LeaveRequest',
          notificationType: 'LEAVE_PENDING_APPROVAL',
        },
        flags,
      ),
    ).toEqual({
      params: { openId: 'leave-1', status: 'SUBMITTED', type: 'LEAVE' },
      pathname: '/approvals',
    });
  });

  it('opens requester result notification in self request detail', () => {
    expect(
      resolveNotificationDestination(
        {
          entityId: 'ot-1',
          entityType: 'OvertimeRequest',
          notificationType: 'OVERTIME_APPROVED',
        },
        flags,
      ),
    ).toEqual({
      params: { id: 'ot-1', type: 'OVERTIME' },
      pathname: '/request/[type]/[id]',
    });
  });

  it('keeps legacy requestType payload working', () => {
    expect(
      resolveNotificationDestination(
        { entityId: 'leave-1', requestType: 'LEAVE' },
        flags,
      ),
    ).toEqual({
      params: { id: 'leave-1', type: 'LEAVE' },
      pathname: '/request/[type]/[id]',
    });
  });

  it('opens employee document result but not manager document approval', () => {
    expect(
      resolveNotificationDestination(
        {
          entityId: 'doc-1',
          entityType: 'DocumentRequest',
          notificationType: 'DOCUMENT_APPROVED',
        },
        flags,
      ),
    ).toEqual({ params: { id: 'doc-1' }, pathname: '/document/[id]' });

    /*
     * แจ้งเตือนของผู้อนุมัติต้องไปกล่องอนุมัติ ไม่ใช่จอคำร้องของตัวเอง —
     * ผู้อนุมัติไม่ใช่เจ้าของใบ เปิดจอ ESS แล้วจะเจอ 404
     */
    expect(
      resolveNotificationDestination(
        {
          entityId: 'doc-1',
          entityType: 'DocumentRequest',
          notificationType: 'DOCUMENT_PENDING_APPROVAL',
        },
        flags,
      ),
    ).toEqual({
      params: { openId: 'doc-1', status: 'SUBMITTED', type: 'DOCUMENT' },
      pathname: '/approvals',
    });
  });

  it('เอกสารรออนุมัติต้องไม่พาไปไหนเมื่อผู้ใช้ไม่มีสิทธิ์อนุมัติ', () => {
    expect(
      resolveNotificationDestination(
        {
          entityId: 'doc-1',
          entityType: 'DocumentRequest',
          notificationType: 'DOCUMENT_PENDING_APPROVAL',
        },
        { ...flags, approvals: false },
      ),
    ).toBeNull();
  });

  it('does not navigate to a feature that bootstrap says is unavailable', () => {
    expect(
      resolveNotificationDestination(
        {
          entityId: 'leave-1',
          entityType: 'LeaveRequest',
          notificationType: 'LEAVE_PENDING_APPROVAL',
        },
        { ...flags, approvals: false },
      ),
    ).toBeNull();
  });

  it('returns null for entities without a mobile screen', () => {
    expect(
      resolveNotificationDestination(
        {
          entityId: 'hr-1',
          entityType: 'HrReviewItem',
          notificationType: 'HR_REVIEW_REQUIRED',
        },
        flags,
      ),
    ).toBeNull();
  });
});
