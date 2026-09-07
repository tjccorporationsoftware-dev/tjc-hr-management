import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

import { AuthService } from './auth.service';

/**
 * การหมุน Refresh Token
 * -----------------------------------------------------------------------------
 * ระบบตั้งใจให้ Refresh Token ใช้ได้ครั้งเดียว: ทุกครั้งที่ refresh สำเร็จจะออกใบใหม่
 * และถ้ามีใครเอาใบเก่ามาใช้ซ้ำ ให้ถือว่าใบนั้นรั่วแล้ว จึงเพิกถอน session ทั้งใบทิ้ง
 *
 * ของเดิมกลไกนี้ไม่เคยทำงานเลย เพราะเก็บลายนิ้วมือด้วย `bcrypt.hash(token, 12)`
 * ซึ่ง **bcrypt อ่านแค่ 72 ไบต์แรกแล้วตัดที่เหลือทิ้ง** — 72 ไบต์แรกของ JWT คือ
 * header กับต้น payload ที่เหมือนกันทุกใบของ session เดียวกัน ส่วน signature
 * ที่ทำให้แต่ละใบต่างกันอยู่ท้ายสุดและไม่เคยถูก hash
 *
 * ผลคือ token เก่าทุกใบยังใช้ได้จนกว่า session จะหมดอายุ (7 วัน)
 * และการหมุน token ก็ไม่ได้ป้องกันอะไรเลย
 */
describe('AuthService · การหมุน Refresh Token', () => {
  const userId = 'user-1';
  const sessionId = 'session-1';

  /*
   * JWT จริงยาวเกิน 72 ไบต์ และสองใบของ session เดียวกันจะต่างกัน
   * เฉพาะช่วงท้าย (payload ตอนหลัง + signature) เท่านั้น
   */
  const sharedPrefix =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uSWQiOiJzZXNzaW9uLTEi';
  const oldToken = `${sharedPrefix}LCJqdGkiOiJPTEQifQ.signature-of-the-old-token`;
  const newToken = `${sharedPrefix}LCJqdGkiOiJORVcifQ.signature-of-the-new-token`;

  it('สมมติฐานของบั๊ก: bcrypt มองไม่เห็นความต่างของ token สองใบนี้', async () => {
    expect(oldToken.slice(0, 72)).toBe(newToken.slice(0, 72));
    expect(oldToken).not.toBe(newToken);

    const bcryptHashOfNew = await bcrypt.hash(newToken, 4);

    // นี่คือเหตุผลที่การหมุน token ไม่เคยได้ผล
    expect(await bcrypt.compare(oldToken, bcryptHashOfNew)).toBe(true);

    // SHA-256 อ่านทั้งสาย จึงแยกออก
    const sha = (value: string) =>
      createHash('sha256').update(value).digest('hex');
    expect(sha(oldToken)).not.toBe(sha(newToken));
  });

  function buildService(storedHash: string) {
    const session = {
      id: sessionId,
      userId,
      refreshTokenHash: storedHash,
      sessionType: 'WEB',
      installationId: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      user: {
        id: userId,
        email: 'user@example.com',
        displayName: 'ผู้ใช้ทดสอบ',
        status: 'ACTIVE',
        roles: [],
      },
    };

    const revoked: unknown[] = [];
    const updates: Record<string, unknown>[] = [];

    const prisma = {
      userSession: {
        findFirst: jest.fn(() => Promise.resolve(session)),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return Promise.resolve({});
        }),
        updateMany: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          revoked.push(data);
          return Promise.resolve({ count: 1 });
        }),
      },
      user: { update: jest.fn(() => Promise.resolve({})) },
      auditLog: { create: jest.fn(() => Promise.resolve({})) },
    };

    const jwtService = {
      verifyAsync: jest.fn(() =>
        Promise.resolve({ sub: userId, sessionId, type: 'refresh', jti: 'x' }),
      ),
      signAsync: jest.fn(() => Promise.resolve(newToken)),
    };

    const configService = {
      get: jest.fn((_key: string, fallback?: string) => fallback),
      getOrThrow: jest.fn(() => 'secret'),
    };

    return {
      service: new AuthService(
        prisma as never,
        jwtService as never,
        configService as never,
      ),
      revoked,
      updates,
    };
  }

  const sha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex');

  it('token ที่ถูกต้อง refresh ผ่าน และได้ hash ใหม่เก็บแทน', async () => {
    const { service, updates } = buildService(sha256(oldToken));

    const result = await service.refresh(oldToken);

    expect(result.accessToken).toBeDefined();
    expect(updates[0]?.refreshTokenHash).toBe(sha256(newToken));
  });

  /* เทสหลักของไฟล์นี้ — ของเดิมจะตกตรงนี้ */
  it('token เก่าที่ถูกหมุนไปแล้ว ต้องใช้ไม่ได้', async () => {
    const { service } = buildService(sha256(newToken));

    await expect(service.refresh(oldToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('เอา token เก่ามาใช้ซ้ำ ต้องเพิกถอน session ทั้งใบ', async () => {
    const { service, revoked } = buildService(sha256(newToken));

    await expect(service.refresh(oldToken)).rejects.toThrow();

    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toHaveProperty('revokedAt');
  });

  /*
   * session ที่ออกก่อน deploy ยังเก็บ hash แบบ bcrypt
   * ต้องใช้ต่อได้ ไม่งั้นทุกคนถูกเตะออกพร้อมกันตอน deploy
   */
  it('session เก่าที่ยังเป็น bcrypt ต้องใช้ต่อได้ แล้วเขียนทับเป็นแบบใหม่', async () => {
    const legacyHash = await bcrypt.hash(oldToken, 4);
    const { service, updates } = buildService(legacyHash);

    const result = await service.refresh(oldToken);

    expect(result.accessToken).toBeDefined();
    expect(updates[0]?.refreshTokenHash).toBe(sha256(newToken));
    expect(String(updates[0]?.refreshTokenHash)).not.toMatch(/^\$2/);
  });
});
