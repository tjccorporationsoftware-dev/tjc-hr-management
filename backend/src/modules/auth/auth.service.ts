import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { AuditAction, Prisma } from '../../generated/prisma/client';
import { LoginDto } from './dto/login.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { ChangeOwnPasswordDto } from './dto/change-password.dto';

/** ข้อความเดียวไม่ว่าจะหาบัญชีไม่เจอหรือรหัสผ่านผิด — ไม่บอกใบ้ว่าอันไหนผิด */
const LOGIN_FAILED_MESSAGE = 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง';

/**
 * ข้อมูลเครื่องที่ผูกกับ session — ใช้เฉพาะฝั่ง Mobile (BE-MOB-001)
 * ฝั่งเว็บไม่ส่งค่านี้ session จึงยังเป็น sessionType = WEB เหมือนเดิม
 */
export type SessionDeviceMetadata = {
  installationId?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  appBuild?: number | null;
  sessionType?: 'WEB' | 'MOBILE';
};

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  device?: SessionDeviceMetadata;
};

type RefreshOptions = {
  /**
   * ถ้าส่งมา session ต้องผูกกับเครื่องนี้เท่านั้น
   * กัน refresh token ที่ถูกขโมยไปใช้ต่อจากเครื่องอื่น
   */
  expectedInstallationId?: string;
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  sessionId: string;
  type: 'access';
};

type RefreshTokenPayload = {
  sub: string;
  sessionId: string;
  type: 'refresh';
  /**
   * ทำให้ token แต่ละใบไม่ซ้ำกัน
   *
   * ถ้าไม่มีตัวนี้ payload จะเหมือนกันทุกใบของ session เดียวกัน เหลือแต่ `iat`
   * ที่ละเอียดแค่ระดับวินาที — refresh สองครั้งในวินาทีเดียวกันจึงได้ token
   * ที่เหมือนกันเป๊ะ และการหมุน token ก็ไม่มีความหมาย
   *
   * ใช้แนวเดียวกับ TwoFactorTokenPayload ที่ใส่ nonce ไว้อยู่แล้ว
   */
  jti: string;
};

type TwoFactorTokenPayload = {
  sub: string;
  email: string;
  type: 'two_factor';
  nonce: string;
};

type UserForAuth = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  scopeLevel?: 'GLOBAL' | 'COMPANY' | 'BRANCH' | null;
  scopedCompanyId?: string | null;
  scopedBranchId?: string | null;
  status: string;
  deletedAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  twoFactorEnabled: boolean;
  twoFactorCodeHash: string | null;
  twoFactorCodeExpiresAt: Date | null;
  twoFactorFailedAttempts: number;
  roles: {
    role: {
      code: string;
      name: string;
      isActive: boolean;
      permissions: {
        permission: {
          code: string;
          isActive: boolean;
        };
      }[];
    };
  }[];
};

/**
 * เก็บ/เทียบลายนิ้วมือของ Refresh Token
 * =====================================
 * เดิมใช้ `bcrypt.hash(refreshToken, 12)` ซึ่งใช้กับ token ไม่ได้
 * เพราะ **bcrypt อ่านแค่ 72 ไบต์แรกของ input แล้วตัดที่เหลือทิ้ง**
 *
 * 72 ไบต์แรกของ JWT คือ header กับต้น payload ซึ่งเหมือนกันทุกใบของ session
 * เดียวกัน ส่วน signature ที่ทำให้แต่ละใบต่างกันอยู่ท้ายสุด — ไม่เคยถูก hash เลย
 * ผลคือ token เก่าทุกใบยังผ่านการเทียบได้ตลอด การหมุน token จึงไม่มีผลอะไร
 * และกลไก "เจอ token ไม่ตรง = เพิกถอน session ทิ้ง" ที่เขียนไว้ก็ไม่เคยทำงาน
 *
 * เปลี่ยนมาใช้ SHA-256 ซึ่งไม่มีเพดานความยาวและเหมาะกับค่าที่สุ่มมาแล้ว
 * (bcrypt มีไว้ถ่วงเวลาการเดารหัสผ่านที่เอนโทรปีต่ำ — JWT ที่เซ็นด้วยคีย์ลับ
 * ไม่ได้อยู่ในกลุ่มนั้น) ได้ผลพลอยได้คือตัด bcrypt cost 12 ออกจากทุกครั้งที่ refresh
 */
function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function refreshTokenMatches(token: string, storedHash: string) {
  /*
   * session ที่ออกก่อน deploy รอบนี้ยังเก็บ hash แบบ bcrypt อยู่
   * ปล่อยให้เทียบแบบเดิมได้ต่อ ไม่งั้นทุกคนที่ค้าง session อยู่จะถูกเตะออกพร้อมกัน
   * ตอน deploy โดยไม่มีอะไรอธิบาย — hash จะถูกเขียนทับเป็นแบบใหม่ทันทีที่ refresh
   * ครั้งแรกผ่าน (ลบเงื่อนไขนี้ได้หลังผ่านไปเกินอายุ REFRESH_TOKEN_EXPIRES_IN)
   */
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(token, storedHash);
  }

  const expected = Buffer.from(storedHash, 'utf8');
  const actual = Buffer.from(hashRefreshToken(token), 'utf8');

  if (expected.length !== actual.length) {
    return Promise.resolve(false);
  }

  return Promise.resolve(timingSafeEqual(expected, actual));
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto, context: RequestContext) {
    /*
     * ต้องใช้ || ไม่ใช่ ?? — DTO ตั้งค่าเริ่มต้น username = '' ไว้ พอแอปรุ่นเก่า
     * ส่งมาแค่ email ตัว username จึงเป็นสตริงว่าง ไม่ใช่ undefined แล้ว ?? จะไม่
     * ตกไปหา email ทำให้แอปเก่าล็อกอินไม่ได้ทั้งบริษัท (เกิดจริง 2569-09-11)
     */
    const identifier = dto.username?.trim() || dto.email?.trim() || '';

    const user = await this.findUserForAuthByIdentifier(identifier);

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    await this.ensureUserIsNotLocked(user, context);

    const passwordMatched = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatched) {
      await this.handleFailedPasswordLogin(user, context);
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    await this.clearLoginProtection(user.id);

    if (this.shouldRequireTwoFactor(user)) {
      const twoFactorResult = await this.createTwoFactorChallenge(
        user,
        context,
      );

      return {
        requiresTwoFactor: true as const,
        twoFactorToken: twoFactorResult.twoFactorToken,
        expiresAt: twoFactorResult.expiresAt,
        debugTwoFactorCode: twoFactorResult.debugTwoFactorCode,
      };
    }

    return this.createAuthenticatedSession(user, context);
  }

  async verifyTwoFactor(dto: VerifyTwoFactorDto, context: RequestContext) {
    const payload = await this.verifyTwoFactorToken(dto.twoFactorToken);

    const user = await this.findUserForAuthById(payload.sub);

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('บัญชีผู้ใช้ไม่ถูกต้อง');
    }

    await this.ensureUserIsNotLocked(user, context);

    if (!user.twoFactorCodeHash || !user.twoFactorCodeExpiresAt) {
      throw new UnauthorizedException('ไม่พบรหัสยืนยัน 2FA หรือรหัสหมดอายุ');
    }

    if (user.twoFactorCodeExpiresAt.getTime() <= Date.now()) {
      await this.clearTwoFactorChallenge(user.id);

      await this.writeSecurityAuditLog({
        action: AuditAction.TWO_FACTOR_FAILED,
        userId: user.id,
        context,
        statusCode: 401,
        description: '2FA code expired',
        metadata: {
          email: user.email,
          reason: 'expired',
        },
      });

      throw new UnauthorizedException('รหัสยืนยัน 2FA หมดอายุ');
    }

    const codeMatched = await bcrypt.compare(dto.code, user.twoFactorCodeHash);

    if (!codeMatched) {
      await this.handleFailedTwoFactor(user, context);
      throw new UnauthorizedException('รหัสยืนยัน 2FA ไม่ถูกต้อง');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCodeHash: null,
        twoFactorCodeExpiresAt: null,
        twoFactorRequestedAt: null,
        twoFactorFailedAttempts: 0,
        twoFactorLastVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
      },
    });

    await this.writeSecurityAuditLog({
      action: AuditAction.TWO_FACTOR_SUCCESS,
      userId: user.id,
      context,
      statusCode: 200,
      description: '2FA verification success',
      metadata: {
        email: user.email,
      },
    });

    return this.createAuthenticatedSession(user, context);
  }

  async refresh(
    refreshToken: string | undefined,
    options: RefreshOptions = {},
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('ไม่พบ Refresh Token');
    }

    const payload = await this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.userSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
            scopedCompany: { select: { id: true, code: true, nameTh: true } },
            scopedBranch: { select: { id: true, code: true, nameTh: true } },
          },
        },
      },
    });

    if (!session || !session.user || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session หมดอายุหรือไม่ถูกต้อง');
    }

    // Device binding: ตรวจก่อนเทียบ token hash เพื่อไม่เผยว่า token ถูกหรือผิด
    if (
      options.expectedInstallationId &&
      session.installationId !== options.expectedInstallationId
    ) {
      throw new UnauthorizedException('Session ไม่ตรงกับเครื่องที่ใช้งาน');
    }

    const refreshMatched = await refreshTokenMatches(
      refreshToken,
      session.refreshTokenHash,
    );

    if (!refreshMatched) {
      await this.prisma.userSession.updateMany({
        where: { id: payload.sessionId },
        data: { revokedAt: new Date() },
      });

      throw new UnauthorizedException('Refresh Token ไม่ถูกต้อง');
    }

    const newRefreshExpiresAt = this.getRefreshExpiresAt();
    const newAccessToken = await this.createAccessToken(
      session.user.id,
      session.user.email,
      session.id,
    );
    const newRefreshToken = await this.createRefreshToken(
      session.user.id,
      session.id,
    );
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newRefreshExpiresAt,
        ...(session.sessionType === 'MOBILE' ? { lastSeenAt: new Date() } : {}),
      },
    });

    return {
      requiresTwoFactor: false as const,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      refreshExpiresAt: newRefreshExpiresAt,
      sessionId: session.id,
      user: this.mapUserResponse(session.user),
    };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return { loggedOut: true };
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);

      await this.prisma.userSession.updateMany({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      // ไม่ต้อง throw เพื่อให้ client logout ได้เสมอ
    }

    return { loggedOut: true };
  }

  async getMySessions(userId: string) {
    const now = new Date();
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const data = sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isActive:
        !session.revokedAt && session.expiresAt.getTime() > now.getTime(),
    }));

    const active = data.filter((session) => session.isActive).length;
    const revoked = data.filter((session) => Boolean(session.revokedAt)).length;
    const expired = data.filter(
      (session) => new Date(session.expiresAt).getTime() <= now.getTime(),
    ).length;

    return {
      data,
      summary: {
        total: data.length,
        active,
        inactive: data.length - active,
        revoked,
        expired,
      },
    };
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException(
        'ไม่พบ Session หรือ Session ถูกยกเลิกแล้ว',
      );
    }

    await this.prisma.userSession.update({
      where: {
        id: sessionId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      revoked: true,
      sessionId,
    };
  }

  async revokeOtherSessions(userId: string, refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('ไม่พบ Refresh Token');
    }

    const payload = await this.verifyRefreshToken(refreshToken);

    if (payload.sub !== userId) {
      throw new UnauthorizedException('Session ไม่ตรงกับผู้ใช้งานปัจจุบัน');
    }

    const result = await this.prisma.userSession.updateMany({
      where: {
        userId,
        id: {
          not: payload.sessionId,
        },
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      revoked: true,
      revokedCount: result.count,
      currentSessionId: payload.sessionId,
    };
  }

  /**
   * ยกเลิกทุก session ที่ผูกกับเครื่องหนึ่ง ๆ (ใช้ตอนถอนสิทธิ์เครื่องจากแอป)
   * เขียนที่ AuthService เพื่อให้การจัดการ session ยังรวมศูนย์อยู่ที่เดียว
   */
  async revokeSessionsByInstallationId(userId: string, installationId: string) {
    const result = await this.prisma.userSession.updateMany({
      where: {
        userId,
        installationId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { revoked: true, revokedCount: result.count };
  }

  /**
   * หาบัญชีจากสิ่งที่พิมพ์ในช่องแรกของหน้าล็อกอิน
   *
   * มี @ = อีเมล (ผู้ดูแลระบบ / บัญชีที่ไม่ผูกพนักงาน)
   * ไม่มี @ = รหัสพนักงาน → ไล่ไปหา user ที่ผูกกับพนักงานคนนั้น
   *
   * รหัสพนักงานซ้ำได้ข้ามบริษัท ถ้าเจอบัญชีมากกว่าหนึ่ง ไม่เดาให้ — บอกให้ใช้อีเมลแทน
   * ส่วนกรณีหาไม่เจอ ตอบ null ให้ผู้เรียกโยน error กลาง ๆ เหมือนรหัสผ่านผิด
   * จะได้ไม่เป็นช่องให้ไล่เดาว่ารหัสพนักงานไหนมีบัญชี
   */
  private async findUserForAuthByIdentifier(identifier: string) {
    if (!identifier) return null;
    if (identifier.includes('@')) {
      return this.findUserForAuthByEmail(identifier);
    }

    const linked = await this.prisma.employee.findMany({
      where: {
        employeeCode: identifier,
        deletedAt: null,
        userId: { not: null },
      },
      select: { userId: true },
    });

    if (linked.length > 1) {
      throw new BadRequestException(
        'รหัสพนักงานนี้มีอยู่ในหลายบริษัท กรุณาเข้าสู่ระบบด้วยอีเมลแทน',
      );
    }

    const userId = linked[0]?.userId;
    return userId ? this.findUserForAuthById(userId) : null;
  }

  private async findUserForAuthByEmail(email: string) {
    return this.prisma.user.findUnique({
      /*
       * ต้อง normalize ซ้ำตรงนี้ ไม่ใช่พึ่ง DTO อย่างเดียว
       * ทางเข้าอื่น (แอปมือถือ, การเรียกภายใน) ไม่ได้ผ่าน LoginDto ทุกทาง
       * และ findUnique เทียบตรงตัวเป๊ะ พลาดตัวเดียวคือเข้าระบบไม่ได้
       */
      where: { email: normalizeEmail(email) },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        scopedCompany: { select: { id: true, code: true, nameTh: true } },
        scopedBranch: { select: { id: true, code: true, nameTh: true } },
      },
    });
  }

  private async findUserForAuthById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        scopedCompany: { select: { id: true, code: true, nameTh: true } },
        scopedBranch: { select: { id: true, code: true, nameTh: true } },
      },
    });
  }

  private async ensureUserIsNotLocked(
    user: Pick<UserForAuth, 'id' | 'email' | 'lockedUntil'>,
    context: RequestContext,
  ) {
    if (!user.lockedUntil) {
      return;
    }

    if (user.lockedUntil.getTime() <= Date.now()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          twoFactorFailedAttempts: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      });

      return;
    }

    await this.writeSecurityAuditLog({
      action: AuditAction.LOGIN_LOCKED,
      userId: user.id,
      context,
      statusCode: 401,
      description: 'Login blocked because account is locked',
      metadata: {
        email: user.email,
        lockedUntil: user.lockedUntil.toISOString(),
      },
    });

    throw new UnauthorizedException('บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง');
  }

  private async handleFailedPasswordLogin(
    user: Pick<UserForAuth, 'id' | 'email' | 'failedLoginAttempts'>,
    context: RequestContext,
  ) {
    const maxAttempts = this.getLoginMaxFailedAttempts();
    const failedAttempts = user.failedLoginAttempts + 1;
    const shouldLock = failedAttempts >= maxAttempts;
    const lockedUntil = shouldLock ? this.getLockUntil() : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: failedAttempts,
        lastFailedLoginAt: new Date(),
        lockedUntil,
      },
    });

    await this.writeSecurityAuditLog({
      action: shouldLock ? AuditAction.LOGIN_LOCKED : AuditAction.LOGIN_FAILED,
      userId: user.id,
      context,
      statusCode: 401,
      description: shouldLock
        ? 'Account locked from failed login attempts'
        : 'Failed password login',
      metadata: {
        email: user.email,
        failedAttempts,
        maxAttempts,
        lockedUntil: lockedUntil?.toISOString() ?? null,
      },
    });
  }

  private async handleFailedTwoFactor(
    user: UserForAuth,
    context: RequestContext,
  ) {
    const maxAttempts = this.getLoginMaxFailedAttempts();
    const failedAttempts = user.twoFactorFailedAttempts + 1;
    const shouldLock = failedAttempts >= maxAttempts;
    const lockedUntil = shouldLock ? this.getLockUntil() : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorFailedAttempts: failedAttempts,
        lastFailedLoginAt: new Date(),
        lockedUntil,
        ...(shouldLock
          ? {
              twoFactorCodeHash: null,
              twoFactorCodeExpiresAt: null,
              twoFactorRequestedAt: null,
            }
          : {}),
      },
    });

    await this.writeSecurityAuditLog({
      action: shouldLock
        ? AuditAction.LOGIN_LOCKED
        : AuditAction.TWO_FACTOR_FAILED,
      userId: user.id,
      context,
      statusCode: 401,
      description: shouldLock
        ? 'Account locked from failed 2FA attempts'
        : 'Failed 2FA verification',
      metadata: {
        email: user.email,
        failedAttempts,
        maxAttempts,
        lockedUntil: lockedUntil?.toISOString() ?? null,
      },
    });
  }

  private async clearLoginProtection(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
      },
    });
  }

  private async clearTwoFactorChallenge(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorCodeHash: null,
        twoFactorCodeExpiresAt: null,
        twoFactorRequestedAt: null,
        twoFactorFailedAttempts: 0,
      },
    });
  }

  /**
   * สวิตช์หลักของ 2FA ทั้งระบบ
   * =========================
   * ระบบยัง "ไม่มี" ช่องทางส่ง OTP ให้ผู้ใช้เลย (ไม่มีอีเมล/SMS/TOTP)
   * รหัสถูกส่งกลับหน้าเว็บผ่าน debugTwoFactorCode ซึ่งปิดตายบน production
   * ถ้าเปิดบังคับ 2FA ตอนนี้ ผู้ใช้ที่เข้าเงื่อนไขจะล็อกอินไม่ได้ถาวร
   * เพราะไม่มีทางรู้รหัส และไม่มีบัญชีสำรองให้เข้าไปแก้
   *
   * จึงปิดทั้งระบบไว้ที่จุดเดียวก่อน แล้วเปิดคืนพร้อมกันเมื่อทำ delivery จริง
   * (แผนคือ TOTP/Authenticator app — ดูรายงานตรวจก่อนส่งมอบ ข้อ 01)
   *
   * ตั้งใจให้ default เป็น "ปิด" เพราะผลของการเผลอเปิดคือคนเข้าระบบไม่ได้
   * ส่วน env.validation.ts จะไม่ยอมให้บูตถ้าตั้งเป็น true บน production
   * เพื่อให้ความผิดพลาดดังตั้งแต่ตอนสตาร์ท ไม่ใช่ตอนผู้ใช้ล็อกอินไม่ได้
   */
  private isTwoFactorEnabled() {
    return (
      this.configService.get<string>('TWO_FACTOR_ENABLED', 'false') === 'true'
    );
  }

  private shouldRequireTwoFactor(user: UserForAuth) {
    /*
     * ต้องเช็คสวิตช์หลักก่อนทุกเงื่อนไข
     * ถ้าเช็คทีหลัง ผู้ใช้ที่มีธง twoFactorEnabled ติดอยู่ในฐานข้อมูล
     * จะยังถูกบังคับ 2FA และล็อกตัวเองออก ทั้งที่ปิดทั้งระบบไปแล้ว
     */
    if (!this.isTwoFactorEnabled()) {
      return false;
    }

    if (user.twoFactorEnabled) {
      return true;
    }

    const requiredRoleCodes = this.getTwoFactorRequiredRoleCodes();
    const userRoleCodes = user.roles
      .filter((userRole) => userRole.role.isActive)
      .map((userRole) => userRole.role.code);

    return userRoleCodes.some((roleCode) => requiredRoleCodes.has(roleCode));
  }

  private async createTwoFactorChallenge(
    user: UserForAuth,
    context: RequestContext,
  ) {
    const code = this.generateTwoFactorCode();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = this.getTwoFactorExpiresAt();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCodeHash: codeHash,
        twoFactorCodeExpiresAt: expiresAt,
        twoFactorRequestedAt: new Date(),
        twoFactorFailedAttempts: 0,
      },
    });

    const twoFactorToken = await this.createTwoFactorToken(user.id, user.email);

    await this.writeSecurityAuditLog({
      action: AuditAction.TWO_FACTOR_REQUIRED,
      userId: user.id,
      context,
      statusCode: 200,
      description: '2FA challenge created',
      metadata: {
        email: user.email,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      twoFactorToken,
      expiresAt,
      debugTwoFactorCode: this.shouldShowDevTwoFactorCode() ? code : undefined,
    };
  }

  private async createAuthenticatedSession(
    user: UserForAuth | Parameters<typeof this.mapUserResponse>[0],
    context: RequestContext,
  ) {
    const sessionId = randomUUID();
    const refreshExpiresAt = this.getRefreshExpiresAt();
    const device = context.device;

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: 'pending',
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        expiresAt: refreshExpiresAt,
        installationId: device?.installationId ?? null,
        platform: device?.platform ?? null,
        appVersion: device?.appVersion ?? null,
        appBuild: device?.appBuild ?? null,
        sessionType: device?.sessionType ?? 'WEB',
        lastSeenAt: device ? new Date() : null,
      },
    });

    const accessToken = await this.createAccessToken(
      user.id,
      user.email,
      sessionId,
    );
    const refreshToken = await this.createRefreshToken(user.id, sessionId);
    const refreshTokenHash = hashRefreshToken(refreshToken);

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash,
        expiresAt: refreshExpiresAt,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return {
      requiresTwoFactor: false as const,
      accessToken,
      refreshToken,
      refreshExpiresAt,
      sessionId,
      user: this.mapUserResponse(user),
    };
  }

  private async createAccessToken(
    userId: string,
    email: string,
    sessionId: string,
  ) {
    const payload: AccessTokenPayload = {
      sub: userId,
      email,
      sessionId,
      type: 'access',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'ACCESS_TOKEN_EXPIRES_IN',
        '15m',
      ) as never,
    });
  }

  private async createRefreshToken(userId: string, sessionId: string) {
    const payload: RefreshTokenPayload = {
      sub: userId,
      sessionId,
      type: 'refresh',
      jti: randomUUID(),
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>(
        'REFRESH_TOKEN_EXPIRES_IN',
        '7d',
      ) as never,
    });
  }

  private async createTwoFactorToken(userId: string, email: string) {
    const payload: TwoFactorTokenPayload = {
      sub: userId,
      email,
      type: 'two_factor',
      nonce: randomUUID(),
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: `${this.getTwoFactorExpiresMinutes()}m` as never,
    });
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );

      if (payload.type !== 'refresh' || !payload.sub || !payload.sessionId) {
        throw new UnauthorizedException('Refresh Token ไม่ถูกต้อง');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Refresh Token หมดอายุหรือไม่ถูกต้อง');
    }
  }

  private async verifyTwoFactorToken(twoFactorToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<TwoFactorTokenPayload>(
        twoFactorToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );

      if (
        payload.type !== 'two_factor' ||
        !payload.sub ||
        !payload.email ||
        !payload.nonce
      ) {
        throw new UnauthorizedException('Token ยืนยัน 2FA ไม่ถูกต้อง');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Token ยืนยัน 2FA หมดอายุหรือไม่ถูกต้อง');
    }
  }

  private getRefreshExpiresAt() {
    const expiresIn = this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
      '7d',
    );

    const now = Date.now();

    if (expiresIn.endsWith('d')) {
      return new Date(
        now + Number(expiresIn.replace('d', '')) * 24 * 60 * 60 * 1000,
      );
    }

    if (expiresIn.endsWith('h')) {
      return new Date(
        now + Number(expiresIn.replace('h', '')) * 60 * 60 * 1000,
      );
    }

    if (expiresIn.endsWith('m')) {
      return new Date(now + Number(expiresIn.replace('m', '')) * 60 * 1000);
    }

    return new Date(now + 7 * 24 * 60 * 60 * 1000);
  }

  private getLoginMaxFailedAttempts() {
    return Number(
      this.configService.get<string>('LOGIN_MAX_FAILED_ATTEMPTS', '5'),
    );
  }

  private getLockUntil() {
    const minutes = Number(
      this.configService.get<string>('LOGIN_LOCK_MINUTES', '15'),
    );

    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private getTwoFactorExpiresMinutes() {
    return Number(
      this.configService.get<string>('TWO_FACTOR_CODE_EXPIRES_MINUTES', '5'),
    );
  }

  private getTwoFactorExpiresAt() {
    return new Date(Date.now() + this.getTwoFactorExpiresMinutes() * 60 * 1000);
  }

  private getTwoFactorRequiredRoleCodes() {
    const raw = this.configService.get<string>(
      'TWO_FACTOR_REQUIRED_ROLE_CODES',
      'SYSTEM_ADMIN,HR_ADMIN,PAYROLL_ACCOUNTING',
    );

    return new Set(
      raw
        .split(',')
        .map((roleCode) => roleCode.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  private shouldShowDevTwoFactorCode() {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const allowDevCode =
      this.configService.get<string>('TWO_FACTOR_DEV_SHOW_CODE', 'true') ===
      'true';

    return !isProduction && allowDevCode;
  }

  private generateTwoFactorCode() {
    return String(randomInt(0, 1000000)).padStart(6, '0');
  }

  private async writeSecurityAuditLog(params: {
    action: AuditAction;
    userId?: string | null;
    context: RequestContext;
    statusCode: number;
    description: string;
    metadata?: Prisma.InputJsonObject;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: params.action,
          entity: 'Auth',
          entityId: params.userId ?? null,
          description: params.description,
          userId: params.userId ?? null,
          requestId: null,
          ipAddress: params.context.ipAddress ?? null,
          userAgent: params.context.userAgent ?? null,
          method: 'POST',
          path: '/api/auth',
          statusCode: params.statusCode,
          metadata: params.metadata,
        },
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to write security audit log:', error);
      }
    }
  }

  private mapUserResponse(user: {
    id: string;
    email: string;
    displayName: string;
    phone?: string | null;
    avatarUrl?: string | null;
    mustChangePassword?: boolean | null;
    scopeLevel?: 'GLOBAL' | 'COMPANY' | 'BRANCH' | null;
    scopedCompanyId?: string | null;
    scopedBranchId?: string | null;
    scopedCompany?: { id: string; code: string; nameTh: string } | null;
    scopedBranch?: { id: string; code: string; nameTh: string } | null;
    roles: {
      role: {
        code: string;
        name?: string;
        isActive: boolean;
        permissions: {
          permission: {
            code: string;
            isActive: boolean;
          };
        }[];
      };
    }[];
  }) {
    const roles = user.roles
      .filter((userRole) => userRole.role.isActive)
      .map((userRole) => userRole.role.code);

    const permissions = Array.from(
      new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions
            .filter((rolePermission) => rolePermission.permission.isActive)
            .map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    );

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      roles,
      permissions,
      // ให้ guard และหน้าเว็บรู้ว่าต้องบังคับเปลี่ยนรหัสก่อนใช้งาน
      mustChangePassword: user.mustChangePassword ?? false,
      scope: {
        level: user.scopeLevel ?? 'BRANCH',
        companyId: user.scopedCompanyId ?? null,
        branchId: user.scopedBranchId ?? null,
        companyName: user.scopedCompany?.nameTh ?? null,
        branchName: user.scopedBranch?.nameTh ?? null,
      },
    };
  }
  /**
   * เปลี่ยนรหัสผ่านของตัวเอง
   * =======================
   * เดิมไม่มีทางนี้เลย — ผู้ใช้ต้องรบกวนผู้ดูแลให้รีเซ็ตให้ทุกครั้ง
   * แปลว่าผู้ดูแลรู้รหัสผ่านของทุกคนอยู่ตลอด ซึ่งไม่ควรเป็นแบบนั้น
   *
   * ต้องยืนยันรหัสเดิมก่อนเสมอ และเมื่อเปลี่ยนสำเร็จจะปลดธง mustChangePassword
   * พร้อมเพิกถอน session อื่นทิ้ง เผื่อรหัสเดิมรั่วไปแล้ว
   */
  async changeOwnPassword(userId: string, dto: ChangeOwnPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('ไม่พบบัญชีผู้ใช้');
    }

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!currentMatches) {
      throw new BadRequestException('รหัสผ่านเดิมไม่ถูกต้อง');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    }

    this.assertStrongPassword(dto.newPassword, user);

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: AuditAction.UPDATE,
          entity: 'User',
          entityId: userId,
          description: 'เปลี่ยนรหัสผ่านด้วยตนเอง',
        },
      }),
    ]);

    return { success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อย' };
  }

  /**
   * กฎรหัสผ่าน — ต้องตรงกับที่ใช้ตอนผู้ดูแลตั้ง/รีเซ็ตให้ (users.service)
   * ถ้าสองที่ไม่ตรงกัน จะเกิดกรณีตั้งได้ทางหนึ่งแต่อีกทางปฏิเสธ
   */
  private assertStrongPassword(
    password: string,
    identity: {
      email?: string | null;
      displayName?: string | null;
      employee?: {
        employeeCode?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      } | null;
    },
  ) {
    if (password !== password.trim() || /\s/.test(password)) {
      throw new BadRequestException('รหัสผ่านต้องไม่มีช่องว่าง');
    }

    const rules = [
      { valid: password.length >= 10, message: 'ต้องมีอย่างน้อย 10 ตัวอักษร' },
      { valid: password.length <= 128, message: 'ต้องไม่เกิน 128 ตัวอักษร' },
      { valid: /[a-z]/.test(password), message: 'ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว' },
      { valid: /[A-Z]/.test(password), message: 'ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว' },
      { valid: /\d/.test(password), message: 'ต้องมีตัวเลขอย่างน้อย 1 ตัว' },
      // ไม่บังคับอักขระพิเศษ (ลูกค้าขอ 2569-09-11) — พนักงานหน้างานพิมพ์บนมือถือลำบาก
    ];

    const failed = rules.find((rule) => !rule.valid);

    if (failed) {
      throw new BadRequestException(`รหัสผ่านไม่ปลอดภัย: ${failed.message}`);
    }

    const lower = password.toLowerCase();
    const forbidden = [
      'password',
      'admin',
      'employee',
      'qwerty',
      '123456',
      identity.email?.split('@')[0],
      identity.displayName,
      identity.employee?.employeeCode,
      identity.employee?.firstName,
      identity.employee?.lastName,
    ]
      .map((part) => part?.trim().toLowerCase())
      .filter((part): part is string => Boolean(part && part.length >= 4));

    if (forbidden.some((part) => lower.includes(part))) {
      throw new BadRequestException(
        'รหัสผ่านต้องไม่มีคำที่เดาง่ายหรือข้อมูลส่วนตัวของผู้ใช้',
      );
    }
  }

}
