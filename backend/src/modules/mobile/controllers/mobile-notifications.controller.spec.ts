import { MobileNotificationsController } from './mobile-notifications.controller';

describe('MobileNotificationsController', () => {
  const user = { id: 'user-1' } as any;

  function build() {
    const notifications = {
      getUnreadCount: jest.fn(async () => 7),
      listNotificationHistory: jest.fn(async () => ({
        generatedAt: '2026-08-20T06:00:00.000Z',
        items: [
          {
            count: 1,
            entityId: 'leave-1',
            entityType: 'LeaveRequest',
            href: '/approvals',
            id: 'n1',
            key: 'leave:1',
            message: 'มีคำขอรออนุมัติ',
            severity: 'WARNING',
            title: 'ใบลาใหม่',
            type: 'LEAVE_PENDING_APPROVAL',
          },
        ],
        meta: { limit: 20, page: 2, status: 'unread', total: 45, totalPages: 3 },
      })),
      markAllRead: jest.fn(async () => ({ success: true })),
      markRead: jest.fn(async () => ({ success: true })),
    };

    const pushPreferences = {
      list: jest.fn(async () => ({ items: [] })),
      update: jest.fn(async () => ({ items: [] })),
    };

    return {
      controller: new MobileNotificationsController(
        notifications as never,
        pushPreferences as never,
      ),
      notifications,
      pushPreferences,
    };
  }

  it('maps mobile pagination and request category to domain history query', async () => {
    const { controller, notifications } = build();

    const result = await controller.inbox(user, {
      category: 'REQUEST',
      page: 2,
      pageSize: 20,
      status: 'UNREAD',
    });

    expect(notifications.listNotificationHistory).toHaveBeenCalledWith(user, {
      entityTypes: [
        'LeaveRequest',
        'OvertimeRequest',
        'TimeAdjustRequest',
        'OffsiteWorkRequest',
      ],
      limit: 20,
      page: 2,
      status: 'unread',
    });
    expect(result.meta).toEqual({
      hasMore: true,
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
    expect(result.unreadCount).toBe(7);
    expect(result.items[0]).toMatchObject({
      entityId: 'leave-1',
      type: 'LEAVE_PENDING_APPROVAL',
    });
  });

  it('maps OTHER to an exclusion filter instead of loading known categories', async () => {
    const { controller, notifications } = build();

    await controller.inbox(user, { category: 'OTHER' });

    expect(notifications.listNotificationHistory).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        excludeEntityTypes: [
          'LeaveRequest',
          'OvertimeRequest',
          'TimeAdjustRequest',
          'OffsiteWorkRequest',
          'DocumentRequest',
          'AttendanceDailySummary',
          'HrReviewItem',
        ],
      }),
    );
  });
});
