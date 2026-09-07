export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: unknown;
  requestId?: string;
  summary?: unknown;
}

export interface ApiErrorDetail {
  code?: string;
  details?: unknown;
  message?: string | string[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
  requestId?: string;
}

export interface LegacyApiErrorResponse {
  code?: string;
  details?: unknown;
  error?: string;
  message?: string | string[];
  requestId?: string;
  statusCode?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isApiSuccessResponse<T = unknown>(
  payload: unknown,
): payload is ApiSuccessResponse<T> {
  return (
    isRecord(payload) &&
    payload.success === true &&
    Object.prototype.hasOwnProperty.call(payload, 'data')
  );
}

export function isApiErrorResponse(
  payload: unknown,
): payload is ApiErrorResponse {
  return (
    isRecord(payload) &&
    payload.success === false &&
    isRecord(payload.error)
  );
}

export function unwrapApiSuccessData<T>(payload: unknown): T {
  if (!isApiSuccessResponse<T>(payload)) {
    throw new Error('Response does not match the standard success envelope');
  }

  return payload.data;
}
