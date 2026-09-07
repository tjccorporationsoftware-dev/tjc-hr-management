import * as Sentry from '@sentry/react-native';

import { getAppConfig } from '@/config/app-config';

import type { MonitoringEvent } from './monitoring';

/**
 * Sentry — ตัวรับ crash/error ตัวที่สอง (คู่กับ telemetry ที่ส่งกลับ backend)
 *
 * ## ทำไมต้องมีทั้งสองทาง
 *
 * telemetry ส่งกลับ backend ได้ requestId ผูกกับ log ฝั่ง server ซึ่งดีมาก
 * ตอนไล่ปัญหาที่เกิดจาก API — แต่มันพึ่ง backend และพึ่งการที่ผู้ใช้ล็อกอินอยู่
 * crash ตอนเปิดแอป หรือตอน backend ล่ม จะไม่มีใครรู้เลย
 * Sentry จับ native crash และ JS error ได้ตั้งแต่ก่อนล็อกอิน
 *
 * ## ความเป็นส่วนตัว — ข้อที่ห้ามพลาด
 *
 * นี่คือ **ระบบ HR ที่มีเงินเดือนและเลขบัตรประชาชน** การส่งข้อมูลออกไปนอก
 * เซิร์ฟเวอร์บริษัทเป็นเรื่องใหญ่ตาม PDPA ค่าเริ่มต้นของ Sentry เก็บเยอะเกินไป
 * (breadcrumb ของ network พร้อม URL, console log, ข้อมูลผู้ใช้)
 * จึงต้องปิดของพวกนี้ทิ้งทั้งหมด และ event ทุกตัวผ่าน redactContext ของเราเอง
 * มาแล้วก่อนถึงที่นี่
 */

/**
 * DSN มาจาก env เท่านั้น ไม่ hardcode
 *
 * ไม่มี DSN = ไม่เปิดใช้ ซึ่งเป็นสถานะปกติตอน dev และตอนรันเทส
 * แอปต้องทำงานได้เหมือนเดิมทุกอย่างเมื่อไม่มี Sentry
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? '';

let initialized = false;

export function isSentryEnabled(): boolean {
  return initialized;
}

/**
 * คีย์ที่ห้ามหลุดออกนอกเครื่องเด็ดขาด — ตาข่ายชั้นสุดท้ายก่อนส่งออก
 * ซ้ำกับ redactContext ใน monitoring.ts โดยตั้งใจ เพราะ Sentry เก็บ field
 * ที่เราไม่ได้ใส่เองด้วย (เช่น request data ที่ integration แนบมา)
 */
const FORBIDDEN_KEY_PATTERN =
  /(token|password|passcode|otp|secret|authorization|refresh|salary|netpay|bank|citizen|idcard)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrub(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((accumulator, [key, entry]) => {
      accumulator[key] = FORBIDDEN_KEY_PATTERN.test(key)
        ? '[redacted]'
        : scrub(entry, depth + 1);

      return accumulator;
    }, {});
  }

  return value;
}

export function initSentry(): void {
  if (initialized || !DSN) {
    return;
  }

  let environment = 'unknown';
  let release: string | undefined;

  try {
    const config = getAppConfig();
    environment = config.appEnvironment;
    release = `${config.appVersion}${config.appBuild ? `+${config.appBuild}` : ''}`;
  } catch {
    /* config พังเองก็ยังต้องรายงาน crash ได้ */
  }

  Sentry.init({
    /*
     * ปิดการเก็บ PII ทั้งหมด — ห้ามส่ง IP, ชื่อ, อีเมล ของพนักงานออกไป
     */
    sendDefaultPii: false,

    beforeBreadcrumb(breadcrumb) {
      /*
       * ตัด breadcrumb ของ console และ network ทิ้ง
       * console log ระหว่าง dev มักมี payload ติดมา ส่วน network breadcrumb
       * มี URL ที่ประกอบด้วย id ของพนักงานและงวดเงินเดือน
       */
      if (breadcrumb.category === 'console' || breadcrumb.category === 'xhr') {
        return null;
      }

      return breadcrumb;
    },

    beforeSend(event) {
      /* ล้าง field ที่ Sentry แนบเองก่อนออกจากเครื่อง */
      delete event.user;
      delete event.server_name;

      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.headers;
      }

      if (event.extra) {
        event.extra = scrub(event.extra) as typeof event.extra;
      }

      if (event.contexts) {
        event.contexts = scrub(event.contexts) as typeof event.contexts;
      }

      return event;
    },

    debug: false,
    dsn: DSN,
    environment,
    /* ไม่เก็บภาพหน้าจอ/ผังหน้าจอ — มีเงินเดือนอยู่บนจอ */
    attachScreenshot: false,
    attachViewHierarchy: false,
    release,
    /* ไม่ต้องการ performance trace ในเฟสนี้ และ trace ทำให้ข้อมูลออกเยอะขึ้น */
    tracesSampleRate: 0,
  });

  initialized = true;
}

const SENTRY_LEVEL = {
  debug: 'debug',
  error: 'error',
  info: 'info',
  warning: 'warning',
} as const;

/**
 * ส่งเหตุการณ์จากชั้น monitoring ของเราเข้า Sentry
 *
 * รับเฉพาะ warning/error เหมือน telemetry — debug/info เป็นร่องรอยตอน dev
 * ไม่ใช่สิ่งที่ต้องส่งออกนอกเครื่อง
 */
export function sendToSentry(
  event: MonitoringEvent & { app: Record<string, unknown> },
): void {
  if (!initialized) return;

  if (event.level !== 'error' && event.level !== 'warning') {
    return;
  }

  Sentry.captureMessage(event.message, {
    contexts: {
      app: event.app,
      /* context ผ่าน redactContext มาแล้ว scrub ซ้ำอีกชั้นกันพลาด */
      event: scrub(event.context ?? {}) as Record<string, unknown>,
    },
    level: SENTRY_LEVEL[event.level],
    tags: { requestId: event.requestId ?? 'none' },
  });
}
