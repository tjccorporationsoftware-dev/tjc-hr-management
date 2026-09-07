import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  MOBILE_COMPATIBILITY_DEFAULTS,
  MOBILE_ERROR_CODES,
} from '../mobile.constants';
import type {
  MobileClientContext,
  MobileCompatibility,
} from '../types/mobile-context.types';

/**
 * BE-MOB-006 (บางส่วน) — นโยบายเวอร์ชันแอป
 *
 * เก็บที่ env ไม่ใช่ตารางใหม่ เพราะเป็นค่าระดับระบบที่เปลี่ยนพร้อม release
 * ถ้าอนาคตต้องแยกตามบริษัท ค่อยย้ายไป SystemSetting เดิม (ห้ามสร้างตาราง flag ใหม่)
 */
@Injectable()
export class MobileCompatibilityService {
  constructor(private readonly configService: ConfigService) {}

  resolve(client: MobileClientContext): MobileCompatibility {
    const minimumBuild = this.getBuild(
      'MOBILE_MINIMUM_BUILD',
      MOBILE_COMPATIBILITY_DEFAULTS.minimumBuild,
    );
    const latestBuild = Math.max(
      minimumBuild,
      this.getBuild(
        'MOBILE_LATEST_BUILD',
        MOBILE_COMPATIBILITY_DEFAULTS.latestBuild,
      ),
    );

    // ไม่ส่ง build มา = ยังบังคับไม่ได้ ให้ผ่านไปก่อนแล้วให้ client เตือนตัวเอง
    const currentBuild = client.appBuild;

    return {
      latestBuild,
      minimumBuild,
      storeUrl: this.getStoreUrl(client),
      updateRecommended: currentBuild !== null && currentBuild < latestBuild,
      updateRequired: currentBuild !== null && currentBuild < minimumBuild,
    };
  }

  /**
   * บังคับใช้กับ endpoint ที่ "เขียนข้อมูล" เท่านั้น
   * endpoint อ่านอย่าง bootstrap ต้องผ่านได้เสมอ ไม่อย่างนั้นแอปเก่าจะไม่มีทางรู้ว่าต้องอัปเดต
   */
  assertSupported(client: MobileClientContext) {
    const compatibility = this.resolve(client);

    if (compatibility.updateRequired) {
      throw new ForbiddenException({
        code: MOBILE_ERROR_CODES.appUpdateRequired,
        message: 'กรุณาอัปเดตแอปเป็นเวอร์ชันล่าสุดก่อนใช้งาน',
        details: {
          currentBuild: client.appBuild,
          minimumBuild: compatibility.minimumBuild,
          storeUrl: compatibility.storeUrl,
        },
      });
    }

    return compatibility;
  }

  private getBuild(key: string, fallback: number) {
    const parsed = Number.parseInt(
      this.configService.get<string>(key, String(fallback)),
      10,
    );

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private getStoreUrl(client: MobileClientContext) {
    if (client.platform === 'ios') {
      return this.configService.get<string>('MOBILE_IOS_STORE_URL') ?? null;
    }

    if (client.platform === 'android') {
      return this.configService.get<string>('MOBILE_ANDROID_STORE_URL') ?? null;
    }

    return null;
  }
}
