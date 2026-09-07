import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';

import {
  cancelRequest,
  createRequest,
  deleteDraftRequest,
  fetchLeaveCatalog,
  fetchOvertimeDayType,
  fetchRequestDetail,
  fetchRequests,
  submitRequest,
  updateRequest,
} from './requests.api';
import type {
  RequestList,
  RequestListFilters,
  RequestType,
} from './requests.types';

const requestKeys = {
  all: ['requests'] as const,
  catalog: ['requests', 'leave-catalog'] as const,
  overtimeDayType: (workDate: string) =>
    ['requests', 'overtime-day-type', workDate] as const,
  detail: (type: RequestType, id: string) =>
    ['requests', 'detail', type, id] as const,
  list: (filters: RequestListFilters) =>
    [
      'requests',
      'list',
      filters.type ?? 'ALL',
      filters.status ?? 'ALL',
      filters.search ?? '',
      filters.dateFrom ?? '',
      filters.dateTo ?? '',
    ] as const,
};

const retryServerErrorsOnly = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) {
    return false;
  }

  return failureCount < 2;
};

export function useRequestList(filters: RequestListFilters = {}) {
  return useInfiniteQuery({
    getNextPageParam: (lastPage: RequestList) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchRequests({ ...filters, page: pageParam, pageSize: 20 }),
    queryKey: requestKeys.list(filters),
    retry: retryServerErrorsOnly,
    staleTime: 30_000,
  });
}

export function useRequestDetail(type: RequestType, id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => fetchRequestDetail(type, id),
    queryKey: requestKeys.detail(type, id),
    retry: retryServerErrorsOnly,
    staleTime: 15_000,
  });
}

export function useLeaveCatalog(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: fetchLeaveCatalog,
    queryKey: requestKeys.catalog,
    retry: retryServerErrorsOnly,
    staleTime: 30_000,
  });
}

/**
 * ประเภทวันของใบ OT ตามปฏิทินวันหยุด
 *
 * ผูกกับวันที่ที่เลือกอยู่ เปลี่ยนวันแล้วถามใหม่ ปฏิทินไม่ได้เปลี่ยนบ่อย
 * จึงเก็บ cache ไว้นานหน่อยเพื่อไม่ให้ยิงซ้ำตอนผู้ใช้เลื่อน picker ไปมา
 */
export function useOvertimeDayType(workDate: string | null) {
  return useQuery({
    enabled: Boolean(workDate),
    queryFn: () => fetchOvertimeDayType(workDate!),
    queryKey: requestKeys.overtimeDayType(workDate ?? ''),
    retry: retryServerErrorsOnly,
    staleTime: 5 * 60_000,
  });
}

/** ล้าง cache ทุกอย่างที่ยอด/สถานะคำขอมีผล */
function useInvalidateRequests() {
  const queryClient = useQueryClient();

  return (detail?: { id: string; type: RequestType }) => {
    void queryClient.invalidateQueries({ queryKey: requestKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });

    if (detail) {
      void queryClient.invalidateQueries({
        queryKey: requestKeys.detail(detail.type, detail.id),
      });
    }
  };
}

export function useCreateRequest() {
  const invalidate = useInvalidateRequests();

  return useMutation({
    mutationFn: (input: {
      body: Record<string, unknown>;
      submit: boolean;
      type: RequestType;
    }) => createRequest(input.type, input.body, input.submit),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRequest() {
  const invalidate = useInvalidateRequests();

  return useMutation({
    mutationFn: (input: {
      body: Record<string, unknown>;
      id: string;
      type: RequestType;
    }) => updateRequest(input.type, input.id, input.body),
    onSuccess: (_data, input) => invalidate({ id: input.id, type: input.type }),
  });
}

export function useSubmitRequest() {
  const invalidate = useInvalidateRequests();

  return useMutation({
    mutationFn: (input: { id: string; type: RequestType }) =>
      submitRequest(input.type, input.id),
    onSuccess: (_data, input) => invalidate({ id: input.id, type: input.type }),
  });
}

export function useDeleteDraftRequest() {
  const invalidate = useInvalidateRequests();

  return useMutation({
    mutationFn: (input: { id: string; type: RequestType }) =>
      deleteDraftRequest(input.type, input.id),
    onSuccess: () => invalidate(),
  });
}

export function useCancelRequest() {
  const invalidate = useInvalidateRequests();

  return useMutation({
    mutationFn: (input: { id: string; reason?: string; type: RequestType }) =>
      cancelRequest(input.type, input.id, input.reason),
    onSuccess: (_data, input) => invalidate({ id: input.id, type: input.type }),
  });
}
