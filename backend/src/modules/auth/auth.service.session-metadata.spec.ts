import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';

/**
 * Zero-regression (บทที่ 3.5) — AuthService ถูกแก้เพื่อรองรับ Mobile
 *
 * สิ่งที่ต้องพิสูจน์คือ "เว็บต้องไม่เปลี่ยนพฤติกรรม":
 *   - เว็บไม่ส่งข้อมูลเครื่องมา session ต้องยังเป็น WEB และไม่ผูกกับเครื่องใด
 *   - refresh ของเว็บ (ไม่ส่ง expectedInstallationId) ต้องไม่ถูกตรวจ device binding
 * และฝั่ง Mobile ต้องได้ device binding จริง
 */
describe('AuthService · session metadata สำหรับ Mobile', () => {
  function buildService(session?: Record<string, unknown>) {
    const created: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];

    const prisma = {
      userSession: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updated.push(data);
          return data;
        }),
        findFirst: jest.fn(async () => session ?? null),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      user: {
        update: jest.fn(async () => ({})),
      },
    };

    const jwtService = {
      signAsync: jest.fn(async () => 'signed-token'),
      verifyAsync: jest.fn(async () => ({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      })),
    };

    const configService = {
      get: jest.fn((_key: string, fallback?: string) => fallback),
      getOrThrow: jest.fn(() => 'secret'),
    };

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    return { created, prisma, service, updated };
  }

  const user = {
    id: 'user-1',
    email: 'a@b.c',
    displayName: 'พนักงาน',
    roles: [],
  };

  function createSession(
    service: AuthService,
    context: Record<string, unknown>,
  ) {
    return (
      service as unknown as {
        createAuthenticatedSession: (
          user: unknown,
          context: unknown,
        ) => Promise<{ sessionId: string }>;
      }
    ).createAuthenticatedSession(user, context);
  }

  it('เว็บ (ไม่ส่งข้อมูลเครื่อง) ต้องได้ session แบบ WEB และไม่ผูกกับเครื่อง', async () => {
    const { created, service } = buildService();

    await createSession(service, {
      ipAddress: '10.0.0.1',
      userAgent: 'Chrome',
    });

    expect(created[0]).toMatchObject({
      sessionType: 'WEB',
      installationId: null,
      platform: null,
      lastSeenAt: null,
    });
  });

  it('มือถือต้องได้ session แบบ MOBILE ที่ผูกกับ installationId', async () => {
    const { created, service } = buildService();

    await createSession(service, {
      ipAddress: '10.0.0.1',
      userAgent: 'EmployeeApp/1.0.0',
      device: {
        installationId: 'install-1',
        platform: 'android',
        appVersion: '1.0.0',
        appBuild: 100,
        sessionType: 'MOBILE',
      },
    });

    expect(created[0]).toMatchObject({
      sessionType: 'MOBILE',
      installationId: 'install-1',
      platform: 'android',
      appBuild: 100,
    });
    expect(created[0]?.lastSeenAt).toBeInstanceOf(Date);
  });

  it('refresh ของเว็บต้องไม่ถูกตรวจ device binding', async () => {
    const { service } = buildService({
      id: 'session-1',
      installationId: null,
      sessionType: 'WEB',
      refreshTokenHash: 'hash',
      user: { ...user, status: 'ACTIVE' },
    });

    // ไปไม่ถึงขั้นเทียบ hash ก็พอ — ประเด็นคือต้องไม่ถูกปฏิเสธเพราะ device binding
    await expect(service.refresh('refresh-token')).rejects.toThrow(
      'Refresh Token ไม่ถูกต้อง',
    );
  });

  it('refresh จากเครื่องอื่นต้องถูกปฏิเสธก่อนเทียบ token', async () => {
    const { service } = buildService({
      id: 'session-1',
      installationId: 'install-เดิม',
      sessionType: 'MOBILE',
      refreshTokenHash: 'hash',
      user: { ...user, status: 'ACTIVE' },
    });

    await expect(
      service.refresh('refresh-token', {
        expectedInstallationId: 'install-เครื่องอื่น',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('revokeSessionsByInstallationId ต้องยกเลิกเฉพาะ session ของเครื่องนั้น', async () => {
    const prismaUpdateMany = jest.fn(async () => ({ count: 2 }));
    const service = new AuthService(
      { userSession: { updateMany: prismaUpdateMany } } as never,
      {} as never,
      {} as never,
    );

    const result = await service.revokeSessionsByInstallationId(
      'user-1',
      'install-1',
    );

    expect(result).toEqual({ revoked: true, revokedCount: 2 });
    expect(prismaUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', installationId: 'install-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
