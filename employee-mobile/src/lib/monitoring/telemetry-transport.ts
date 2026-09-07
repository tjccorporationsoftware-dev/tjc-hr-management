import { apiClient } from '@/lib/api/api-client';

import {
  setMonitoringTransport,
  type MonitoringEvent,
  type MonitoringLevel,
} from './monitoring';

/**
 * MOB-005 — ส่ง crash/error กลับ backend
 *
 * แอปไม่ได้ต่อ Sentry (ไม่มี DSN และไม่อยากเพิ่ม native module ที่บังคับให้
 * build ใหม่) จึงส่งเหตุการณ์กลับไปที่ `/mobile/v1/telemetry` แล้วให้ไปรวมกับ
 * log ของ server ตามบทที่ 21.4 ซึ่งได้ requestId ผูกกันอยู่แล้ว
 *
 * สามกับดักที่โค้ดนี้ต้องกันให้ได้:
 *   1. **วนไม่จบ** — ตัวส่งเองล้มเหลว -> api client เรียก captureEvent ->
 *      เข้าคิวใหม่ -> ส่งใหม่ -> ล้มอีก ต้องตัดวงจรทั้งด้วยการข้าม event ที่มา
 *      จาก path ของ telemetry เอง และด้วยธงกันเรียกซ้อน
 *   2. **ยิงถี่** — รวมเป็นแบตช์แล้วค่อยส่ง ไม่ใช่ยิงทีละ event
 *   3. **หน่วยความจำบวมตอนออฟไลน์** — จำกัดคิวไว้ ตัวเก่าหลุดก่อน
 */

export const TELEMETRY_PATH = 'mobile/v1/telemetry';

/** ต้องไม่เกิน MOBILE_TELEMETRY_MAX_EVENTS ฝั่ง backend ไม่งั้นโดน 400 ทั้งแบตช์ */
const MAX_BATCH_SIZE = 20;
const MAX_BUFFERED_EVENTS = 50;
const FLUSH_DELAY_MS = 5_000;

/** debug/info เป็นร่องรอยสำหรับไล่ปัญหาตอน dev ไม่ใช่สิ่งที่ต้องรู้จากเครื่องผู้ใช้ */
const REPORTED_LEVELS: ReadonlySet<MonitoringLevel> = new Set([
  'warning',
  'error',
]);

type TelemetryPayloadEvent = {
  context?: Record<string, unknown>;
  level: MonitoringLevel;
  message: string;
  occurredAt: string;
  requestId?: string | null;
};

type TelemetryTransportOptions = {
  /** เผื่อเทสฉีดตัวส่งปลอมเข้ามา และเผื่อวันหลังเปลี่ยนปลายทาง */
  isAuthenticated: () => boolean;
  now?: () => Date;
  send?: (events: TelemetryPayloadEvent[]) => Promise<unknown>;
};

export function createTelemetryTransport(options: TelemetryTransportOptions) {
  const queue: TelemetryPayloadEvent[] = [];
  const now = options.now ?? (() => new Date());
  const send =
    options.send ??
    ((events: TelemetryPayloadEvent[]) =>
      apiClient.post(TELEMETRY_PATH, { events }));

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isFlushing = false;

  function isSelfReport(event: MonitoringEvent) {
    return event.context?.path === TELEMETRY_PATH;
  }

  function scheduleFlush() {
    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_DELAY_MS);
  }

  async function flush() {
    if (isFlushing || queue.length === 0 || !options.isAuthenticated()) {
      return;
    }

    isFlushing = true;
    const batch = queue.splice(0, MAX_BATCH_SIZE);

    try {
      await send(batch);
    } catch {
      // ตั้งใจกลืน error: ถ้าโยนต่อ จะไปโผล่เป็น unhandled rejection กลางแอป
      // และรายงานปัญหาที่ส่งไม่สำเร็จไม่ใช่เรื่องที่ผู้ใช้ต้องรับรู้
    } finally {
      isFlushing = false;
    }

    if (queue.length > 0) {
      scheduleFlush();
    }
  }

  function accept(event: MonitoringEvent) {
    if (!REPORTED_LEVELS.has(event.level) || isSelfReport(event)) {
      return;
    }

    queue.push({
      context: event.context,
      level: event.level,
      message: event.message,
      occurredAt: now().toISOString(),
      requestId: event.requestId ?? null,
    });

    // คิวเต็ม = ตัวเก่าหลุดก่อน เพราะปัญหาล่าสุดมักอธิบายอาการได้ตรงกว่า
    if (queue.length > MAX_BUFFERED_EVENTS) {
      queue.splice(0, queue.length - MAX_BUFFERED_EVENTS);
    }

    if (queue.length >= MAX_BATCH_SIZE) {
      void flush();
      return;
    }

    scheduleFlush();
  }

  return { accept, flush, size: () => queue.length };
}

/**
 * ต่อชั้น monitoring เข้ากับ backend — เรียกครั้งเดียวตอนแอปเริ่มทำงาน
 *
 * เหตุการณ์ก่อนล็อกอินจะค้างในคิวไว้ก่อน แล้วถูกส่งตอน flush รอบถัดไป
 * หลังผู้ใช้เข้าสู่ระบบสำเร็จ (endpoint ต้องมีตัวตนผู้ใช้)
 *
 * `extraSinks` ใช้ส่งเหตุการณ์เดียวกันไปที่อื่นด้วย (ปัจจุบันคือ Sentry)
 * ตัวรับที่โยน error ต้องไม่ทำให้ตัวอื่นไม่ได้รับ — จุดประสงค์ทั้งหมดของชั้นนี้
 * คือรายงานปัญหา ถ้าตัวรายงานเองพังเงียบแล้วลากตัวอื่นล้มด้วยก็ไม่เหลืออะไร
 */
export function installTelemetryTransport(
  isAuthenticated: () => boolean,
  extraSinks: ((event: MonitoringEvent & { app: Record<string, unknown> }) => void)[] = [],
) {
  const transport = createTelemetryTransport({ isAuthenticated });

  setMonitoringTransport((event) => {
    for (const sink of extraSinks) {
      try {
        sink(event);
      } catch {
        /* ตัวรับหนึ่งพังต้องไม่กันตัวอื่น */
      }
    }

    transport.accept(event);
  });

  return transport;
}
