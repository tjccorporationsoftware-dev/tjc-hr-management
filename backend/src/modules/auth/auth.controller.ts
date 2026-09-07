import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../common/interfaces/authenticated-user.interface';
import { AuditAction } from '../../generated/prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { ChangeOwnPasswordDto } from './dto/change-password.dto';
import { AllowWhenPasswordExpired } from '../../common/decorators/allow-when-password-expired.decorator';

import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

const REFRESH_COOKIE_NAME = 'hr_refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'auth:login',
    limit: 10,
    windowSeconds: 60,
    includeEmail: true,
    message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @Audit({
    action: AuditAction.LOGIN,
    entity: 'Auth',
    description: 'User login',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, {
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    if (result.requiresTwoFactor) {
      return result;
    }

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );

    return {
      requiresTwoFactor: false,
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      user: result.user,
    };
  }

  @Post('2fa/verify')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'auth:2fa',
    limit: 10,
    windowSeconds: 300,
    // นับแยกตาม token ที่ออกให้แต่ละครั้ง = จำกัดการเดารหัส 10 ครั้งต่อ 1 รหัส
    // ซึ่งเป็นสิ่งที่ต้องการจริง ๆ ถ้านับตาม IP อย่างเดียว ออฟฟิศที่ออกเน็ตทางไอพี
    // เดียวกันจะยืนยัน 2FA ได้แค่ 10 คนต่อ 5 นาทีทั้งบริษัท
    // การขอ token ใหม่ยังติดลิมิตของ /auth/login (10 ครั้ง/นาที ต่อ IP+อีเมล) อยู่
    includeTwoFactorToken: true,
    message: 'ยืนยัน 2FA บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  async verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyTwoFactor(dto, {
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );

    return {
      requiresTwoFactor: false,
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      user: result.user,
    };
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'auth:refresh',
    limit: 120,
    windowSeconds: 60,
    message: 'Refresh session บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  async refresh(
    @Body('refreshToken') bodyRefreshToken: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieRefreshToken = request.cookies?.[REFRESH_COOKIE_NAME];

    if (process.env.NODE_ENV === 'production' && bodyRefreshToken) {
      throw new BadRequestException(
        'ไม่อนุญาตให้ส่ง Refresh Token ผ่าน request body ใน production',
      );
    }

    const refreshToken = cookieRefreshToken ?? bodyRefreshToken;

    const result = await this.authService.refresh(refreshToken);

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );

    return {
      requiresTwoFactor: false,
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      user: result.user,
    };
  }

  @Get('sessions')
  @Auth()
  async getMySessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMySessions(user.id);
  }

  @Post('sessions/revoke-others')
  @Auth()
  async revokeOtherSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ) {
    const cookieRefreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
    return this.authService.revokeOtherSessions(user.id, cookieRefreshToken);
  }

  @Delete('sessions/:sessionId')
  @Auth()
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  @Post('logout')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'auth:logout',
    limit: 60,
    windowSeconds: 60,
    includePath: true,
    message: 'ออกจากระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @Audit({
    action: AuditAction.LOGOUT,
    entity: 'Auth',
    description: 'User logout',
  })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Body('refreshToken') bodyRefreshToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieRefreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
    const refreshToken = cookieRefreshToken ?? bodyRefreshToken;

    const result = await this.authService.logout(refreshToken);

    this.clearRefreshCookie(response);

    return result;
  }

  /**
   * เปลี่ยนรหัสผ่านของตัวเอง — ต้องไม่ติด guard บังคับเปลี่ยนรหัส
   * ไม่งั้นคนที่ถูกบังคับให้เปลี่ยนจะเข้ามาเปลี่ยนไม่ได้เลย
   */
  @Post('change-password')
  @Auth()
  @AllowWhenPasswordExpired()
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'User',
    description: 'เปลี่ยนรหัสผ่านด้วยตนเอง',
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeOwnPasswordDto,
  ) {
    return this.authService.changeOwnPassword(user.id, dto);
  }

  @Get('me')
  @Auth()
  @AllowWhenPasswordExpired()
  async me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('permission-test')
  @Auth('ORG_READ')
  async permissionTest(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: 'คุณมีสิทธิ์ ORG_READ',
      user,
    };
  }

  /**
   * ตั้ง `secure` ให้ cookie ของ refresh token
   *
   * ผูกกับ `NODE_ENV === 'production'` ตรง ๆ ไม่พอ เพราะ staging หรือเครื่องที่
   * ลืมตั้ง NODE_ENV จะส่ง refresh token ผ่าน HTTP แบบไม่เข้ารหัส
   * จึงเปิด secure เมื่อ "ไม่ใช่ development" และให้ override ได้ด้วย
   * COOKIE_SECURE เผื่อกรณีทดสอบบน http ที่ไม่ใช่ localhost
   */
  private isSecureCookie() {
    const override = process.env.COOKIE_SECURE;

    if (override === 'true') return true;
    if (override === 'false') return false;

    return process.env.NODE_ENV !== 'development';
  }

  private setRefreshCookie(
    response: Response,
    refreshToken: string,
    expiresAt: Date,
  ) {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: this.isSecureCookie(),
      sameSite: 'lax',
      path: '/api/auth',
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.isSecureCookie(),
      sameSite: 'lax',
      path: '/api/auth',
    });
  }

  private getClientIp(request: AuthenticatedRequest) {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() ?? null;
    }

    return request.ip ?? null;
  }
}
