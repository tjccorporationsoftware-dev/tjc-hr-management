import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';
import {
  APPROVAL_SLUG,
  APPROVAL_TYPES,
  requestAttachmentSchema,
  requestDetailFieldSchema,
  requestTimelineItemSchema,
  type ApprovalType,
} from '@/features/requests/requests.types';

export type { ApprovalType };

/**
 * กล่องรออนุมัติของหัวหน้า
 *
 * ใบเอกสาร (DOCUMENT) ไม่มาที่นี่โดยตั้งใจ — backend คัดออกให้แล้ว
 * เพราะต้องเปิดไฟล์แนบและแบบฟอร์มเต็มก่อนตัดสินใจ ทำบนมือถือแล้วเสี่ยง
 * กดอนุมัติโดยไม่ได้อ่านจริง
 */

export const approvalItemSchema = z.object({
  /* รูปโปรไฟล์ของคนยื่น — backend รุ่นเก่ายังไม่ส่งมา จึงต้องเป็น nullish */
  avatarUrl: z.string().nullish(),
  branch: z.string().nullish(),
  createdAt: z.coerce.date().nullish(),
  department: z.string().nullish(),
  employeeCode: z.string().nullish(),
  employeeName: z.string().nullish(),
  id: z.string(),
  position: z.string().nullish(),
  reason: z.string().nullish(),
  requestNo: z.string().nullish(),
  requestStatus: z.string().nullish(),
  status: z.string().nullish(),
  submittedAt: z.coerce.date().nullish(),
  summary: z.string().nullish(),
  title: z.string(),
  type: z.enum(APPROVAL_TYPES),
});

export type ApprovalItem = z.infer<typeof approvalItemSchema>;

export const approvalDetailSchema = approvalItemSchema.extend({
  attachments: z.array(requestAttachmentSchema).default([]),
  details: z.array(requestDetailFieldSchema).default([]),
  timeline: z.array(requestTimelineItemSchema).default([]),
});

export type ApprovalDetail = z.infer<typeof approvalDetailSchema>;

const approvalListSchema = z.object({
  items: z.array(approvalItemSchema).default([]),
  meta: z
    .object({
      hasMore: z.boolean().default(false),
      page: z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
      total: z.coerce.number().default(0),
      totalExact: z.boolean().default(true),
      totalPages: z.coerce.number().default(0),
    })
    .default({
      hasMore: false,
      page: 1,
      pageSize: 20,
      total: 0,
      totalExact: true,
      totalPages: 0,
    }),
});

type ApprovalList = z.infer<typeof approvalListSchema>;

export type ApprovalAction = 'approve' | 'reject' | 'return';

export type ApprovalStatus =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED';

export interface ApprovalListFilters {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  status?: ApprovalStatus;
  type?: ApprovalType;
}

const approvalKeys = {
  all: ['approvals'] as const,
  detail: (type: ApprovalType, id: string) =>
    ['approvals', 'detail', type, id] as const,
  list: (filters: ApprovalListFilters) =>
    [
      'approvals',
      'list',
      filters.type ?? 'ALL',
      filters.status ?? 'SUBMITTED',
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

async function fetchApprovals(
  filters: ApprovalListFilters,
  page: number,
): Promise<ApprovalList> {
  const search = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (filters.type) search.set('type', APPROVAL_SLUG[filters.type]);
  if (filters.status) search.set('status', filters.status);
  if (filters.search?.trim()) search.set('search', filters.search.trim());
  if (filters.dateFrom) search.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) search.set('dateTo', filters.dateTo);

  const payload = await apiClient.get<unknown>(
    `/mobile/v1/approvals?${search.toString()}`,
  );
  const result = approvalListSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

async function fetchApprovalDetail(
  type: ApprovalType,
  id: string,
): Promise<ApprovalDetail> {
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/approvals/${APPROVAL_SLUG[type]}/${encodeURIComponent(id)}`,
  );
  const result = approvalDetailSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export function useApprovals(
  filters: ApprovalListFilters = {},
  enabled = true,
) {
  return useInfiniteQuery({
    /* ปิดได้เพราะจอเดียวกันมีสองผิว (พนักงาน/ผู้บริหาร) ตัวที่ไม่ได้แสดง
       ต้องไม่ยิงคิวของตัวเองทิ้งไว้เบื้องหลัง */
    enabled,
    getNextPageParam: (lastPage: ApprovalList) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchApprovals(filters, pageParam),
    queryKey: approvalKeys.list(filters),
    retry: retryServerErrorsOnly,
    /* คิวอนุมัติเปลี่ยนตลอดเวลา คนอื่นอาจอนุมัติไปแล้ว ต้องสดกว่าจออื่น */
    staleTime: 15_000,
  });
}

export function useApprovalDetail(
  type: ApprovalType | undefined,
  id: string | undefined,
) {
  return useQuery({
    enabled: Boolean(type && id),
    queryFn: () => fetchApprovalDetail(type as ApprovalType, id as string),
    queryKey:
      type && id
        ? approvalKeys.detail(type, id)
        : [...approvalKeys.all, 'detail', 'idle'],
    retry: retryServerErrorsOnly,
    /* เปิด Sheet ต้องเห็นสถานะล่าสุดก่อนตัดสินใจ */
    staleTime: 0,
  });
}

export function useApprovalAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      action: ApprovalAction;
      id: string;
      reason?: string;
      type: ApprovalType;
    }) => {
      const payload = input.reason ? { reason: input.reason } : {};
      return runIdempotentMutation({
        scope: `approval:${input.action}:${input.type}:${input.id}`,
        payload,
        execute: (idempotencyKey) =>
          apiClient.post<unknown>(
            `/mobile/v1/approvals/${APPROVAL_SLUG[input.type]}/${encodeURIComponent(
              input.id,
            )}/${input.action}`,
            payload,
            { idempotencyKey },
          ),
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      /* badge บนแท็บกับตัวเลขหน้าหลักมาจาก bootstrap ต้องอัปเดตด้วย */
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
