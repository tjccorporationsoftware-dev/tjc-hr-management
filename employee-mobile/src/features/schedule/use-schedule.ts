import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';

import { fetchSchedule } from './schedule.api';

const retryServerErrorsOnly = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) {
    return false;
  }
  return failureCount < 2;
};

export function useSchedule(enabled: boolean, year: number, month: number) {
  return useQuery({
    enabled,
    queryFn: () => fetchSchedule(year, month),
    queryKey: ['schedule', year, month],
    retry: retryServerErrorsOnly,
    staleTime: 60_000,
  });
}
