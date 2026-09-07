import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { Audit } from '../../../common/decorators/audit.decorator';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../../common/guards/rate-limit.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../generated/prisma/client';
import { MobileAuthAdapter } from '../application/mobile-auth.adapter';
import { MobileClient } from '../decorators/mobile-client.decorator';
import {
  MobileLoginDto,
  MobileLogoutDto,
  MobileRefreshDto,
  MobileVerifyTwoFactorDto,
} from '../dto/mobile-auth.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * BE-MOB-001 — Mobile Auth endpoints
 *
 * ต่างจากเว็บแค่ "ช่องทางส่ง refresh token" (body แทน HttpOnly cookie)
 * นโยบายอื่นใช้ AuthService เดิมทั้งหมด และไม่แตะ cookie flow ของเว็บเลย
 */
@Controller(`${MOBILE_API_PREFIX}/auth`)
export class MobileAuthController {
  constructor(private readonly authAdapter: MobileAuthAdapter) {}

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'mobile:auth:login',
    limit: 10,
    windowSeconds: 60,
    includeEmail: true,
    message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @Audit({
    action: AuditAction.LOGIN,
    entity: 'Auth',
    description: 'Mobile login',
  })
  async login(
    @Body() dto: MobileLoginDto,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.authAdapter.login(dto, client);
  }

  @Post('2fa/verify')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'mobile:auth:2fa',
    limit: 10,
    windowSeconds: 300,
    includeTwoFactorToken: true,
    message: 'ยืนยัน 2FA บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  async verifyTwoFactor(
    @Body() dto: MobileVerifyTwoFactorDto,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.authAdapter.verifyTwoFactor(dto, client);
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'mobile:auth:refresh',
    limit: 120,
    windowSeconds: 60,
    message: 'Refresh session บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  async refresh(
    @Body() dto: MobileRefreshDto,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.authAdapter.refresh(dto, client);
  }

  @Post('logout')
  @Auth()
  @Audit({
    action: AuditAction.LOGOUT,
    entity: 'Auth',
    description: 'Mobile logout',
  })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileLogoutDto,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.authAdapter.logout(user.id, dto, client);
  }
}
