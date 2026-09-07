import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * เปิด/ปิดแจ้งเตือนเข้าเครื่องเป็นรายหมวด
 *
 * ค่านี้เป็นของ **บัญชี** ไม่ใช่ของเครื่อง — ปิดจากมือถือเครื่องหนึ่งแล้วต้อง
 * เงียบทุกเครื่องที่ลงชื่อด้วยบัญชีเดียวกัน จึงเก็บที่ backend ไม่ใช่ในเครื่อง
 *
 * ปิดที่นี่คุมแค่การเด้งขึ้นจอ — รายการในศูนย์แจ้งเตือนยังขึ้นครบเสมอ
 */

const preferenceSchema = z.object({
  category: z.string(),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  label: z.string().default(''),
});

const preferenceListSchema = z.object({
  items: z.array(preferenceSchema).default([]),
});

export type PushPreference = z.infer<typeof preferenceSchema>;

function parse(payload: unknown) {
  const result = preferenceListSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export function usePushPreferences(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () =>
      parse(
        await apiClient.get<unknown>('/mobile/v1/notifications/preferences'),
      ),
    queryKey: queryKeys.notificationPushPreferences,
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdatePushPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { category: string; enabled: boolean }) =>
      parse(
        await apiClient.patch<unknown>(
          '/mobile/v1/notifications/preferences',
          input,
        ),
      ),
    /*
     * เขียนคำตอบของ server ลงแคชตรง ๆ ไม่ใช่ invalidate — server คืนรายการ
     * ครบทั้งชุดหลังอัปเดตอยู่แล้ว การ invalidate จะยิงซ้ำอีกรอบเพื่อข้อมูล
     * ชุดเดียวกัน แล้วสวิตช์จะกระพริบกลับค่าเก่าหนึ่งจังหวะระหว่างรอ
     */
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.notificationPushPreferences, data);
    },
  });
}
