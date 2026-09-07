import { Injectable, Logger } from '@nestjs/common';

import type {
  MobileTelemetryEventDto,
  MobileTelemetryLevel,
} from '../dto/mobile-telemetry.dto';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * MOB-005 — ปลายทางของ crash/error จากแอป
 *
 * แอปไม่ได้ต่อ Sentry (ยังไม่มี DSN และไม่อยากเพิ่ม native module) จึงส่ง
 * เหตุการณ์กลับมาที่ backend แล้วออกทาง Logger เดิม เพื่อให้ไปรวมกับ log
 * ของ server ที่ระบบเก็บ log ปลายทางเก็บอยู่แล้ว
 *
 * กติกาบทที่ 21.1 — ห้ามให้ token/รหัสผ่าน/OTP/ยอดเงิน/PII หลุดเข้ามาใน log
 * ฝั่งแอป redact มาแล้วชั้นหนึ่ง ที่นี่ redact ซ้ำอีกชั้นเพราะแอปเวอร์ชันเก่า
 * ที่ยังไม่ได้แก้ก็ยิงเข้า endpoint เดียวกันนี้ และเราคุมเวอร์ชันบนเครื่อง
 * ผู้ใช้ไม่ได้
 */

const REDACTED = '[redacted]';

const REDACTED_KEY_PATTERN =
  /(token|password|passcode|otp|secret|authorization|refresh|salary|netpay|bank|citizen)/i;

/** จำกัดความลึกกันโครงสร้างวนซ้ำและ payload ที่ตั้งใจทำให้ log บวม */
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

@Injectable()
export class MobileTelemetryService {
  private readonly logger = new Logger('MobileTelemetry');

  record(
    userId: string,
    events: MobileTelemetryEventDto[],
    client: MobileClientContext,
  ) {
    for (const event of events) {
      this.write(userId, event, client);
    }

    return { accepted: events.length };
  }

  private write(
    userId: string,
    event: MobileTelemetryEventDto,
    client: MobileClientContext,
  ) {
    const payload = {
      userId,
      level: event.level,
      message: this.truncate(event.message),
      occurredAt: event.occurredAt,
      requestId: event.requestId ?? null,
      route: event.route ?? null,
      app: {
        appBuild: client.appBuild ?? null,
        appVersion: client.appVersion ?? null,
        installationId: client.installationId ?? null,
        osVersion: client.osVersion ?? null,
        platform: client.platform ?? null,
      },
      context: event.context
        ? (this.redact(event.context) as Record<string, unknown>)
        : undefined,
    };

    const line = JSON.stringify(payload);

    if (event.level === 'error') {
      this.logger.error(line);
      return;
    }

    if (event.level === 'warning') {
      this.logger.warn(line);
      return;
    }

    this.logger.log(line);
  }

  private redact(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) {
      return '[truncated]';
    }

    if (typeof value === 'string') {
      return this.truncate(value);
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => this.redact(item, depth + 1));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<
        Record<string, unknown>
      >((accumulator, [key, entry]) => {
        accumulator[key] = REDACTED_KEY_PATTERN.test(key)
          ? REDACTED
          : this.redact(entry, depth + 1);

        return accumulator;
      }, {});
    }

    return value;
  }

  private truncate(value: string) {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
}

/** เปิดให้เทสเรียกใช้ค่าคงที่เดียวกัน ไม่ต้องเดาเลขซ้ำ */
export const MOBILE_TELEMETRY_LIMITS = {
  maxArrayItems: MAX_ARRAY_ITEMS,
  maxDepth: MAX_DEPTH,
  maxStringLength: MAX_STRING_LENGTH,
} as const;

export type { MobileTelemetryLevel };
