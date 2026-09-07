import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import {
  MobilePushPreferenceService,
  resolvePushCategory,
} from './mobile-push-preference.service';
import {
  NotificationsService,
  type NotificationPushPayload,
} from '../../notifications/notifications.service';

/**
 * BE-2 — ส่ง push ผ่าน Expo Push API
 *
 * ทำไมไม่ใช้ FCM/APNs ตรง: Expo Push เป็นตัวกลางที่รับ token เดียวแล้วส่งได้
 * ทั้งสองแพลตฟอร์ม ไม่ต้องเก็บ service account key ของ Google และ .p8 ของ Apple
 * ไว้บนเซิร์ฟเวอร์ ซึ่งเป็นความลับที่ต้องดูแลเพิ่มโดยไม่ได้อะไรตอบแทน
 * ตราบใดที่แอปยัง build ด้วย EAS
 *
 * หลักที่ยึด: **push เป็นของเสริม ห้ามทำให้ธุรกรรมหลักล้ม**
 * การแจ้งเตือนตัวจริงถูกบันทึกลงตารางไปแล้วก่อนถึงที่นี่ ผู้ใช้เปิดแอปก็เห็น
 * ต่อให้ push ส่งไม่ออกทั้งหมด ระบบก็ยังถูกต้อง
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo รับได้ 100 ข้อความต่อหนึ่งคำขอ */
const CHUNK_SIZE = 100;

const REQUEST_TIMEOUT_MS = 10_000;

type ExpoTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

/** entityType จาก NotificationsService → เส้นทางในแอป ใช้ทำ deep link */
const DEEP_LINK_BY_ENTITY: Record<string, string> = {
  LeaveRequest: 'LEAVE',
  OffsiteWorkRequest: 'OFFSITE',
  OvertimeRequest: 'OVERTIME',
  TimeAdjustRequest: 'TIME_ADJUST',
};

@Injectable()
export class MobilePushService implements OnModuleInit {
  private readonly logger = new Logger(MobilePushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly preferences: MobilePushPreferenceService,
  ) {}

  onModuleInit() {
    this.notifications.setPushDispatcher((payload) => this.dispatch(payload));
  }

  async dispatch(payload: NotificationPushPayload): Promise<void> {
    if (payload.userIds.length === 0) {
      return;
    }

    /*
     * ตัดคนที่ปิดหมวดนี้ไว้ออกก่อนถามหาเครื่อง
     *
     * กรองที่ "คน" ไม่ใช่ที่ "เครื่อง" เพราะค่านี้เป็นของบัญชี — ผู้ใช้ที่ปิด
     * แจ้งเตือนอนุมัติแล้วไปลงชื่อในเครื่องที่สอง ต้องไม่มีอะไรเด้งที่นั่นด้วย
     */
    const category = resolvePushCategory(payload.type, payload.entityType);
    const userIds = await this.preferences.allowedUserIds(
      payload.userIds,
      category,
    );

    if (userIds.length === 0) {
      return;
    }

    const devices = await this.prisma.mobileDevice.findMany({
      select: { expoPushToken: true, id: true },
      where: {
        expoPushToken: { not: null },
        notificationPermission: 'GRANTED',
        /* เครื่องที่ถูกถอนสิทธิ์แล้วต้องไม่ได้รับแจ้งเตือนอีก */
        revokedAt: null,
        userId: { in: userIds },
      },
    });

    if (devices.length === 0) {
      return;
    }

    const messages = devices.map((device) => ({
      body: payload.message,
      /* data ต้องเล็ก — Expo จำกัดทั้งข้อความไว้ราว 4KB */
      data: {
        entityId: payload.entityId,
        entityType: payload.entityType,
        notificationType: payload.type,
        /* เก็บ requestType เดิมไว้หนึ่งช่วง release เพื่อ backward compatibility */
        requestType: DEEP_LINK_BY_ENTITY[payload.entityType] ?? null,
      },
      sound: 'default' as const,
      title: payload.title,
      to: device.expoPushToken as string,
    }));

    const tokenByIndex = devices.map((device) => ({
      id: device.id,
      token: device.expoPushToken as string,
    }));

    for (let start = 0; start < messages.length; start += CHUNK_SIZE) {
      const chunk = messages.slice(start, start + CHUNK_SIZE);
      const tickets = await this.send(chunk);

      await this.handleTickets(
        tickets,
        tokenByIndex.slice(start, start + CHUNK_SIZE),
      );
    }
  }

  private async send(messages: unknown[]): Promise<ExpoTicket[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        body: JSON.stringify(messages),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Expo Push ตอบ ${response.status}`);
        return [];
      }

      const body = (await response.json()) as { data?: ExpoTicket[] };

      return body.data ?? [];
    } catch (error) {
      /* เน็ตล่มหรือ Expo ล่ม — ไม่ retry เพราะแจ้งเตือนในแอปมีอยู่แล้ว */
      this.logger.warn(
        `ยิง Expo Push ไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * ล้าง token ที่ Expo บอกว่าใช้ไม่ได้แล้ว
   *
   * `DeviceNotRegistered` = ผู้ใช้ถอนแอปหรือปิดแจ้งเตือน ถ้าไม่ล้างทิ้ง
   * ทุกครั้งที่มีแจ้งเตือนจะยิงไปที่ token ตายซ้ำ ๆ จนโดน Expo จำกัดอัตรา
   * แล้วกระทบคนที่ยังใช้งานอยู่จริง
   */
  private async handleTickets(
    tickets: ExpoTicket[],
    devices: { id: string; token: string }[],
  ) {
    const deadDeviceIds = tickets
      .map((ticket, index) =>
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
          ? devices[index]?.id
          : null,
      )
      .filter((id): id is string => Boolean(id));

    if (deadDeviceIds.length === 0) {
      return;
    }

    await this.prisma.mobileDevice.updateMany({
      data: { expoPushToken: null, pushStatus: 'UNKNOWN' },
      where: { id: { in: deadDeviceIds } },
    });

    this.logger.log(`ล้าง push token ที่ใช้ไม่ได้ ${deadDeviceIds.length} เครื่อง`);
  }
}
