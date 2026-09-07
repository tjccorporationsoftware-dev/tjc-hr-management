import { Logger } from '@nestjs/common';

import type { MobileTelemetryEventDto } from '../dto/mobile-telemetry.dto';
import type { MobileClientContext } from '../types/mobile-context.types';
import { MobileTelemetryService } from './mobile-telemetry.service';

/**
 * MOB-005 / บทที่ 21.1
 *
 * สิ่งที่ต้องกันให้ได้คือ "ของต้องห้ามต้องไม่โผล่ใน log ของ server"
 * แม้แอปเวอร์ชันเก่าที่ redact ไม่ครบจะยิงเข้ามาที่ endpoint เดียวกัน
 */
describe('MobileTelemetryService', () => {
  const client: MobileClientContext = {
    appBuild: 100,
    appVersion: '1.0.0',
    installationId: 'installation-1',
    ipAddress: '10.0.0.1',
    osVersion: '16',
    platform: 'android',
    userAgent: 'EmployeeMobile',
  };

  function buildEvent(
    overrides: Partial<MobileTelemetryEventDto> = {},
  ): MobileTelemetryEventDto {
    return {
      level: 'error',
      message: 'punch failed',
      occurredAt: '2026-08-03T10:00:00.000Z',
      ...overrides,
    };
  }

  function capture() {
    const errors: string[] = [];
    const warns: string[] = [];
    const logs: string[] = [];

    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((line) => errors.push(String(line)));
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((line) => warns.push(String(line)));
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((line) => logs.push(String(line)));

    return { errors, logs, warns };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redact ค่าที่ห้ามหลุด แม้แอปจะส่งมาตรง ๆ', () => {
    const { errors } = capture();
    const service = new MobileTelemetryService();

    service.record(
      'user-1',
      [
        buildEvent({
          context: {
            accessToken: 'should-not-appear',
            refreshToken: 'should-not-appear',
            netPay: 45000,
            bankAccount: '1234567890',
            reasonCode: 'OUTSIDE_ALLOWED_LOCATION',
          },
        }),
      ],
      client,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain('should-not-appear');
    expect(errors[0]).not.toContain('45000');
    expect(errors[0]).not.toContain('1234567890');
    // ค่าที่ไม่ใช่ของต้องห้ามต้องยังอยู่ ไม่งั้นไล่ปัญหาไม่ได้
    expect(errors[0]).toContain('OUTSIDE_ALLOWED_LOCATION');
  });

  it('redact ค่าที่ซ่อนอยู่ลึกในโครงสร้างด้วย', () => {
    const { errors } = capture();
    const service = new MobileTelemetryService();

    service.record(
      'user-1',
      [
        buildEvent({
          context: { request: { headers: { authorization: 'Bearer leak' } } },
        }),
      ],
      client,
    );

    expect(errors[0]).not.toContain('Bearer leak');
  });

  it('แนบเวอร์ชันแอปและ requestId ไว้เชื่อมกับ log ฝั่ง server (บทที่ 21.4)', () => {
    const { errors } = capture();
    const service = new MobileTelemetryService();

    service.record('user-1', [buildEvent({ requestId: 'req-123' })], client);

    const payload = JSON.parse(errors[0]) as Record<string, unknown>;

    expect(payload).toMatchObject({ requestId: 'req-123', userId: 'user-1' });
    expect(payload.app).toMatchObject({
      appBuild: 100,
      appVersion: '1.0.0',
      platform: 'android',
    });
  });

  it('แยกระดับ log ตาม level ที่แอปส่งมา', () => {
    const { errors, logs, warns } = capture();
    const service = new MobileTelemetryService();

    service.record(
      'user-1',
      [
        buildEvent({ level: 'error' }),
        buildEvent({ level: 'warning' }),
        buildEvent({ level: 'info' }),
      ],
      client,
    );

    expect(errors).toHaveLength(1);
    expect(warns).toHaveLength(1);
    expect(logs).toHaveLength(1);
  });

  it('ตัดข้อความยาวเกินกำหนด ไม่ให้ log บวมจนใช้งานไม่ได้', () => {
    const { errors } = capture();
    const service = new MobileTelemetryService();

    service.record(
      'user-1',
      [buildEvent({ message: 'x'.repeat(2000) })],
      client,
    );

    const payload = JSON.parse(errors[0]) as { message: string };

    expect(payload.message.length).toBeLessThan(2000);
  });
});
