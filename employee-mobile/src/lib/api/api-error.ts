import {
  isApiErrorResponse,
  type LegacyApiErrorResponse,
} from './api-response';

interface ApiErrorOptions {
  cause?: unknown;
  code?: string;
  details?: unknown;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  requestId?: string;
  status?: number;
}

function normalizeMessage(value: unknown, fallback: string) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join(', ') || fallback;
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return fallback;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly isNetworkError: boolean;
  readonly isTimeout: boolean;
  readonly requestId: string | null;
  readonly status: number | null;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.code = options.code ?? 'UNKNOWN_ERROR';
    this.details = options.details;
    this.isNetworkError = options.isNetworkError ?? false;
    this.isTimeout = options.isTimeout ?? false;
    this.requestId = options.requestId ?? null;
    this.status = options.status ?? null;
  }

  static fromResponse(response: Response, payload: unknown) {
    const headerRequestId = response.headers.get('x-request-id') ?? undefined;

    if (isApiErrorResponse(payload)) {
      return new ApiError(
        normalizeMessage(
          payload.error.message,
          'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง',
        ),
        {
          code: payload.error.code ?? `HTTP_${response.status}`,
          details: payload.error.details,
          requestId: headerRequestId ?? payload.requestId,
          status: response.status,
        },
      );
    }

    const legacyBody =
      payload && typeof payload === 'object'
        ? (payload as LegacyApiErrorResponse)
        : null;

    return new ApiError(
      normalizeMessage(
        legacyBody?.message ?? legacyBody?.error,
        'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง',
      ),
      {
        code: legacyBody?.code ?? `HTTP_${response.status}`,
        details: legacyBody?.details,
        requestId: headerRequestId ?? legacyBody?.requestId,
        status: response.status,
      },
    );
  }

  static invalidResponse(details?: unknown) {
    return new ApiError('ข้อมูลตอบกลับจากระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', {
      code: 'INVALID_RESPONSE',
      details,
    });
  }

  static invalidRequest(message: string, details?: unknown) {
    return new ApiError(message, {
      code: 'INVALID_REQUEST',
      details,
    });
  }

  static aborted(cause: unknown) {
    return new ApiError('ยกเลิกคำขอแล้ว', {
      cause,
      code: 'REQUEST_ABORTED',
    });
  }

  static network(cause: unknown) {
    return new ApiError('ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ต', {
      cause,
      code: 'NETWORK_ERROR',
      isNetworkError: true,
    });
  }

  static timeout(cause: unknown) {
    return new ApiError('ระบบใช้เวลาตอบกลับนานเกินไป กรุณาลองใหม่อีกครั้ง', {
      cause,
      code: 'REQUEST_TIMEOUT',
      isTimeout: true,
    });
  }
}
