import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

import {
  cancelComplaint,
  createComplaint,
  fetchComplaintDetail,
  fetchComplaints,
} from './complaints.api';
import type {
  ComplaintCreatePayload,
  ComplaintList,
  ComplaintListFilters,
} from './complaints.types';

const retryServerErrorsOnly = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) return false;
  return failureCount < 2;
};

export function useComplaintList(filters: ComplaintListFilters = {}) {
  return useInfiniteQuery({
    getNextPageParam: (lastPage: ComplaintList) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchComplaints({ ...filters, page: pageParam, pageSize: 20 }),
    queryKey: queryKeys.complaints(filters),
    retry: retryServerErrorsOnly,
    staleTime: 30_000,
  });
}

export function useComplaintDetail(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => fetchComplaintDetail(id),
    queryKey: queryKeys.complaintDetail(id),
    retry: retryServerErrorsOnly,
    staleTime: 15_000,
  });
}

function useInvalidateComplaints() {
  const client = useQueryClient();
  return (id?: string) => {
    void client.invalidateQueries({ queryKey: ['complaints'] });
    if (id) void client.invalidateQueries({ queryKey: queryKeys.complaintDetail(id) });
    void client.invalidateQueries({ queryKey: queryKeys.bootstrap });
  };
}

export function useCreateComplaint() {
  const invalidate = useInvalidateComplaints();
  return useMutation({
    mutationFn: (body: ComplaintCreatePayload) => createComplaint(body),
    onSuccess: (data) => invalidate(data.id),
  });
}

export function useCancelComplaint() {
  const invalidate = useInvalidateComplaints();
  return useMutation({
    mutationFn: (input: { id: string; note?: string }) =>
      cancelComplaint(input.id, input.note),
    onSuccess: (data) => invalidate(data.id),
  });
}
