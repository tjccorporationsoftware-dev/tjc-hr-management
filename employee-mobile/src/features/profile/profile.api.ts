import type { ZodType } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

import {
  mobileProfileSchema,
  type MobileProfile,
  type UpdateMyProfileInput,
} from './profile.types';

function parse<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export async function fetchMyProfile(): Promise<MobileProfile> {
  const payload = await apiClient.get<unknown>('/mobile/v1/profile');
  return parse(mobileProfileSchema, payload);
}

export async function updateMyProfile(
  input: UpdateMyProfileInput,
): Promise<MobileProfile> {
  const payload = await apiClient.patch<unknown>('/mobile/v1/profile', input);
  return parse(mobileProfileSchema, payload);
}

export async function deleteMyAvatar(): Promise<MobileProfile> {
  const payload = await apiClient.delete<unknown>('/mobile/v1/profile/avatar');
  return parse(mobileProfileSchema, payload);
}
