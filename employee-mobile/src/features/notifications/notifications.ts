import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * ศูนย์แจ้งเตือน — กล่องเดียวกับบนเว็บ
 *
 * อ่านบนมือถือแล้วต้องหายจากเว็บด้วย ไม่ใช่คนละกล่อง จึงเรียก endpoint
 * ที่ห่อ NotificationsService ตัวเดิม ไม่ได้เก็บสถานะอ่านไว้ในเครื่อง
 */

export const NOTIFICATION_STATUSES = ['ALL', 'UNREAD', 'READ'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_CATEGORIES = [
  'ALL',
  'REQUEST',
  'DOCUMENT',
  'ATTENDANCE',
  'HR',
  'OTHER',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationFilters {
  category?: NotificationCategory;
  status?: NotificationStatus;
}

/**
 * คนที่ทำให้เกิดแจ้งเตือนนี้ — มีเฉพาะรายการที่คนเป็นคนทำ
 *
 * ระบบสร้างเองก็มี (มาสาย เวลาไม่ครบ) รายการพวกนั้น `actor` เป็น null
 * ซึ่งเป็นสัญญาณที่ใช้แยกได้ว่ารายการไหนมี "คน" อยู่เบื้องหลัง
 */
const notificationActorSchema = z.object({
  avatarUrl: z.string().nullish(),
  departmentName: z.string().nullish(),
  displayName: z.string().default(''),
  employeeCode: z.string().nullish(),
  position: z.string().nullish(),
});

export type NotificationActor = z.infer<typeof notificationActorSchema>;

export const notificationSchema = z.object({
  actor: notificationActorSchema.nullish(),
  createdAt: z.coerce.date().nullish(),
  entityId: z.string().nullish(),
  entityType: z.string().nullish(),
  id: z.string(),
  message: z.string(),
  readAt: z.coerce.date().nullish(),
  severity: z.string().nullish(),
  title: z.string(),
  type: z.string().nullish(),
});

export type NotificationItem = z.infer<typeof notificationSchema>;

export const notificationInboxSchema = z.object({
  generatedAt: z.coerce.date().nullish(),
  items: z.array(notificationSchema).default([]),
  meta: z
    .object({
      hasMore: z.boolean().default(false),
      page: z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
      total: z.coerce.number().default(0),
      totalPages: z.coerce.number().default(0),
    })
    .default({
      hasMore: false,
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    }),
  unreadCount: z.coerce.number().default(0),
});

export type NotificationInbox = z.infer<typeof notificationInboxSchema>;

const retryServerErrorsOnly = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) {
    return false;
  }

  return failureCount < 2;
};

async function fetchInbox(
  filters: NotificationFilters,
  page: number,
): Promise<NotificationInbox> {
  const search = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (filters.status && filters.status !== 'ALL') {
    search.set('status', filters.status);
  }
  if (filters.category && filters.category !== 'ALL') {
    search.set('category', filters.category);
  }

  const payload = await apiClient.get<unknown>(
    `/mobile/v1/notifications?${search.toString()}`,
  );
  const result = notificationInboxSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export function useNotifications(filters: NotificationFilters = {}) {
  return useInfiniteQuery({
    getNextPageParam: (lastPage: NotificationInbox) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchInbox(filters, pageParam),
    queryKey: queryKeys.notifications(filters),
    retry: retryServerErrorsOnly,
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    /* หน้าหลักแสดงจำนวนที่ยังไม่อ่าน ต้องอัปเดตพร้อมกัน */
    void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
  };

  const markOne = useMutation({
    mutationFn: (id: string) =>
      apiClient.post<unknown>(
        `/mobile/v1/notifications/${encodeURIComponent(id)}/read`,
        {},
      ),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () =>
      apiClient.post<unknown>('/mobile/v1/notifications/read-all', {}),
    onSuccess: invalidate,
  });

  return { markAll, markOne };
}
