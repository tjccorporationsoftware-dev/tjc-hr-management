import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * อุปกรณ์ที่ผูกกับบัญชีนี้
 *
 * มีไว้ให้ผู้ใช้ถอนสิทธิ์เครื่องที่ทำหายได้เองทันที โดยไม่ต้องรอ IT — เวลาที่
 * เครื่องหายไปกับข้อมูลเงินเดือนค้างอยู่ ทุกนาทีมีค่า
 *
 * การถอนสิทธิ์เป็น mutation ที่ย้อนกลับไม่ได้ จึงต้องมี idempotency key
 * กันการกดซ้ำตอนสัญญาณไม่ดีแล้วเผลอถอนเครื่องอื่นตามไปด้วย
 */

export const deviceSchema = z.object({
  appVersion: z.string().nullish(),
  createdAt: z.coerce.date().nullish(),
  deviceModel: z.string().nullish(),
  deviceName: z.string().nullish(),
  id: z.string(),
  installationId: z.string(),
  isCurrentDevice: z.boolean().default(false),
  lastSeenAt: z.coerce.date().nullish(),
  osVersion: z.string().nullish(),
  platform: z.string().nullish(),
  pushStatus: z.string().nullish(),
});

export type MobileDevice = z.infer<typeof deviceSchema>;

/**
 * endpoint นี้คืน **อาร์เรย์เปล่า ๆ** ไม่ใช่ออบเจ็กต์ที่มี `data` ข้างใน
 *
 * ตัวห่อ response ของ backend (ResponseInterceptor) เห็นว่า handler คืนก้อนที่มี
 * คีย์ `data` อยู่แล้ว จึงถือว่าเป็น "standard payload" แล้วยกไส้ในขึ้นมาเป็น
 * `data` ของ envelope ตรง ๆ (`{ success, data: [...], summary }`) ฝั่งแอปแกะ
 * `envelope.data` ออกมาจึงได้อาร์เรย์ ไม่ใช่ `{ data, summary }`
 *
 * เดิม schema ที่นี่รออ็อบเจ็กต์ ทำให้จอความปลอดภัยขึ้น "ข้อมูลตอบกลับจาก
 * ระบบไม่ถูกต้อง" ตลอด — รายการอุปกรณ์เลยใช้ไม่ได้เลยทั้งที่ backend ปกติดี
 * (endpoint อื่นในแอปไม่โดนเพราะตั้งชื่อคีย์ว่า `items` ไม่ใช่ `data`)
 */
const deviceListSchema = z.array(deviceSchema);

export function useDevices() {
  return useQuery({
    queryFn: async () => {
      const payload = await apiClient.get<unknown>('/mobile/v1/devices');
      const result = deviceListSchema.safeParse(payload);

      if (!result.success) {
        throw ApiError.invalidResponse(result.error.issues);
      }

      /* จำนวนรวมนับเองจากรายการ — `summary` ของ envelope ถูกทิ้งตอนแกะห่อ */
      return { data: result.data, summary: { total: result.data.length } };
    },
    queryKey: queryKeys.devices,
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    staleTime: 60_000,
  });
}

export function useRevokeDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deviceId: string) =>
      runIdempotentMutation({
        execute: (idempotencyKey) =>
          apiClient.delete<unknown>(
            `/mobile/v1/devices/${encodeURIComponent(deviceId)}`,
            { idempotencyKey },
          ),
        payload: { deviceId },
        scope: 'device:revoke',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useRevokeOtherDevices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      runIdempotentMutation({
        execute: (idempotencyKey) =>
          apiClient.post<unknown>(
            '/mobile/v1/devices/revoke-others',
            {},
            { idempotencyKey },
          ),
        scope: 'device:revoke-others',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}
