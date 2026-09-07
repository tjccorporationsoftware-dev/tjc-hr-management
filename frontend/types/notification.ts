export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';

export type NotificationActor = {
  userId?: string | null;
  employeeId: string;
  employeeCode?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  position?: string | null;
  departmentName?: string | null;
};

export type NotificationItem = {
  id?: string;
  key: string;
  title: string;
  message: string;
  count: number;
  href: string;
  severity: NotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  type?: string;
  readAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  actor?: NotificationActor | null;
};

export type NotificationSummaryResponse = {
  totalCount: number;
  unreadCount: number;
  items: NotificationItem[];
  sidebarBadges: Record<string, number>;
  generatedAt: string;
};

export type NotificationInboxResponse = NotificationSummaryResponse;

export type NotificationListStatus = "all" | "unread" | "read";

export type NotificationListParams = {
  status?: NotificationListStatus;
  page?: number;
  limit?: number;
};

export type NotificationListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  status: NotificationListStatus;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  meta: NotificationListMeta;
  generatedAt: string;
};



export type MarkNotificationReadResponse = {
  success: true;
  id: string;
  readAt: string;
};

export type MarkAllNotificationsReadResponse = {
  success: true;
  readAt: string;
  updatedCount: number;
};

export type NotificationRealtimeEventType =
  | 'CONNECTED'
  | 'HEARTBEAT'
  | 'NOTIFICATION_UPDATED';

export type NotificationRealtimeEvent = {
  type: NotificationRealtimeEventType;
  totalCount: number;
  unreadCount: number;
  sidebarBadges: Record<string, number>;
  summary?: NotificationSummaryResponse;
  generatedAt: string;
};

export type NotificationStreamSubscription = {
  close: () => void;
};
