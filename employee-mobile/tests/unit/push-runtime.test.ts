/**
 * ตั้งแต่ SDK 53 Expo Go ถอด remote push ออก และ expo-notifications
 * **โยน error ตั้งแต่ตอน import** ไม่ใช่ตอนเรียกใช้
 *
 * ก่อนหน้านี้ push.ts import ไว้ที่ระดับบนสุด แล้วถูกลากเข้า auth.service
 * → (app)/_layout ทำให้ทั้งแอปเปิดไม่ขึ้นบน Expo Go ไม่ใช่แค่ push ที่ใช้ไม่ได้
 * เทสชุดนี้กันไม่ให้ import แบบนั้นกลับมาอีก
 */

/* type ของ require ใน RN ไม่มี resolve/cache แต่ตอนรันบน jest มีจริง */
const nodeRequire = require as unknown as {
  cache: Record<string, unknown>;
  resolve: (id: string) => string;
};

const notificationsPath = nodeRequire.resolve('expo-notifications');

describe('resolvePushSupport · สภาพแวดล้อมไหนใช้ push ได้', () => {
  const { resolvePushSupport } = require('@/features/notifications/push-runtime');

  it('dev build บนเนทีฟ ใช้ได้', () => {
    expect(
      resolvePushSupport({ appOwnership: null, platform: 'android' }),
    ).toBe(true);
    expect(resolvePushSupport({ appOwnership: null, platform: 'ios' })).toBe(
      true,
    );
  });

  it('Expo Go ใช้ไม่ได้ (SDK 53 ถอด remote push ออก)', () => {
    expect(
      resolvePushSupport({ appOwnership: 'expo', platform: 'android' }),
    ).toBe(false);
  });

  /*
   * บั๊กที่เกิดจริง: กันแค่ Expo Go ไม่พอ บนเว็บ appOwnership เป็น null
   * เหมือน dev build เป๊ะ ๆ โมดูลเลยถูกโหลดจริงแล้วโยน
   * "not available on web" ตอนเรียก getLastNotificationResponseAsync
   */
  it('บนเว็บใช้ไม่ได้ แม้ appOwnership จะเป็น null เหมือน dev build', () => {
    expect(resolvePushSupport({ appOwnership: null, platform: 'web' })).toBe(
      false,
    );
  });

  it('Expo Go บนเว็บก็ยังใช้ไม่ได้', () => {
    expect(resolvePushSupport({ appOwnership: 'expo', platform: 'web' })).toBe(
      false,
    );
  });
});

describe('push-runtime · ต้องไม่ลาก expo-notifications เข้ามาตอน import', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  const loadInExpoGo = () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      AppOwnership: { Expo: 'expo' },
      default: { appOwnership: 'expo' },
    }));

    return require('@/features/notifications/push-runtime');
  };

  const loadInDevBuild = () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      AppOwnership: { Expo: 'expo' },
      default: { appOwnership: null },
    }));

    return require('@/features/notifications/push-runtime');
  };


  it('บน Expo Go ต้องรู้ว่าไม่รองรับ push', () => {
    const runtime = loadInExpoGo();

    expect(runtime.isExpoGo).toBe(true);
    expect(runtime.isPushSupported).toBe(false);
  });

  /* appOwnership เป็น null บน dev build ซึ่งคือที่ที่ push ต้องทำงาน */
  it('บน development build ต้องถือว่ารองรับ push', () => {
    const runtime = loadInDevBuild();

    expect(runtime.isExpoGo).toBe(false);
    expect(runtime.isPushSupported).toBe(true);
  });

  it('แค่ import ต้องไม่ดึง expo-notifications เข้ามาเลย', () => {
    loadInExpoGo();

    expect(nodeRequire.cache[notificationsPath]).toBeUndefined();
  });

  it('บน Expo Go เรียก loadNotifications ต้องได้ null ไม่ใช่ error', async () => {
    const runtime = loadInExpoGo();

    await expect(runtime.loadNotifications()).resolves.toBeNull();
    expect(nodeRequire.cache[notificationsPath]).toBeUndefined();
  });
});

describe('push.ts · ต้อง import ได้เสมอแม้บน Expo Go', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      AppOwnership: { Expo: 'expo' },
      default: { appOwnership: 'expo' },
    }));
  });

  it('ทุกฟังก์ชันต้องคืน UNSUPPORTED แทนการพัง', async () => {
    const push = require('@/features/notifications/push');

    await expect(push.getPushPermission()).resolves.toBe('UNSUPPORTED');
    await expect(push.enablePush()).resolves.toBe('UNSUPPORTED');
    /* logout ต้องผ่านเสมอ ไม่ว่าจะถอน token ได้หรือไม่ */
    await expect(push.disablePush()).resolves.toBeUndefined();
  });
});
