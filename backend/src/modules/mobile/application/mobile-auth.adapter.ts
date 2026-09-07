import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from '../../auth/auth.service';
import type {
  MobileLoginDto,
  MobileLogoutDto,
  MobileRefreshDto,
  MobileVerifyTwoFactorDto,
} from '../dto/mobile-auth.dto';
import type { MobileInstallationDto } from '../dto/mobile-installation.dto';
import type { MobileClientContext } from '../types/mobile-context.types';
import { MobileDeviceService } from './mobile-device.service';

type AuthenticatedResult = {
  accessToken: string;
  refreshExpiresAt: Date;
  refreshToken: string;
  sessionId: string;
  user: {
    displayName: string;
    email: string;
    id: string;
    /*
     * แอปต้องรู้ตั้งแต่ตอนล็อกอินว่าต้องบังคับเปลี่ยนรหัสก่อนใช้งานไหม
     * ไม่งั้นพนักงานที่ HR เพิ่งสร้างบัญชีให้จะใช้รหัสชั่วคราวได้ตลอดไป
     * (AuthService.mapUserResponse ใส่ค่านี้มาให้อยู่แล้ว แค่ไม่เคยประกาศไว้ที่นี่)
     */
    mustChangePassword?: boolean;
  };
};

/**
 * BE-MOB-001 — Mobile Authentication Adapter
 *
 * เป็น "ตัวแปลง transport" ล้วน ๆ ไม่มีตรรกะ auth ของตัวเอง
 *   เว็บ:   AuthService -> HttpOnly Cookie
 *   มือถือ: AuthService -> refreshToken ใน response body -> SecureStore
 *
 * นโยบาย session, rotation, lock, 2FA และ revoke ใช้ของเดิมทั้งหมด
 */
@Injectable()
export class MobileAuthAdapter {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly deviceService: MobileDeviceService,
  ) {}

  async login(dto: MobileLoginDto, client: MobileClientContext) {
    const result = await this.authService.login(
      { email: dto.email, password: dto.password },
      this.toRequestContext(client, dto.installation),
    );

    if (result.requiresTwoFactor) {
      return this.toTwoFactorChallenge(result);
    }

    return this.finalizeSession(result, dto.installation, client);
  }

  async verifyTwoFactor(
    dto: MobileVerifyTwoFactorDto,
    client: MobileClientContext,
  ) {
    const result = await this.authService.verifyTwoFactor(
      { twoFactorToken: dto.twoFactorToken, code: dto.code },
      this.toRequestContext(client, dto.installation),
    );

    return this.finalizeSession(result, dto.installation, client);
  }

  async refresh(dto: MobileRefreshDto, client: MobileClientContext) {
    // installationId ใน body ต้องตรงกับ header ถ้าส่งมาทั้งคู่ — กันการสลับเครื่องกลางทาง
    if (
      client.installationId &&
      client.installationId !== dto.installationId
    ) {
      throw new UnauthorizedException('รหัสเครื่องไม่ตรงกับคำขอ');
    }

    const result = await this.authService.refresh(dto.refreshToken, {
      expectedInstallationId: dto.installationId,
    });

    return {
      requiresTwoFactor: false as const,
      ...this.toTokenPayload(result),
      session: {
        id: result.sessionId,
        installationId: dto.installationId,
      },
      user: result.user,
    };
  }

  async logout(
    userId: string,
    dto: MobileLogoutDto,
    client: MobileClientContext,
  ) {
    const result = await this.authService.logout(dto.refreshToken);

    const installationId = dto.installationId ?? client.installationId;

    if (installationId) {
      await this.deviceService.unbindPushToken(userId, installationId);
    }

    return result;
  }

  private async finalizeSession(
    result: AuthenticatedResult,
    installation: MobileInstallationDto,
    client: MobileClientContext,
  ) {
    await this.deviceService.touchFromAuth(result.user.id, installation, client);

    return {
      requiresTwoFactor: false as const,
      ...this.toTokenPayload(result),
      session: {
        id: result.sessionId,
        installationId: installation.installationId,
      },
      user: result.user,
    };
  }

  private toTokenPayload(result: {
    accessToken: string;
    refreshExpiresAt: Date;
    refreshToken: string;
  }) {
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: this.readAccessTokenExpiry(result.accessToken),
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshExpiresAt,
      tokenType: 'Bearer' as const,
    };
  }

  private toTwoFactorChallenge(result: {
    debugTwoFactorCode?: string;
    expiresAt: Date;
    twoFactorToken: string;
  }) {
    return {
      requiresTwoFactor: true as const,
      twoFactorToken: result.twoFactorToken,
      expiresAt: result.expiresAt,
      // BE-MOB-002: ห้ามคืนรหัสจริงบน production เด็ดขาด แม้ service ฝั่งล่างจะเผลอส่งมา
      ...(this.isProduction() || !result.debugTwoFactorCode
        ? {}
        : { debugTwoFactorCode: result.debugTwoFactorCode }),
    };
  }

  /**
   * อ่านวันหมดอายุจากตัว token เอง แทนการคำนวณซ้ำจาก config
   * ถ้าคำนวณซ้ำแล้วสูตรเพี้ยนไปจากที่เซ็นจริง แอปจะ refresh ผิดจังหวะ
   */
  private readAccessTokenExpiry(accessToken: string): Date | null {
    const decoded = this.jwtService.decode(accessToken) as {
      exp?: number;
    } | null;

    return decoded?.exp ? new Date(decoded.exp * 1000) : null;
  }

  private toRequestContext(
    client: MobileClientContext,
    installation: MobileInstallationDto,
  ) {
    return {
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      device: {
        installationId: installation.installationId,
        platform: installation.platform,
        appVersion: installation.appVersion ?? client.appVersion,
        appBuild: installation.appBuild ?? client.appBuild,
        sessionType: 'MOBILE' as const,
      },
    };
  }

  private isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
