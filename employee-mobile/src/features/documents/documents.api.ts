import type { ZodType } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';

import {
  documentCatalogSchema,
  documentDetailSchema,
  documentListSchema,
  type DocumentCatalog,
  type DocumentDetail,
  type DocumentList,
  type DocumentListFilters,
  type DocumentSavePayload,
} from './documents.types';

function parse<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw ApiError.invalidResponse(parsed.error.issues);
  return parsed.data;
}

export async function fetchDocumentCatalog(): Promise<DocumentCatalog> {
  return parse(
    documentCatalogSchema,
    await apiClient.get<unknown>('/mobile/v1/documents/catalog'),
  );
}

export async function fetchDocuments(
  params: DocumentListFilters & { page?: number; pageSize?: number },
): Promise<DocumentList> {
  const search = new URLSearchParams();
  if (params.search?.trim()) search.set('search', params.search.trim());
  if (params.status) search.set('status', params.status);
  if (params.documentTypeId) search.set('documentTypeId', params.documentTypeId);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  const query = search.toString();
  return parse(
    documentListSchema,
    await apiClient.get<unknown>(`/mobile/v1/documents${query ? `?${query}` : ''}`),
  );
}

export async function fetchDocumentDetail(id: string): Promise<DocumentDetail> {
  return parse(
    documentDetailSchema,
    await apiClient.get<unknown>(`/mobile/v1/documents/${encodeURIComponent(id)}`),
  );
}

export async function createDocument(
  body: DocumentSavePayload,
): Promise<DocumentDetail> {
  return parse(
    documentDetailSchema,
    await runIdempotentMutation({
      scope: 'document:create',
      payload: body,
      execute: (idempotencyKey) =>
        apiClient.post<unknown>('/mobile/v1/documents', body, { idempotencyKey }),
    }),
  );
}

export async function updateDocument(
  id: string,
  body: Omit<DocumentSavePayload, 'submit'>,
): Promise<DocumentDetail> {
  return parse(
    documentDetailSchema,
    await runIdempotentMutation({
      scope: `document:update:${id}`,
      payload: body,
      execute: (idempotencyKey) =>
        apiClient.patch<unknown>(
          `/mobile/v1/documents/${encodeURIComponent(id)}`,
          body,
          { idempotencyKey },
        ),
    }),
  );
}

export async function submitDocument(id: string): Promise<DocumentDetail> {
  return parse(
    documentDetailSchema,
    await runIdempotentMutation({
      scope: `document:submit:${id}`,
      payload: { id },
      execute: (idempotencyKey) =>
        apiClient.post<unknown>(
          `/mobile/v1/documents/${encodeURIComponent(id)}/submit`,
          {},
          { idempotencyKey },
        ),
    }),
  );
}

export async function cancelDocument(id: string, reason?: string): Promise<DocumentDetail> {
  const payload = reason ? { reason } : {};
  return parse(
    documentDetailSchema,
    await runIdempotentMutation({
      scope: `document:cancel:${id}`,
      payload,
      execute: (idempotencyKey) =>
        apiClient.post<unknown>(
          `/mobile/v1/documents/${encodeURIComponent(id)}/cancel`,
          payload,
          { idempotencyKey },
        ),
    }),
  );
}

export async function deleteDocument(id: string): Promise<void> {
  await runIdempotentMutation({
    scope: `document:delete:${id}`,
    payload: { id },
    execute: (idempotencyKey) =>
      apiClient.delete<unknown>(`/mobile/v1/documents/${encodeURIComponent(id)}`, {
        idempotencyKey,
      }),
  });
}

export async function deleteDocumentFile(id: string, fileId: string): Promise<void> {
  await runIdempotentMutation({
    scope: `document:file:delete:${id}:${fileId}`,
    payload: { fileId, id },
    execute: (idempotencyKey) =>
      apiClient.delete<unknown>(
        `/mobile/v1/documents/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
        { idempotencyKey },
      ),
  });
}
