import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

import {
  punchContextSchema,
  punchResultSchema,
  type PunchContext,
  type PunchResult,
  type PunchType,
} from './punch.types';

export interface PunchLocationPayload {
  accuracyMeters?: number;
  isMockedSignal?: boolean;
  latitude: number;
  longitude: number;
}

export interface SubmitPunchParams {
  /** ต้องไม่ซ้ำต่อการกดหนึ่งครั้ง และต้องเดิมเมื่อกดซ้ำจากการลองใหม่ */
  idempotencyKey: string;
  installationId: string;
  location?: PunchLocationPayload;
  note?: string;
  punchType?: PunchType;
}

export async function fetchPunchContext(
  punchType?: PunchType,
): Promise<PunchContext> {
  const query = punchType ? `?punchType=${encodeURIComponent(punchType)}` : '';
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/attendance/punch-context${query}`,
  );
  const result = punchContextSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export async function submitPunch({
  idempotencyKey,
  installationId,
  location,
  note,
  punchType,
}: SubmitPunchParams): Promise<PunchResult> {
  const payload = await apiClient.post<unknown>(
    '/mobile/v1/attendance/punch',
    {
      client: {
        /* เวลาที่เครื่องจับได้ ใช้เป็นหลักฐานเท่านั้น เวลาที่บันทึกจริงมาจาก server */
        capturedAt: new Date().toISOString(),
        installationId,
      },
      location,
      note,
      punchType,
    },
    { idempotencyKey },
  );

  const result = punchResultSchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}
