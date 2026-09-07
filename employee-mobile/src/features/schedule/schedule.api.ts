import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

import { scheduleSchema, type Schedule } from './schedule.types';

export async function fetchSchedule(year: number, month: number): Promise<Schedule> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/schedule?${params.toString()}`,
  );
  const result = scheduleSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}
