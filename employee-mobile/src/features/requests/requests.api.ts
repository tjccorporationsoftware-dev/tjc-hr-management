import type { ZodType } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';

import {
  leaveCatalogSchema,
  overtimeDayTypeSchema,
  requestDetailSchema,
  requestListSchema,
  REQUEST_SLUG,
  type LeaveCatalog,
  type OvertimeDayType,
  type RequestDetail,
  type RequestList,
  type RequestListFilters,
  type RequestType,
} from './requests.types';

function parse<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export async function fetchRequests(
  params: RequestListFilters & { page?: number; pageSize?: number },
): Promise<RequestList> {
  const search = new URLSearchParams();

  if (params.type) search.set('type', params.type);
  if (params.status) search.set('status', params.status);
  if (params.search?.trim()) search.set('search', params.search.trim());
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  const query = search.toString();
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/requests${query ? `?${query}` : ''}`,
  );

  return parse(requestListSchema, payload);
}

export async function fetchRequestDetail(
  type: RequestType,
  id: string,
): Promise<RequestDetail> {
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/requests/${REQUEST_SLUG[type]}/${encodeURIComponent(id)}`,
  );

  return parse(requestDetailSchema, payload);
}

export async function fetchLeaveCatalog(): Promise<LeaveCatalog> {
  const payload = await apiClient.get<unknown>(
    '/mobile/v1/requests/leave/catalog',
  );

  return parse(leaveCatalogSchema, payload);
}

/** ถามระบบว่าวันที่เลือกเป็นวันประเภทไหนตามปฏิทินวันหยุด */
export async function fetchOvertimeDayType(
  workDate: string,
): Promise<OvertimeDayType> {
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/requests/overtime/day-type?workDate=${encodeURIComponent(workDate)}`,
  );

  return parse(overtimeDayTypeSchema, payload);
}

/** สร้างได้ทั้ง DRAFT และส่งทันทีตาม action ที่ผู้ใช้เลือก */
export async function createRequest(
  type: RequestType,
  body: Record<string, unknown>,
  submit: boolean,
): Promise<{ id: string | null }> {
  const payload = { ...body, submit };
  const created = await runIdempotentMutation({
    scope: `request:create:${type}`,
    payload,
    execute: (idempotencyKey) =>
      apiClient.post<unknown>(
        `/mobile/v1/requests/${REQUEST_SLUG[type]}`,
        payload,
        { idempotencyKey },
      ),
  });

  const id = (created as { id?: unknown } | null)?.id;

  return { id: typeof id === 'string' ? id : null };
}

export async function updateRequest(
  type: RequestType,
  id: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return runIdempotentMutation({
    scope: `request:update:${type}:${id}`,
    payload: body,
    execute: (idempotencyKey) =>
      apiClient.patch<unknown>(
        `/mobile/v1/requests/${REQUEST_SLUG[type]}/${encodeURIComponent(id)}`,
        body,
        { idempotencyKey },
      ),
  });
}

export async function submitRequest(
  type: RequestType,
  id: string,
): Promise<unknown> {
  return runIdempotentMutation({
    scope: `request:submit:${type}:${id}`,
    payload: { id, type },
    execute: (idempotencyKey) =>
      apiClient.post<unknown>(
        `/mobile/v1/requests/${REQUEST_SLUG[type]}/${encodeURIComponent(id)}/submit`,
        {},
        { idempotencyKey },
      ),
  });
}

export async function deleteDraftRequest(
  type: RequestType,
  id: string,
): Promise<unknown> {
  if (type !== 'OFFSITE') {
    throw ApiError.invalidRequest('ลบฉบับร่างผ่านแอปได้เฉพาะงานนอกสถานที่');
  }

  return runIdempotentMutation({
    scope: `request:delete:OFFSITE:${id}`,
    payload: { id, type },
    execute: (idempotencyKey) =>
      apiClient.delete<unknown>(
        `/mobile/v1/requests/offsite/${encodeURIComponent(id)}`,
        { idempotencyKey },
      ),
  });
}

export async function cancelRequest(
  type: RequestType,
  id: string,
  reason?: string,
): Promise<unknown> {
  const payload = reason ? { reason } : {};
  return runIdempotentMutation({
    scope: `request:cancel:${type}:${id}`,
    payload,
    execute: (idempotencyKey) =>
      apiClient.post<unknown>(
        `/mobile/v1/requests/${REQUEST_SLUG[type]}/${encodeURIComponent(id)}/cancel`,
        payload,
        { idempotencyKey },
      ),
  });
}
