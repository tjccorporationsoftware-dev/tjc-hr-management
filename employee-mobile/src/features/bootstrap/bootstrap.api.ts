import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

import { bootstrapSchema, todaySchema, type Bootstrap } from './bootstrap.types';

export async function fetchBootstrap(): Promise<Bootstrap> {
  const payload = await apiClient.get<unknown>('/mobile/v1/bootstrap');
  const result = bootstrapSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export async function fetchToday() {
  const payload = await apiClient.get<unknown>('/mobile/v1/today');
  const result = todaySchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}
