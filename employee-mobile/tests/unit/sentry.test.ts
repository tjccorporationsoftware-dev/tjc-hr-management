/**
 * Sentry ส่งข้อมูลออกไปนอกเซิร์ฟเวอร์บริษัท
 *
 * นี่คือระบบ HR ที่มีเงินเดือนและเลขบัตรประชาชน ถ้าข้อมูลพวกนี้หลุดออกไป
 * เป็นเรื่อง PDPA ทันที เทสชุดนี้จึงคุมสองอย่าง:
 *   1. ไม่มี DSN ต้องไม่ทำอะไรเลย (สถานะปกติตอน dev และตอนรันเทส)
 *   2. field ที่อ่อนไหวต้องถูกลบก่อนออกจากเครื่องเสมอ
 */

const mockInit = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('@sentry/react-native', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  init: (...args: unknown[]) => mockInit(...args),
}));

const appEvent = {
  app: { environment: 'production', platform: 'android' },
  level: 'error' as const,
  message: 'บันทึกเวลาไม่สำเร็จ',
  requestId: 'req-1',
};

describe('Sentry · ไม่มี DSN', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('ไม่ init และไม่ส่งอะไรเลย แอปต้องทำงานได้เหมือนเดิม', () => {
    const sentry = require('@/lib/monitoring/sentry');

    sentry.initSentry();
    sentry.sendToSentry(appEvent);

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    expect(sentry.isSentryEnabled()).toBe(false);
  });
});

describe('Sentry · มี DSN', () => {
  let sentry: typeof import('@/lib/monitoring/sentry');

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';

    sentry = require('@/lib/monitoring/sentry');
    sentry.initSentry();
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('init ครั้งเดียวแม้เรียกซ้ำ', () => {
    sentry.initSentry();
    sentry.initSentry();

    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  /* ค่าเริ่มต้นของ Sentry เก็บเยอะเกินไปสำหรับระบบที่มีข้อมูลพนักงาน */
  it('ต้องปิดการเก็บ PII ภาพหน้าจอ และ trace', () => {
    expect(mockInit.mock.calls[0]?.[0]).toMatchObject({
      attachScreenshot: false,
      attachViewHierarchy: false,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it('ตัด breadcrumb ของ console และ network ทิ้ง (URL มี id พนักงานและงวดเงินเดือน)', () => {
    const { beforeBreadcrumb } = mockInit.mock.calls[0]?.[0] ?? {};

    expect(beforeBreadcrumb({ category: 'console' })).toBeNull();
    expect(beforeBreadcrumb({ category: 'xhr' })).toBeNull();
    expect(beforeBreadcrumb({ category: 'navigation' })).not.toBeNull();
  });

  it('beforeSend ต้องลบข้อมูลผู้ใช้และ request ที่ Sentry แนบมาเอง', () => {
    const { beforeSend } = mockInit.mock.calls[0]?.[0] ?? {};

    const result = beforeSend({
      request: { cookies: { s: '1' }, data: { x: 1 }, headers: { a: 'b' } },
      server_name: 'device-1',
      user: { email: 'somchai@tjc.co.th', id: 'u1' },
    });

    expect(result.user).toBeUndefined();
    expect(result.server_name).toBeUndefined();
    expect(result.request.cookies).toBeUndefined();
    expect(result.request.data).toBeUndefined();
    expect(result.request.headers).toBeUndefined();
  });

  /* ข้อสำคัญที่สุด — เงินเดือนและเลขบัตรห้ามหลุดออกไป */
  it('beforeSend ต้องปิดบังคีย์ที่อ่อนไหวใน extra และ contexts', () => {
    const { beforeSend } = mockInit.mock.calls[0]?.[0] ?? {};

    const result = beforeSend({
      contexts: { payslip: { netPay: 15450, periodName: '2026-07' } },
      extra: {
        accessToken: 'secret-token',
        bankAccount: '1234567890',
        citizenId: '1234567890123',
        salary: 15000,
        workDate: '2026-08-16',
      },
    });

    expect(result.extra).toEqual({
      accessToken: '[redacted]',
      bankAccount: '[redacted]',
      citizenId: '[redacted]',
      salary: '[redacted]',
      /* ค่าที่ไม่อ่อนไหวต้องยังอยู่ ไม่งั้นไล่ปัญหาไม่ได้ */
      workDate: '2026-08-16',
    });
    expect(result.contexts.payslip.netPay).toBe('[redacted]');
    expect(result.contexts.payslip.periodName).toBe('2026-07');
  });

  it('ส่งเฉพาะระดับ warning และ error', () => {
    sentry.sendToSentry({ ...appEvent, level: 'info' });
    sentry.sendToSentry({ ...appEvent, level: 'debug' });

    expect(mockCaptureMessage).not.toHaveBeenCalled();

    sentry.sendToSentry({ ...appEvent, level: 'warning' });
    sentry.sendToSentry(appEvent);

    expect(mockCaptureMessage).toHaveBeenCalledTimes(2);
  });

  it('context ที่ส่งเข้า Sentry ต้องถูกปิดบังอีกชั้นแม้จะผ่าน redact มาแล้ว', () => {
    sentry.sendToSentry({
      ...appEvent,
      context: { netPay: 15450, requestPath: '/mobile/v1/payroll/slips' },
    });

    const options = mockCaptureMessage.mock.calls[0]?.[1] as {
      contexts: { event: Record<string, unknown> };
    };

    expect(options.contexts.event.netPay).toBe('[redacted]');
    expect(options.contexts.event.requestPath).toBe(
      '/mobile/v1/payroll/slips',
    );
  });

  it('แนบ requestId เป็น tag เพื่อโยงกับ log ฝั่ง server', () => {
    sentry.sendToSentry(appEvent);

    expect(mockCaptureMessage.mock.calls[0]?.[1]).toMatchObject({
      tags: { requestId: 'req-1' },
    });
  });
});
