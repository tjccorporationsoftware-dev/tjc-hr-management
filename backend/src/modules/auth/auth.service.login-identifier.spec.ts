import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';

/**
 * ตัวระบุตอนล็อกอิน — username (รหัสพนักงาน/อีเมล) กับ email ที่แอปรุ่นเก่าส่งมา
 *
 * เกิดจริง 2569-09-11: หลังขึ้นระบบที่รับ username แอปรุ่นเก่าที่ยังส่งแค่ `email`
 * ล็อกอินไม่ได้ทั้งบริษัท ทั้งที่รหัสถูก เพราะ LoginDto ตั้งค่าเริ่มต้น `username = ''`
 * (ให้ข้อความ validation ไม่ขึ้นทุกข้อพร้อมกัน) แล้ว service ใช้ `??` ซึ่งไม่ตกไปหา
 * email เมื่อเจอสตริงว่าง — identifier จึงเป็น "" แล้วหาผู้ใช้ไม่เจอ
 *
 * เว็บไม่โดนเพราะหน้าเว็บใหม่ส่ง username มาเสมอ บั๊กเลยเงียบจนพนักงานเปิดแอป
 */
describe('AuthService · ตัวระบุตอนล็อกอิน', () => {
  const password = 'correct-password';
  const email = 'someone@example.com';

  function buildService() {
    const user = {
      id: 'user-1',
      email,
      displayName: 'พนักงาน',
      passwordHash: bcrypt.hashSync(password, 4),
      phone: null,
      avatarUrl: null,
      status: 'ACTIVE',
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false,
      twoFactorCodeHash: null,
      twoFactorCodeExpiresAt: null,
      twoFactorFailedAttempts: 0,
      roles: [],
    };

    const findUnique = jest.fn(
      ({ where }: { where: { email?: string; id?: string } }) =>
        Promise.resolve(
          where.email === email || where.id === user.id ? user : null,
        ),
    );

    const prisma = {
      user: { findUnique, update: jest.fn(() => Promise.resolve({})) },
      employee: { findMany: jest.fn(() => Promise.resolve([])) },
      userSession: {
        create: jest.fn(({ data }: { data: unknown }) => Promise.resolve(data)),
        update: jest.fn(() => Promise.resolve({})),
      },
      auditLog: { create: jest.fn(() => Promise.resolve({})) },
    };

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn(() => Promise.resolve('token')) } as never,
      {
        get: jest.fn((_key: string, fallback?: string) => fallback),
        getOrThrow: jest.fn(() => 'secret'),
      } as never,
    );

    return { service, findUnique };
  }

  const context = { ipAddress: '10.0.0.1', userAgent: 'EmployeeMobile' };

  it('แอปรุ่นเก่าส่ง email อย่างเดียว (username เป็นสตริงว่างจากค่าเริ่มต้นของ DTO) ต้องเข้าได้', async () => {
    const { service, findUnique } = buildService();

    const result = await service.login(
      { username: '', email, password },
      context,
    );

    expect(result.requiresTwoFactor).toBe(false);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email } }),
    );
  });

  it('ส่ง username เป็นอีเมล ต้องหาจากอีเมล', async () => {
    const { service, findUnique } = buildService();

    await service.login({ username: email, password }, context);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email } }),
    );
  });

  it('ไม่ส่งอะไรมาเลย ต้องปฏิเสธ ไม่ใช่หาผู้ใช้ด้วยสตริงว่าง', async () => {
    const { service, findUnique } = buildService();

    await expect(
      service.login({ username: '', password }, context),
    ).rejects.toThrow();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
