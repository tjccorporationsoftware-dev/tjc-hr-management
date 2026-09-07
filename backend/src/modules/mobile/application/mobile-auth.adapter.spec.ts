import { UnauthorizedException } from '@nestjs/common';

import { MobileAuthAdapter } from './mobile-auth.adapter';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * BE-MOB-001 — Mobile Auth Adapter
 *
 * สิ่งที่ต้องพิสูจน์:
 *   1) refresh token ออกทาง response body (มือถือเก็บใน SecureStore) ไม่ใช่ cookie
 *   2) session ผูกกับเครื่อง — refresh จากเครื่องอื่นต้องไม่ผ่าน
 *   3) ไม่มีตรรกะ auth ของตัวเอง ทุกอย่างวิ่งผ่าน AuthService เดิม
 */
describe('MobileAuthAdapter', () => {
  const installation = {
    installationId: 'install-1',
    platform: 'android' as const,
    appVersion: '1.0.0',
    appBuild: 100,
  };

  const client: MobileClientContext = {
    appBuild: 100,
    appVersion: '1.0.0',
    installationId: 'install-1',
    ipAddress: '10.0.0.1',
    osVersion: '16',
    platform: 'android',
    userAgent: 'EmployeeApp/1.0.0',
  };

  const sessionResult = {
    requiresTwoFactor: false as const,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshExpiresAt: new Date('2026-09-02T04:00:00.000Z'),
    sessionId: 'session-1',
    user: { id: 'user-1', email: 'a@b.c', displayName: 'พนักงาน' },
  };

  function buildAdapter(options?: {
    isProduction?: boolean;
    loginResult?: unknown;
  }) {
    const authService = {
      login: jest.fn(async () => options?.loginResult ?? sessionResult),
      verifyTwoFactor: jest.fn(async () => sessionResult),
      refresh: jest.fn(async () => sessionResult),
      logout: jest.fn(async () => ({ loggedOut: true })),
    };

    const jwtService = {
      decode: jest.fn(() => ({ exp: 1785000000 })),
    };

    const configService = {
      get: jest.fn(() => (options?.isProduction ? 'production' : 'development')),
    };

    const deviceService = {
      touchFromAuth: jest.fn(async () => undefined),
      unbindPushToken: jest.fn(async () => undefined),
    };

    const adapter = new MobileAuthAdapter(
      authService as never,
      jwtService as never,
      configService as never,
      deviceService as never,
    );

    return { adapter, authService, deviceService };
  }

  it('login สำเร็จ ต้องคืน refresh token ทาง body พร้อมผูก session กับเครื่อง', async () => {
    const { adapter, authService, deviceService } = buildAdapter();

    const result = await adapter.login(
      { email: 'a@b.c', password: 'secret', installation },
      client,
    );

    expect(result).toMatchObject({
      requiresTwoFactor: false,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      session: { id: 'session-1', installationId: 'install-1' },
    });

    // session ต้องถูกทำเครื่องหมายว่าเป็น MOBILE และผูกกับ installationId
    expect(authService.login).toHaveBeenCalledWith(
      { email: 'a@b.c', password: 'secret' },
      expect.objectContaining({
        device: expect.objectContaining({
          installationId: 'install-1',
          sessionType: 'MOBILE',
        }),
      }),
    );

    expect(deviceService.touchFromAuth).toHaveBeenCalledTimes(1);
  });

  it('accessTokenExpiresAt ต้องอ่านจากตัว token จริง ไม่คำนวณซ้ำจาก config', async () => {
    const { adapter } = buildAdapter();

    const result = await adapter.login(
      { email: 'a@b.c', password: 'secret', installation },
      client,
    );

    expect(result).toMatchObject({
      accessTokenExpiresAt: new Date(1785000000 * 1000),
    });
  });

  it('บัญชีที่ต้องใช้ 2FA ต้องคืน challenge ไม่ใช่ token', async () => {
    const { adapter } = buildAdapter({
      loginResult: {
        requiresTwoFactor: true,
        twoFactorToken: '2fa-token',
        expiresAt: new Date('2026-08-03T05:00:00.000Z'),
        debugTwoFactorCode: '123456',
      },
    });

    const result = await adapter.login(
      { email: 'a@b.c', password: 'secret', installation },
      client,
    );

    expect(result).toMatchObject({
      requiresTwoFactor: true,
      twoFactorToken: '2fa-token',
    });
    expect(result).not.toHaveProperty('accessToken');
  });

  it('production ห้ามคืนรหัส 2FA สำหรับ debug เด็ดขาด (BE-MOB-002)', async () => {
    const { adapter } = buildAdapter({
      isProduction: true,
      loginResult: {
        requiresTwoFactor: true,
        twoFactorToken: '2fa-token',
        expiresAt: new Date(),
        debugTwoFactorCode: '123456',
      },
    });

    const result = await adapter.login(
      { email: 'a@b.c', password: 'secret', installation },
      client,
    );

    expect(result).not.toHaveProperty('debugTwoFactorCode');
  });

  it('refresh ต้องส่ง installationId ไปให้ AuthService ตรวจว่า session ผูกกับเครื่องนี้', async () => {
    const { adapter, authService } = buildAdapter();

    await adapter.refresh(
      { refreshToken: 'refresh-token', installationId: 'install-1' },
      client,
    );

    expect(authService.refresh).toHaveBeenCalledWith('refresh-token', {
      expectedInstallationId: 'install-1',
    });
  });

  it('installationId ใน body ไม่ตรงกับ header ต้องปฏิเสธ', async () => {
    const { adapter, authService } = buildAdapter();

    await expect(
      adapter.refresh(
        { refreshToken: 'refresh-token', installationId: 'install-อื่น' },
        client,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('logout ต้องเพิกถอน session และเลิกผูก push token ของเครื่องนั้น', async () => {
    const { adapter, authService, deviceService } = buildAdapter();

    await adapter.logout('user-1', { refreshToken: 'refresh-token' }, client);

    expect(authService.logout).toHaveBeenCalledWith('refresh-token');
    expect(deviceService.unbindPushToken).toHaveBeenCalledWith(
      'user-1',
      'install-1',
    );
  });
});
