import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';

/**
 * นโยบาย 2FA — สวิตช์หลักตัวเดียวคุมทั้งระบบ
 *
 * ที่มา: ระบบยังไม่มีช่องทางส่ง OTP ให้ผู้ใช้เลย (ไม่มีทั้ง TOTP อีเมล และ SMS)
 * รหัสถูกส่งกลับผ่าน response ตอน dev เท่านั้น การเปิดบังคับ 2FA จึงเท่ากับ
 * ล็อกผู้ใช้ออกจากระบบถาวร เราจึงปิดทั้งระบบไว้ที่จุดเดียวก่อน
 *
 * ของเดิมปิดเฉพาะช่องทาง MOBILE ซึ่งกลายเป็นทางลัดข้าม 2FA — token ที่ได้จาก
 * แอปใช้กับ endpoint ของเว็บได้ทุกตัว ใครรู้รหัสผ่านของผู้ดูแลก็ยิง curl
 * พร้อม header เดียวก็ข้ามด่านได้ทั้งด่าน
 *
 * สิ่งที่เทสนี้ต้องกันไว้ให้ได้:
 *   1. ปิดสวิตช์แล้วต้องปิดจริงทุกทาง รวมถึงผู้ใช้ที่มีธงติดอยู่ในฐานข้อมูล
 *   2. เปิดสวิตช์แล้วต้องบังคับทุกช่องทางเท่ากัน — มือถือต้องไม่มีทางลัดอีก
 */
describe('AuthService · นโยบาย 2FA', () => {
  const password = 'correct-password';

  type BuildOptions = {
    env?: Record<string, string>;
    /** ธงที่ผูกกับตัวผู้ใช้ในฐานข้อมูล แยกจาก role ที่บังคับตาม config */
    twoFactorEnabled?: boolean;
    roleCodes?: string[];
  };

  function buildService({
    env = {},
    twoFactorEnabled = false,
    roleCodes = [],
  }: BuildOptions = {}) {
    const auditLogs: Record<string, unknown>[] = [];
    const sessions: Record<string, unknown>[] = [];

    const user = {
      id: 'user-1',
      email: 'admin@example.com',
      displayName: 'ผู้ดูแลระบบ',
      passwordHash: bcrypt.hashSync(password, 4),
      phone: null,
      avatarUrl: null,
      status: 'ACTIVE',
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled,
      twoFactorCodeHash: null,
      twoFactorCodeExpiresAt: null,
      twoFactorFailedAttempts: 0,
      roles: roleCodes.map((code) => ({
        role: { code, name: code, isActive: true, permissions: [] },
      })),
    };

    const prisma = {
      user: {
        findUnique: jest.fn(() => Promise.resolve(user)),
        update: jest.fn(() => Promise.resolve({})),
      },
      userSession: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          sessions.push(data);
          return Promise.resolve(data);
        }),
        update: jest.fn(() => Promise.resolve({})),
      },
      auditLog: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          auditLogs.push(data);
          return Promise.resolve(data);
        }),
      },
    };

    const jwtService = {
      signAsync: jest.fn(() => Promise.resolve('signed-token')),
    };

    const configService = {
      get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback),
      getOrThrow: jest.fn(() => 'secret'),
    };

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    return { auditLogs, service, sessions };
  }

  const credentials = { email: 'admin@example.com', password };

  const webContext = { ipAddress: '10.0.0.1', userAgent: 'Chrome' };

  const mobileContext = {
    ipAddress: '10.0.0.2',
    userAgent: 'EmployeeMobile',
    device: {
      installationId: 'installation-1',
      platform: 'android',
      sessionType: 'MOBILE' as const,
    },
  };

  /* ---------------------------------------------------------------- */

  describe('ปิดสวิตช์ (ค่าเริ่มต้น — ยังไม่มีช่องทางส่งรหัส)', () => {
    it('ไม่ตั้ง TWO_FACTOR_ENABLED เลย ต้องถือว่าปิด', async () => {
      const { service } = buildService();

      const result = await service.login(credentials, webContext);

      expect(result.requiresTwoFactor).toBe(false);
    });

    /*
     * เทสตัวสำคัญ: ธงที่ผูกกับผู้ใช้ในฐานข้อมูลต้องไม่ข้ามสวิตช์หลัก
     * ถ้าเช็คสวิตช์ทีหลังเงื่อนไขนี้ ผู้ใช้ที่มีธงติดอยู่จะล็อกตัวเองออก
     * ทั้งที่ปิด 2FA ไปแล้วทั้งระบบ และจะหาสาเหตุยากมากเพราะปิดถูกต้องแล้ว
     */
    it('ผู้ใช้ที่มีธง twoFactorEnabled ในฐานข้อมูล ต้องยังล็อกอินได้', async () => {
      const { service } = buildService({ twoFactorEnabled: true });

      const result = await service.login(credentials, webContext);

      expect(result.requiresTwoFactor).toBe(false);
    });

    it('บทบาทที่อยู่ในรายการบังคับ 2FA ต้องยังล็อกอินได้', async () => {
      const { service } = buildService({
        env: { TWO_FACTOR_REQUIRED_ROLE_CODES: 'SYSTEM_ADMIN' },
        roleCodes: ['SYSTEM_ADMIN'],
      });

      const result = await service.login(credentials, webContext);

      expect(result.requiresTwoFactor).toBe(false);
    });
  });

  describe('เปิดสวิตช์ (หลังทำ OTP delivery เสร็จ)', () => {
    const enabled = { TWO_FACTOR_ENABLED: 'true' };

    it('เว็บบังคับ 2FA', async () => {
      const { service } = buildService({
        env: enabled,
        twoFactorEnabled: true,
      });

      const result = await service.login(credentials, webContext);

      expect(result.requiresTwoFactor).toBe(true);
    });

    /*
     * เทสที่กันช่องโหว่เดิมไม่ให้กลับมา
     * ห้ามมี env ตัวไหนหรือ header ตัวไหนที่ทำให้ช่องทางมือถือข้าม 2FA ได้อีก
     */
    it('มือถือบังคับ 2FA เท่ากับเว็บ — ต้องไม่มีทางลัด', async () => {
      const { service, sessions } = buildService({
        env: enabled,
        twoFactorEnabled: true,
      });

      const result = await service.login(credentials, mobileContext);

      expect(result.requiresTwoFactor).toBe(true);
      // ต้องไม่มี session ถูกสร้างก่อนยืนยันรหัส
      expect(sessions).toHaveLength(0);
    });

    it('บทบาทในรายการบังคับ ต้องถูกบังคับทั้งเว็บและมือถือ', async () => {
      const { service } = buildService({
        env: { ...enabled, TWO_FACTOR_REQUIRED_ROLE_CODES: 'HR_ADMIN' },
        roleCodes: ['HR_ADMIN'],
      });

      await expect(
        service.login(credentials, mobileContext),
      ).resolves.toMatchObject({ requiresTwoFactor: true });
    });

    it('ผู้ใช้ที่ไม่เข้าเงื่อนไขใดเลย ยังล็อกอินตรงได้', async () => {
      const { service } = buildService({
        env: { ...enabled, TWO_FACTOR_REQUIRED_ROLE_CODES: 'SYSTEM_ADMIN' },
        roleCodes: ['EMPLOYEE'],
      });

      const result = await service.login(credentials, webContext);

      expect(result.requiresTwoFactor).toBe(false);
    });
  });
});
