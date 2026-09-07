import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { queryKeys } from '@/lib/query/query-keys';

import { punchQueue } from './punch-queue';

const QUEUE_KEY = ['attendance', 'punch-queue'] as const;

/**
 * รายการลงเวลาที่ยังส่งไม่สำเร็จ
 *
 * ลองส่งใหม่อัตโนมัติเมื่อผู้ใช้กลับมาที่แอป — เป็นจังหวะที่มีโอกาสมีเน็ตสูงสุด
 * และไม่ต้องเพิ่ม dependency ตรวจสถานะเครือข่ายมาอีกตัวเพื่อเรื่องเดียว
 */
export function usePunchQueue() {
  const queryClient = useQueryClient();

  const queue = useQuery({
    queryFn: () => punchQueue.list(),
    queryKey: QUEUE_KEY,
    /* คิวเปลี่ยนจากการกระทำของผู้ใช้เท่านั้น ไม่ต้อง poll */
    staleTime: Infinity,
  });

  const flush = useMutation({
    mutationFn: () => punchQueue.flush(),
    onSuccess(result) {
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });

      /* ส่งสำเร็จอย่างน้อยหนึ่งรายการ = ข้อมูลเวลาบนหน้าอื่นเปลี่ยนแล้ว */
      if (result.sent > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
        void queryClient.invalidateQueries({
          /* เหตุผลเดียวกับใน use-punch.ts — ไม่ต้องอ่าน GPS ใหม่ */
          predicate: (query) =>
            query.queryKey[0] === 'attendance' &&
            query.queryKey[1] !== 'current-location',
        });
      }
    },
  });

  const { mutate: runFlush } = flush;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runFlush();
      }
    });

    return () => subscription.remove();
  }, [runFlush]);

  return {
    flush,
    items: queue.data ?? [],
    pendingCount: queue.data?.length ?? 0,
    refetch: queue.refetch,
  };
}
