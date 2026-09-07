import { appDefaults, getAppConfig } from '@/config/app-config';
import { captureEvent } from '@/lib/monitoring/monitoring';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

import { ApiError } from './api-error';
import { unwrapApiSuccessData } from './api-response';
import { createRequestId } from './request-id';
import { tokenRefreshManager } from './token-refresh-manager';

type ApiAuthBridge = {
  getAccessToken: () => string | null;
  onSessionExpired: () => Promise<void> | void;
  refreshAccessToken: () => Promise<string | null>;
};

export interface ApiRequestOptions
  extends Omit<RequestInit, 'body' | 'headers' | 'signal'> {
  allowRefresh?: boolean;
  auth?: boolean;
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

let authBridge: ApiAuthBridge | null = null;

export function configureApiAuthBridge(bridge: ApiAuthBridge | null) {
  authBridge = bridge;
}

function isJsonBody(value: unknown) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof FormData) &&
    !(value instanceof Blob) &&
    !(value instanceof ArrayBuffer) &&
    !(value instanceof URLSearchParams)
  );
}

function buildUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
    throw ApiError.invalidRequest(
      'API Client หลักรองรับเฉพาะ Relative Path เท่านั้น',
      { path },
    );
  }

  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}

async function parseResponse(response: Response) {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => undefined);
  }

  return response.text().catch(() => undefined);
}

function isSessionInvalidError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  );
}

async function executeRequest<T>(
  path: string,
  options: ApiRequestOptions,
  hasRetriedAfterRefresh: boolean,
): Promise<T> {
  const {
    allowRefresh = true,
    auth = true,
    body: requestBody,
    headers: requestHeaders,
    idempotencyKey,
    signal: callerSignal,
    timeoutMs = appDefaults.apiTimeoutMs,
    ...fetchOptions
  } = options;
  const config = getAppConfig();
  const controller = new AbortController();
  const requestId = createRequestId();
  const installationId = await getOrCreateInstallationId();
  const headers = new Headers(requestHeaders);
  const accessToken = auth ? authBridge?.getAccessToken() : null;
  let abortedByTimeout = false;

  // ชุด header ตาม Contract บทที่ 12.7 — backend ใช้เป็น metadata เท่านั้น
  // ตัวตนผู้ใช้มาจาก Access Token เสมอ
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', config.locale);
  headers.set('X-App-Version', config.appVersion);
  headers.set('X-Installation-Id', installationId);
  headers.set('X-OS-Version', config.osVersion);
  headers.set('X-Platform', config.platform);
  headers.set('X-Request-Id', requestId);

  if (config.appBuild !== null) {
    headers.set('X-App-Build', String(config.appBuild));
  }

  if (idempotencyKey !== undefined) {
    const normalizedIdempotencyKey = idempotencyKey.trim();

    if (!normalizedIdempotencyKey) {
      throw ApiError.invalidRequest('Idempotency key ต้องไม่เป็นค่าว่าง');
    }

    headers.set('Idempotency-Key', normalizedIdempotencyKey);
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let body: BodyInit | undefined;

  if (requestBody !== undefined) {
    if (isJsonBody(requestBody)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(requestBody);
    } else {
      body = requestBody as BodyInit;
    }
  }

  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  const timeout = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort('timeout');
  }, timeoutMs);

  try {
    const response = await fetch(buildUrl(config.apiBaseUrl, path), {
      ...fetchOptions,
      body,
      headers,
      signal: controller.signal,
    });
    const payload = await parseResponse(response);

    if (
      response.status === 401 &&
      auth &&
      allowRefresh &&
      !hasRetriedAfterRefresh &&
      authBridge
    ) {
      try {
        const refreshedAccessToken = await tokenRefreshManager.run(
          authBridge.refreshAccessToken,
        );

        if (refreshedAccessToken) {
          return executeRequest<T>(path, options, true);
        }

        await authBridge.onSessionExpired();
      } catch (refreshError) {
        if (isSessionInvalidError(refreshError)) {
          await authBridge.onSessionExpired();
        }

        throw refreshError;
      }
    }

    if (
      response.status === 401 &&
      auth &&
      hasRetriedAfterRefresh &&
      authBridge
    ) {
      await authBridge.onSessionExpired();
    }

    if (!response.ok) {
      const apiError = ApiError.fromResponse(response, payload);

      // 5xx คือปัญหาฝั่งเซิร์ฟเวอร์ ต้องเห็นใน monitoring พร้อม requestId
      // ส่วน 4xx เป็นเรื่องปกติ (validation/สิทธิ์) ไม่ต้องปลุก on-call
      captureEvent({
        context: {
          code: apiError.code,
          method: fetchOptions.method ?? 'GET',
          path,
          status: response.status,
        },
        level: response.status >= 500 ? 'error' : 'warning',
        message: `API ${response.status} ${apiError.code}`,
        requestId: apiError.requestId ?? requestId,
      });

      throw apiError;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return unwrapApiSuccessData<T>(payload);
    } catch (error) {
      throw ApiError.invalidResponse(error);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw abortedByTimeout ? ApiError.timeout(error) : ApiError.aborted(error);
    }

    throw ApiError.network(error);
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export const apiClient = {
  delete<T>(path: string, options: ApiRequestOptions = {}) {
    return executeRequest<T>(path, { ...options, method: 'DELETE' }, false);
  },
  get<T>(path: string, options: ApiRequestOptions = {}) {
    return executeRequest<T>(path, { ...options, method: 'GET' }, false);
  },
  patch<T>(path: string, body?: unknown, options: ApiRequestOptions = {}) {
    return executeRequest<T>(
      path,
      { ...options, body, method: 'PATCH' },
      false,
    );
  },
  post<T>(path: string, body?: unknown, options: ApiRequestOptions = {}) {
    return executeRequest<T>(
      path,
      { ...options, body, method: 'POST' },
      false,
    );
  },
  put<T>(path: string, body?: unknown, options: ApiRequestOptions = {}) {
    return executeRequest<T>(path, { ...options, body, method: 'PUT' }, false);
  },
  request<T>(path: string, options: ApiRequestOptions = {}) {
    return executeRequest<T>(path, options, false);
  },
};
