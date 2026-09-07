import type { ZodType } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';

import {
  complaintDetailSchema,
  complaintListSchema,
  type ComplaintCreatePayload,
  type ComplaintDetail,
  type ComplaintList,
  type ComplaintListFilters,
} from './complaints.types';

function parse<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw ApiError.invalidResponse(parsed.error.issues);
  return parsed.data;
}

export async function fetchComplaints(
  params: ComplaintListFilters & { page?: number; pageSize?: number },
): Promise<ComplaintList> {
  const search = new URLSearchParams();
  if (params.search?.trim()) search.set('search', params.search.trim());
  if (params.status) search.set('status', params.status);
  if (params.category?.trim()) search.set('category', params.category.trim());
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  const query = search.toString();
  return parse(
    complaintListSchema,
    await apiClient.get<unknown>(`/mobile/v1/complaints${query ? `?${query}` : ''}`),
  );
}

export async function fetchComplaintDetail(id: string): Promise<ComplaintDetail> {
  return parse(
    complaintDetailSchema,
    await apiClient.get<unknown>(`/mobile/v1/complaints/${encodeURIComponent(id)}`),
  );
}

export async function createComplaint(
  body: ComplaintCreatePayload,
): Promise<ComplaintDetail> {
  return parse(
    complaintDetailSchema,
    await runIdempotentMutation({
      scope: 'complaint:create',
      payload: body,
      execute: (idempotencyKey) =>
        apiClient.post<unknown>('/mobile/v1/complaints', body, { idempotencyKey }),
    }),
  );
}

export async function cancelComplaint(
  id: string,
  note?: string,
): Promise<ComplaintDetail> {
  const payload = note?.trim() ? { note: note.trim() } : {};
  return parse(
    complaintDetailSchema,
    await runIdempotentMutation({
      scope: `complaint:cancel:${id}`,
      payload,
      execute: (idempotencyKey) =>
        apiClient.post<unknown>(
          `/mobile/v1/complaints/${encodeURIComponent(id)}/cancel`,
          payload,
          { idempotencyKey },
        ),
    }),
  );
}
