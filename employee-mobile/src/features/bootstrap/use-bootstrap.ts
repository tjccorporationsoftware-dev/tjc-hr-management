import { useQuery } from '@tanstack/react-query';

import { appDefaults } from '@/config/app-config';
import { useAuthStore } from '@/features/auth/auth.store';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

import { fetchBootstrap } from './bootstrap.api';

export function useBootstrap() {
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');

  return useQuery({
    enabled: isAuthenticated,
    queryFn: fetchBootstrap,
    queryKey: queryKeys.bootstrap,
    retry(failureCount, error) {
      // 404 = บัญชียังไม่ผูกกับพนักงาน, 403 = ไม่มีสิทธิ์ ESS — ลองใหม่ก็ไม่ช่วย
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    staleTime: appDefaults.bootstrapStaleTimeMs,
  });
}
