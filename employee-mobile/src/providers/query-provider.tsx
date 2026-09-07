import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { appDefaults } from '@/config/app-config';
import { ApiError } from '@/lib/api/api-error';
import { installQueryFocusManager } from '@/lib/query/focus';

/*
 * ต้องต่อก่อนสร้าง QueryClient — react-query อ่าน focusManager ตอน query
 * ตัวแรกเริ่มทำงาน ถ้าต่อทีหลังใน useEffect จะพลาดรอบแรกไป
 */
installQueryFocusManager();

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      gcTime: appDefaults.queryGarbageCollectionMs,
      /*
       * เปิดไว้และต่อ AppState ให้แล้วใน installQueryFocusManager()
       *
       * เดิมปิดไว้ ซึ่งบนมือถือแปลว่าข้อมูลไม่มีวันสดขึ้นเองเลย ต้องให้ผู้ใช้
       * ลากรีเฟรชทุกครั้ง — ผู้ใช้ที่ไม่รู้ว่าต้องลากจะเห็นข้อมูลเก่าค้าง
       * โดยไม่มีอะไรบอก
       *
       * staleTime ของแต่ละ query เป็นตัวคุมว่าจะยิงจริงแค่ไหน ไม่ใช่ยิงทุกครั้ง
       * ที่สลับแอป
       */
      refetchOnWindowFocus: true,
      retry(failureCount, error) {
        if (error instanceof ApiError && error.status && error.status < 500) {
          return false;
        }

        return failureCount < 2;
      },
      staleTime: appDefaults.bootstrapStaleTimeMs,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
