import { NotificationsService } from './notifications.service';

describe('NotificationsService mobile history filters', () => {
  const user = { id: 'user-1' } as any;

  function build() {
    const notification = {
      count: jest.fn(async () => 1),
      findMany: jest.fn(async () => [
        {
          count: 1,
          createdAt: new Date('2026-08-20T06:00:00.000Z'),
          entityId: 'leave-1',
          entityType: 'LeaveRequest',
          id: 'n1',
          link: '/approvals',
          message: 'message',
          metadata: null,
          readAt: null,
          severity: 'INFO',
          sourceKey: 'key-1',
          title: 'title',
          type: 'LEAVE_PENDING_APPROVAL',
          updatedAt: new Date('2026-08-20T06:00:00.000Z'),
          userId: 'user-1',
        },
      ]),
    };
    const prisma = {
      employee: { findMany: jest.fn(async () => []) },
      notification,
    };
    const service = new NotificationsService(prisma as never, {} as never, {} as never);

    /* isolate the history query from the live-notification synchronizers */
    (service as any).syncAttendanceAlerts = jest.fn(async () => undefined);
    (service as any).syncPayrollReviewAlerts = jest.fn(async () => undefined);
    (service as any).buildNotificationItems = jest.fn(async () => []);
    (service as any).syncLiveNotifications = jest.fn(async () => undefined);
    (service as any).closeResolvedAttendanceLiveNotifications = jest.fn(async () => undefined);
    (service as any).closeResolvedApprovalLiveNotifications = jest.fn(async () => undefined);

    return { notification, service };
  }

  it('adds entity type filters without changing normal pagination semantics', async () => {
    const { notification, service } = build();

    await service.listNotificationHistory(user, {
      entityTypes: ['LeaveRequest', 'OvertimeRequest'],
      limit: 20,
      page: 2,
      status: 'unread',
    });

    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: {
          entityType: { in: ['LeaveRequest', 'OvertimeRequest'] },
          readAt: null,
          userId: 'user-1',
        },
      }),
    );
  });

  it('OTHER-style exclusion includes null entity types', async () => {
    const { notification, service } = build();

    await service.listNotificationHistory(user, {
      excludeEntityTypes: ['LeaveRequest'],
    });

    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { entityType: null },
            { entityType: { notIn: ['LeaveRequest'] } },
          ],
          userId: 'user-1',
        },
      }),
    );
  });

  it('counts unread notifications for the same user scope', async () => {
    const { notification, service } = build();

    await expect(service.getUnreadCount(user)).resolves.toBe(1);
    expect(notification.count).toHaveBeenCalledWith({
      where: { readAt: null, userId: 'user-1' },
    });
  });
});
