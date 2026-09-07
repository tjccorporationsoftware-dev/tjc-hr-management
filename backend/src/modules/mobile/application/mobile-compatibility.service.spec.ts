import { ForbiddenException } from '@nestjs/common';

import { MobileCompatibilityService } from './mobile-compatibility.service';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * นโยบายเวอร์ชันแอป
 *
 * จุดสำคัญ: แอปที่ยังไม่ส่ง build มา ต้อง "ไม่ถูกบล็อก"
 * ไม่อย่างนั้นตอนเปิดใช้ครั้งแรกจะล็อกตัวเองออกทั้งหมดโดยที่ยังอัปเดตไม่ได้
 */
describe('MobileCompatibilityService', () => {
  function buildService(env: Record<string, string>) {
    return new MobileCompatibilityService({
      get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback),
    } as never);
  }

  function buildClient(appBuild: number | null): MobileClientContext {
    return {
      appBuild,
      appVersion: '1.0.0',
      installationId: 'install-1',
      ipAddress: null,
      osVersion: null,
      platform: 'android',
      userAgent: null,
    };
  }

  it('build ต่ำกว่าขั้นต่ำ ต้องบังคับอัปเดต', () => {
    const service = buildService({
      MOBILE_MINIMUM_BUILD: '100',
      MOBILE_LATEST_BUILD: '120',
    });

    expect(service.resolve(buildClient(99))).toMatchObject({
      updateRequired: true,
      updateRecommended: true,
    });
  });

  it('build ระหว่างขั้นต่ำกับล่าสุด ต้องแค่แนะนำให้อัปเดต', () => {
    const service = buildService({
      MOBILE_MINIMUM_BUILD: '100',
      MOBILE_LATEST_BUILD: '120',
    });

    expect(service.resolve(buildClient(110))).toMatchObject({
      updateRequired: false,
      updateRecommended: true,
    });
  });

  it('ไม่ส่ง build มา ต้องไม่ถูกบล็อก', () => {
    const service = buildService({ MOBILE_MINIMUM_BUILD: '100' });

    expect(service.resolve(buildClient(null)).updateRequired).toBe(false);
    expect(() => service.assertSupported(buildClient(null))).not.toThrow();
  });

  it('assertSupported ต้องโยน APP_UPDATE_REQUIRED พร้อมลิงก์สโตร์', () => {
    const service = buildService({
      MOBILE_MINIMUM_BUILD: '100',
      MOBILE_ANDROID_STORE_URL: 'https://play.google.com/store/apps/details?id=x',
    });

    try {
      service.assertSupported(buildClient(50));
      throw new Error('ต้องโยน ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'APP_UPDATE_REQUIRED',
        details: {
          minimumBuild: 100,
          storeUrl: 'https://play.google.com/store/apps/details?id=x',
        },
      });
    }
  });

  it('latest ต่ำกว่า minimum (ตั้ง env ผิด) ต้องไม่ทำให้ latest ต่ำกว่าขั้นต่ำ', () => {
    const service = buildService({
      MOBILE_MINIMUM_BUILD: '120',
      MOBILE_LATEST_BUILD: '100',
    });

    const result = service.resolve(buildClient(130));

    expect(result.latestBuild).toBe(120);
    expect(result.updateRequired).toBe(false);
  });
});
