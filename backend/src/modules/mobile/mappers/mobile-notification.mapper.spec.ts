import { toMobileNotificationItem } from './mobile-notification.mapper';

describe('toMobileNotificationItem', () => {
  it('keeps notification type and entity identity but does not expose web href', () => {
    const result = toMobileNotificationItem({
      count: 1,
      createdAt: '2026-08-20T01:00:00.000Z',
      entityId: 'leave-1',
      entityType: 'LeaveRequest',
      href: '/approvals?type=LEAVE',
      id: 'notification-1',
      key: 'leave:1',
      message: 'มีคำขอรออนุมัติ',
      severity: 'WARNING',
      title: 'ใบลาใหม่',
      type: 'LEAVE_PENDING_APPROVAL',
    });

    expect(result).toEqual({
      actor: null,
      createdAt: '2026-08-20T01:00:00.000Z',
      entityId: 'leave-1',
      entityType: 'LeaveRequest',
      id: 'notification-1',
      message: 'มีคำขอรออนุมัติ',
      readAt: null,
      severity: 'WARNING',
      title: 'ใบลาใหม่',
      type: 'LEAVE_PENDING_APPROVAL',
    });
    expect(result).not.toHaveProperty('href');
  });

  it('ส่งเฉพาะข้อมูลที่ใช้แสดงผลของ actor ไม่ส่ง id ที่อ้างอิงตัวตนต่อ', () => {
    const result = toMobileNotificationItem({
      count: 1,
      createdAt: '2026-08-20T01:00:00.000Z',
      href: '/ess/requests',
      key: 'leave:2',
      message: 'อนุมัติใบลาของคุณแล้ว',
      severity: 'INFO',
      title: 'ใบลาได้รับอนุมัติ',
      actor: {
        userId: 'user-1',
        employeeId: 'employee-1',
        employeeCode: '250001',
        displayName: 'ผดุงเดช คำแดง',
        avatarUrl: '/uploads/avatars/a.jpg',
        position: 'ผู้จัดการฝ่ายบุคคล',
        departmentName: 'ทรัพยากรบุคคล',
      },
    });

    expect(result.actor).toEqual({
      avatarUrl: '/uploads/avatars/a.jpg',
      departmentName: 'ทรัพยากรบุคคล',
      displayName: 'ผดุงเดช คำแดง',
      employeeCode: '250001',
      position: 'ผู้จัดการฝ่ายบุคคล',
    });
    // ไม่มี key ตัวไหนหลุดออกไปว่าคนคนนี้คือ user/employee ไหนในระบบ
    expect(result.id).toBe('leave:2');
  });

  it('เติม null ให้ฟิลด์ที่ไม่ได้ส่งมา แทนที่จะปล่อยเป็น undefined', () => {
    const result = toMobileNotificationItem({
      count: 1,
      href: '/attendance',
      key: 'attendance:1',
      message: 'ลงเวลาไม่ครบ',
      severity: 'WARNING',
      title: 'เวลาไม่ครบ',
      actor: null,
    });

    expect(result.actor).toBeNull();
    expect(result.createdAt).toBeNull();
    expect(result.entityId).toBeNull();
    expect(result.entityType).toBeNull();
    expect(result.readAt).toBeNull();
    expect(result.type).toBeNull();
  });
});
