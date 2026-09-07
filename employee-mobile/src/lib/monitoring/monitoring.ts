import { getAppConfig } from '@/config/app-config';

/**
 * MOB-005 — Crash/Error monitoring
 *
 * ตอนนี้ยังไม่ผูก Sentry (ต้องมี DSN และ source map upload ใน CI ก่อน)
 * ชั้นนี้จึงทำหน้าที่เป็น "จุดเดียวที่เหตุการณ์ทั้งหมดวิ่งผ่าน"
 * เมื่อพร้อมต่อ Sentry ให้เรียก setMonitoringTransport() ครั้งเดียวก็พอ
 *
 * กติกาที่ห้ามละเมิด (บทที่ 21.1):
 *   ห้ามส่ง token, รหัสผ่าน, OTP, ยอดเงิน หรือ PII เข้ามาที่นี่
 *   ตัว redact ด้านล่างเป็นตาข่ายกันพลาด ไม่ใช่ข้ออ้างให้ส่งของต้องห้ามมา
 */

export type MonitoringLevel = 'debug' | 'info' | 'warning' | 'error';

export type MonitoringEvent = {
  context?: Record<string, unknown>;
  level: MonitoringLevel;
  message: string;
  requestId?: string | null;
};

export type MonitoringTransport = (
  event: MonitoringEvent & { app: Record<string, unknown> },
) => void;

/** คีย์ที่ห้ามหลุดออกจากเครื่องเด็ดขาด */
const REDACTED_KEY_PATTERN =
  /(token|password|passcode|otp|secret|authorization|refresh|salary|netpay|bank|citizen)/i;

const REDACTED = '[redacted]';

let transport: MonitoringTransport | null = null;

export function setMonitoringTransport(next: MonitoringTransport | null) {
  transport = next;
}

export function redactContext(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 4) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactContext(item, depth + 1));
  }

  if (value instanceof Error) {
    return { message: value.message, name: value.name };
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((accumulator, [key, entry]) => {
      accumulator[key] = REDACTED_KEY_PATTERN.test(key)
        ? REDACTED
        : redactContext(entry, depth + 1);

      return accumulator;
    }, {});
  }

  return value;
}

function describeApp() {
  try {
    const config = getAppConfig();

    return {
      appBuild: config.appBuild,
      appVersion: config.appVersion,
      environment: config.appEnvironment,
      osVersion: config.osVersion,
      platform: config.platform,
    };
  } catch {
    // config พังเองก็ยังต้อง log ได้ ไม่งั้นจะไล่ปัญหาตอน startup ไม่ได้เลย
    return { environment: 'unknown' };
  }
}

export function captureEvent(event: MonitoringEvent) {
  const payload = {
    ...event,
    app: describeApp(),
    context: event.context
      ? (redactContext(event.context) as Record<string, unknown>)
      : undefined,
  };

  if (transport) {
    transport(payload);
    return;
  }

  if (__DEV__) {
    const log = event.level === 'error' ? console.error : console.log;
    log(`[monitoring:${event.level}] ${event.message}`, payload.context ?? '');
  }
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
) {
  const requestId =
    error && typeof error === 'object' && 'requestId' in error
      ? ((error as { requestId?: string | null }).requestId ?? null)
      : null;

  captureEvent({
    context: { ...context, error },
    level: 'error',
    message:
      error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่รู้จัก',
    requestId,
  });
}
