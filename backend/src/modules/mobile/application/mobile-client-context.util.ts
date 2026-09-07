import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-user.interface';
import {
  MOBILE_HEADERS,
  MOBILE_PLATFORMS,
  type MobilePlatform,
} from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';

function readHeader(
  request: AuthenticatedRequest,
  name: string,
): string | null {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  return null;
}

function readClientIp(request: AuthenticatedRequest) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return request.ip ?? null;
}

function toPlatform(value: string | null): MobilePlatform | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  return (MOBILE_PLATFORMS as readonly string[]).includes(normalized)
    ? (normalized as MobilePlatform)
    : null;
}

function toPositiveInt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * อ่านบริบทของเครื่องจาก Header
 *
 * ข้อมูลชุดนี้เป็นแค่ metadata — ตัวตนผู้ใช้มาจาก Access Token เท่านั้น
 * ห้ามนำ header ไปใช้ตัดสินสิทธิ์หรือเลือก employee (ADR-001 / บทที่ 12.7)
 */
export function readMobileClientContext(
  request: AuthenticatedRequest,
): MobileClientContext {
  return {
    appBuild: toPositiveInt(readHeader(request, MOBILE_HEADERS.appBuild)),
    appVersion: readHeader(request, MOBILE_HEADERS.appVersion),
    installationId: readHeader(request, MOBILE_HEADERS.installationId),
    ipAddress: readClientIp(request),
    osVersion: readHeader(request, MOBILE_HEADERS.osVersion),
    platform: toPlatform(readHeader(request, MOBILE_HEADERS.platform)),
    userAgent: request.headers['user-agent'] ?? null,
  };
}

export function readIdempotencyKey(request: AuthenticatedRequest) {
  return readHeader(request, MOBILE_HEADERS.idempotencyKey);
}
