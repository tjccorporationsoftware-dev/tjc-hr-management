import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { AuthService } from '../../auth/auth.service';
import type {
  MobileRegisterDeviceDto,
  MobileUpdateCurrentDeviceDto,
} from '../dto/mobile-device.dto';
import type { MobileInstallationDto } from '../dto/mobile-installation.dto';
import { MOBILE_ERROR_CODES } from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';

type DeviceRecord = {
  appBuild: number | null;
  appVersion: string | null;
  createdAt: Date;
  deviceModel: string | null;
  deviceName: string | null;
  id: string;
  installationId: string;
  lastSeenAt: Date | null;
  notificationPermission: string;
  osVersion: string | null;
  platform: string;
  pushStatus: string;
  revokedAt: Date | null;
};

/**
 * BE-MOB-004 — ทะเบียนเครื่องและ Push Token
 *
 * เป็นข้อมูล MOBILE_OWNED ตัวจริง (ADR-001 ข้อ 10) จึงเข้าถึง Prisma ได้โดยตรง
 * แต่การยกเลิก session ยังต้องผ่าน AuthService เพื่อให้ session รวมศูนย์ที่เดียว
 */
@Injectable()
export class MobileDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async register(
    userId: string,
    dto: MobileRegisterDeviceDto,
    client: MobileClientContext,
  ) {
    await this.assertInstallationNotOwnedByAnotherUser(
      userId,
      dto.installation.installationId,
    );

    const device = await this.upsertInstallation(userId, dto.installation, client, {
      expoPushToken: dto.expoPushToken,
      notificationPermission: dto.notificationPermission,
    });

    return this.toResponse(device, client);
  }

  /**
   * เรียกตอน login/refresh เพื่อให้ทะเบียนเครื่องอัปเดตอยู่เสมอ
   * ไม่โยน error เพราะการลงทะเบียนเครื่องต้องไม่ทำให้ผู้ใช้ล็อกอินไม่ได้
   */
  async touchFromAuth(
    userId: string,
    installation: MobileInstallationDto,
    client: MobileClientContext,
  ) {
    try {
      const owner = await this.prisma.mobileDevice.findUnique({
        where: { installationId: installation.installationId },
        select: { userId: true },
      });

      // เครื่องเดียวกันเปลี่ยนคนใช้ = ล้าง push token เดิมทิ้งก่อน ไม่งั้นแจ้งเตือนจะไปผิดคน
      if (owner && owner.userId !== userId) {
        await this.prisma.mobileDevice.update({
          where: { installationId: installation.installationId },
          data: {
            userId,
            expoPushToken: null,
            pushStatus: 'UNKNOWN',
            notificationPermission: 'UNKNOWN',
          },
        });
      }

      await this.upsertInstallation(userId, installation, client);
    } catch {
      // เจตนากลืน error — ดูเหตุผลที่ doc comment ด้านบน
    }
  }

  async updateCurrent(
    userId: string,
    installationId: string | null,
    dto: MobileUpdateCurrentDeviceDto,
    client: MobileClientContext,
  ) {
    const device = await this.requireOwnedDevice(
      userId,
      installationId ?? client.installationId,
    );

    const updated = await this.prisma.mobileDevice.update({
      where: { id: device.id },
      data: {
        ...(dto.expoPushToken === undefined
          ? {}
          : {
              expoPushToken: dto.expoPushToken || null,
              pushStatus: dto.expoPushToken ? 'GRANTED' : 'UNKNOWN',
            }),
        ...(dto.notificationPermission === undefined
          ? {}
          : { notificationPermission: dto.notificationPermission }),
        ...(dto.locale === undefined ? {} : { locale: dto.locale }),
        ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
        lastSeenAt: new Date(),
      },
    });

    return this.toResponse(updated, client);
  }

  async list(userId: string, client: MobileClientContext) {
    const devices = await this.prisma.mobileDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      data: devices.map((device) => this.toResponse(device, client)),
      summary: { total: devices.length },
    };
  }

  /**
   * ถอนสิทธิ์เครื่อง — ล้าง push token แล้วยกเลิก session ที่ผูกกับเครื่องนั้น
   * ถอนเครื่องตัวเองได้ ผลคือถูก logout ซึ่งเป็นพฤติกรรมที่ตั้งใจ
   */
  async revoke(userId: string, deviceId: string) {
    const device = await this.prisma.mobileDevice.findFirst({
      where: { id: deviceId, userId },
      select: { id: true, installationId: true },
    });

    if (!device) {
      throw new NotFoundException('ไม่พบเครื่องที่ต้องการถอนสิทธิ์');
    }

    await this.prisma.mobileDevice.update({
      where: { id: device.id },
      data: {
        revokedAt: new Date(),
        expoPushToken: null,
        pushStatus: 'INVALID',
      },
    });

    const revokedSessions = await this.authService.revokeSessionsByInstallationId(
      userId,
      device.installationId,
    );

    return {
      revoked: true,
      deviceId: device.id,
      revokedSessionCount: revokedSessions.revokedCount,
    };
  }

  async revokeOthers(userId: string, currentInstallationId: string | null) {
    const devices = await this.prisma.mobileDevice.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentInstallationId
          ? { installationId: { not: currentInstallationId } }
          : {}),
      },
      select: { id: true, installationId: true },
    });

    let revokedSessionCount = 0;

    for (const device of devices) {
      await this.prisma.mobileDevice.update({
        where: { id: device.id },
        data: {
          revokedAt: new Date(),
          expoPushToken: null,
          pushStatus: 'INVALID',
        },
      });

      const result = await this.authService.revokeSessionsByInstallationId(
        userId,
        device.installationId,
      );

      revokedSessionCount += result.revokedCount;
    }

    return {
      revoked: true,
      revokedDeviceCount: devices.length,
      revokedSessionCount,
    };
  }

  /** เลิกผูก push token ตอน logout แต่ยังเก็บทะเบียนเครื่องไว้เพื่อให้ login ครั้งหน้าจำได้ */
  async unbindPushToken(userId: string, installationId: string) {
    await this.prisma.mobileDevice
      .updateMany({
        where: { userId, installationId },
        data: {
          expoPushToken: null,
          pushStatus: 'UNKNOWN',
          lastSeenAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  /**
   * ด่านตรวจของทุก mutation — เครื่องที่ถูกถอนสิทธิ์ต้องใช้งานต่อไม่ได้
   * ไม่ส่ง installationId มา = ผ่าน เพราะยังมีไคลเอนต์รุ่นเก่าที่ไม่ส่ง header นี้
   */
  async assertDeviceIsActive(userId: string, installationId: string | null) {
    if (!installationId) {
      return;
    }

    const device = await this.prisma.mobileDevice.findUnique({
      where: { installationId },
      select: { userId: true, revokedAt: true },
    });

    if (!device || device.userId !== userId) {
      return;
    }

    if (device.revokedAt) {
      throw new ForbiddenException({
        code: MOBILE_ERROR_CODES.deviceRevoked,
        message: 'เครื่องนี้ถูกถอนสิทธิ์แล้ว กรุณาเข้าสู่ระบบใหม่',
      });
    }
  }

  private async upsertInstallation(
    userId: string,
    installation: MobileInstallationDto,
    client: MobileClientContext,
    push?: {
      expoPushToken?: string;
      notificationPermission?: string;
    },
  ) {
    const shared = {
      platform: installation.platform,
      deviceName: installation.deviceName ?? null,
      deviceModel: installation.deviceModel ?? null,
      osVersion: installation.osVersion ?? client.osVersion,
      appVersion: installation.appVersion ?? client.appVersion,
      appBuild: installation.appBuild ?? client.appBuild,
      locale: installation.locale ?? null,
      timezone: installation.timezone ?? null,
      lastSeenAt: new Date(),
      lastIpAddress: client.ipAddress,
      lastUserAgent: client.userAgent,
      ...(push?.expoPushToken === undefined
        ? {}
        : {
            expoPushToken: push.expoPushToken || null,
            pushStatus: push.expoPushToken ? 'GRANTED' : 'UNKNOWN',
          }),
      ...(push?.notificationPermission === undefined
        ? {}
        : { notificationPermission: push.notificationPermission }),
    };

    return this.prisma.mobileDevice.upsert({
      where: { installationId: installation.installationId },
      create: {
        userId,
        installationId: installation.installationId,
        ...shared,
      },
      // ลงทะเบียนซ้ำ = เครื่องกลับมาใช้งาน จึงล้าง revokedAt ให้ด้วย
      update: { ...shared, userId, revokedAt: null },
    });
  }

  private async assertInstallationNotOwnedByAnotherUser(
    userId: string,
    installationId: string,
  ) {
    const existing = await this.prisma.mobileDevice.findUnique({
      where: { installationId },
      select: { userId: true },
    });

    if (existing && existing.userId !== userId) {
      // เครื่องเดิมเปลี่ยนมือได้ แต่ push token เดิมต้องไม่ตกไปกับเจ้าของใหม่
      await this.prisma.mobileDevice.update({
        where: { installationId },
        data: {
          expoPushToken: null,
          pushStatus: 'UNKNOWN',
          notificationPermission: 'UNKNOWN',
        },
      });
    }
  }

  private async requireOwnedDevice(
    userId: string,
    installationId: string | null,
  ) {
    if (!installationId) {
      throw new ForbiddenException({
        code: MOBILE_ERROR_CODES.installationRequired,
        message: 'ไม่พบรหัสเครื่อง กรุณาลงทะเบียนเครื่องก่อนใช้งาน',
      });
    }

    const device = await this.prisma.mobileDevice.findFirst({
      where: { installationId, userId },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException('ไม่พบเครื่องนี้ในบัญชีของคุณ');
    }

    return device;
  }

  private toResponse(device: DeviceRecord, client: MobileClientContext) {
    return {
      id: device.id,
      installationId: device.installationId,
      platform: device.platform,
      deviceName: device.deviceName,
      deviceModel: device.deviceModel,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      appBuild: device.appBuild,
      pushStatus: device.pushStatus,
      notificationPermission: device.notificationPermission,
      lastSeenAt: device.lastSeenAt,
      revokedAt: device.revokedAt,
      createdAt: device.createdAt,
      isCurrentDevice: device.installationId === client.installationId,
    };
  }
}
