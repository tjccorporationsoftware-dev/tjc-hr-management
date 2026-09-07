import {
  createTelemetryTransport,
  TELEMETRY_PATH,
} from '@/lib/monitoring/telemetry-transport';

/**
 * MOB-005 — ตัวส่ง crash/error กลับ backend
 *
 * กับดักที่ต้องกันให้ได้คือ "ส่งไม่สำเร็จแล้ววนไม่จบ" เพราะ api client
 * เรียก captureEvent ทุกครั้งที่ request ล้มเหลว รวมถึง request ของตัวมันเอง
 */
describe('telemetry transport', () => {
  // ตัวส่งตั้ง timer หน่วงไว้เสมอ ถ้าไม่คุมเวลา jest จะค้างรอ timer จริง
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const errorEvent = {
    level: 'error' as const,
    message: 'punch failed',
  };

  function buildTransport(isAuthenticated = true) {
    const batches: unknown[][] = [];

    const transport = createTelemetryTransport({
      isAuthenticated: () => isAuthenticated,
      send: async (events) => {
        batches.push(events);
      },
    });

    return { batches, transport };
  }

  it('ไม่ส่ง event ที่เกิดจากการยิง telemetry เอง — กันวนไม่จบ', async () => {
    const { batches, transport } = buildTransport();

    transport.accept({
      context: { path: TELEMETRY_PATH, status: 500 },
      level: 'error',
      message: 'API 500 SERVER_ERROR',
    });

    await transport.flush();

    expect(transport.size()).toBe(0);
    expect(batches).toHaveLength(0);
  });

  it('ข้าม debug/info ส่งเฉพาะ warning และ error', async () => {
    const { transport } = buildTransport();

    transport.accept({ level: 'debug', message: 'a' });
    transport.accept({ level: 'info', message: 'b' });
    transport.accept({ level: 'warning', message: 'c' });
    transport.accept({ level: 'error', message: 'd' });

    expect(transport.size()).toBe(2);
  });

  it('ยังไม่ล็อกอินให้เก็บไว้ในคิวก่อน แล้วส่งเมื่อล็อกอินแล้ว', async () => {
    const batches: unknown[][] = [];
    let authenticated = false;

    const transport = createTelemetryTransport({
      isAuthenticated: () => authenticated,
      send: async (events) => {
        batches.push(events);
      },
    });

    transport.accept(errorEvent);
    await transport.flush();

    expect(batches).toHaveLength(0);
    expect(transport.size()).toBe(1);

    authenticated = true;
    await transport.flush();

    expect(batches).toHaveLength(1);
    expect(transport.size()).toBe(0);
  });

  it('ส่งไม่สำเร็จต้องไม่โยน error ออกไปกลางแอป', async () => {
    const transport = createTelemetryTransport({
      isAuthenticated: () => true,
      send: async () => {
        throw new Error('network down');
      },
    });

    transport.accept(errorEvent);

    await expect(transport.flush()).resolves.toBeUndefined();
  });

  it('คิวเต็มแล้วตัวเก่าหลุดก่อน ไม่ปล่อยให้หน่วยความจำบวมตอนออฟไลน์', () => {
    const { transport } = buildTransport(false);

    for (let index = 0; index < 200; index += 1) {
      transport.accept({ level: 'error', message: `error-${index}` });
    }

    expect(transport.size()).toBeLessThanOrEqual(50);
  });

  it('แนบ requestId และเวลาที่เกิดเหตุไปด้วย เพื่อเชื่อมกับ log ฝั่ง server', async () => {
    const { batches, transport } = buildTransport();

    transport.accept({ ...errorEvent, requestId: 'req-1' });
    await transport.flush();

    const sent = batches[0]?.[0] as
      | { occurredAt: string; requestId: string }
      | undefined;

    expect(sent).toMatchObject({
      level: 'error',
      message: 'punch failed',
      requestId: 'req-1',
    });
    expect(sent?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
