import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

import {
  cancelDocument,
  createDocument,
  deleteDocument,
  fetchDocumentCatalog,
  fetchDocumentDetail,
  fetchDocuments,
  submitDocument,
  updateDocument,
} from './documents.api';
import type { DocumentList, DocumentListFilters, DocumentSavePayload } from './documents.types';

const retryServerErrorsOnly = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) return false;
  return failureCount < 2;
};

export function useDocumentCatalog() {
  return useQuery({
    queryFn: fetchDocumentCatalog,
    queryKey: queryKeys.documentCatalog,
    retry: retryServerErrorsOnly,
    staleTime: 5 * 60_000,
  });
}

export function useDocumentList(filters: DocumentListFilters = {}) {
  return useInfiniteQuery({
    getNextPageParam: (lastPage: DocumentList) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchDocuments({ ...filters, page: pageParam, pageSize: 20 }),
    queryKey: queryKeys.documents(filters),
    retry: retryServerErrorsOnly,
    staleTime: 30_000,
  });
}

export function useDocumentDetail(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => fetchDocumentDetail(id),
    queryKey: queryKeys.documentDetail(id),
    retry: retryServerErrorsOnly,
    staleTime: 15_000,
  });
}

function useInvalidateDocuments() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['documents'] });
    void client.invalidateQueries({ queryKey: queryKeys.bootstrap });
  };
}

export function useCreateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: createDocument, onSuccess: invalidate });
}

export function useUpdateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (input: { id: string; body: Omit<DocumentSavePayload, 'submit'> }) =>
      updateDocument(input.id, input.body),
    onSuccess: invalidate,
  });
}

export function useSubmitDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: submitDocument, onSuccess: invalidate });
}

export function useCancelDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (input: { id: string; reason?: string }) =>
      cancelDocument(input.id, input.reason),
    onSuccess: invalidate,
  });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: deleteDocument, onSuccess: invalidate });
}
