import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { captureEvent } from '@/lib/monitoring/monitoring';

import { isPushSupported, loadNotifications } from './push-runtime';

/**
 * Push notification
 *
 * กติกาจากบทที่ 15.4: **ขอสิทธิ์แบบมีบริบท ห้ามเด้งขอทันทีที่เปิดแอปครั้งแรก**
 * ผู้ใช้ที่โดนถามก่อนรู้ว่าแอปทำอะไรจะกด "ไม่อนุญาต" แล้วเปลี่ยนใจยาก
 * เพราะต้องไปเปิดเองในตั้งค่าเครื่อง — ฟังก์ชันที่นี่จึงถูกเรียกจากปุ่ม
 * ที่ผู้ใช้กดเอง ไม่ใช่จากตอน bootstrap
 *
 * ไฟล์นี้ import ได้เสมอแม้บน Expo Go ที่ไม่รองรับ push
 * (ดูเหตุผลใน push-runtime.ts) — ทุกฟังก์ชันคืน UNSUPPORTED แทนการพัง
 */

export type PushPermission =
  | 'GRANTED'
  | 'DENIED'
  | 'UNDETERMINED'
  /** เครื่องหรือสภาพแวดล้อมนี้ใช้ push ไม่ได้ เช่น Expo Go หรือ emulator */
  | 'UNSUPPORTED';

function toPermission(status: string): PushPermission {
  if (status === 'granted') return 'GRANTED';
  if (status === 'denied') return 'DENIED';

  return 'UNDETERMINED';
}

type NotificationsApi = NonNullable<Awaited<ReturnType<typeof loadNotifications>>>;

/**
 * เหตุผลจริงของครั้งล่าสุดที่ลงทะเบียน push ไม่สำเร็จ
 *
 * เก็บไว้เพราะทุก error ที่นี่ถูกกลืนแล้วคืน `UNSUPPORTED` เหมือนกันหมด จอตั้งค่า
 * จึงขึ้นว่า "ต้องใช้แอปที่ติดตั้งจริง" ทั้งที่ผู้ใช้ใช้แอปที่ติดตั้งจริงอยู่ —
 * เคยทำให้ push ตายเงียบทั้งระบบโดยไม่มีใครเห็นสาเหตุ (FCM ยังไม่ได้ตั้งค่า
 * Firebase จึง init ไม่ขึ้น แล้ว `getExpoPushTokenAsync` โยนออกมา)
 */
let lastFailure: string | null = null;

/** ข้อความจริงจากครั้งล่าสุดที่ลงทะเบียน push ไม่สำเร็จ */
export function getPushFailureReason(): string | null {
  return lastFailure;
}

/**
 * ขอ token จาก Expo แล้วส่งขึ้น backend
 *
 * แยกออกมาเพราะมีสองทางเข้าที่ต้องทำขั้นตอนนี้เหมือนกันเป๊ะ — ตอนผู้ใช้กดเปิดเอง
 * และตอนแอปซิงก์เงียบ ๆ ตอนเข้าใช้งาน (token ผูกกับการติดตั้ง ลงแอปใหม่ทีได้ตัวใหม่ที
 * ถ้าไม่ยิงซ้ำ เครื่องนั้นจะไม่มี token ที่ใช้ได้อยู่บนเซิร์ฟเวอร์เลย)
 */
async function registerToken(notifications: NotificationsApi) {
  /*
   * Android ต้องมี channel ก่อน ไม่งั้นแจ้งเตือนจะเงียบและไม่มีไอคอน
   * ต้องสร้างก่อนขอ token เสมอ
   */
  if (Platform.OS === 'android') {
    await notifications.setNotificationChannelAsync('default', {
      importance: notifications.AndroidImportance.DEFAULT,
      name: 'การแจ้งเตือนทั่วไป',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  /*
   * projectId จำเป็นสำหรับ Expo Push บน build จริง
   * ถ้ายังไม่ได้ eas init จะขอ token ไม่ผ่านและโยน error ซึ่งถูกจับด้านนอก
   */
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const token = await notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  await sendToken(token.data, 'GRANTED');

  lastFailure = null;
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!isPushSupported || !Device.isDevice) {
    return 'UNSUPPORTED';
  }

  const notifications = await loadNotifications();

  if (!notifications) {
    return 'UNSUPPORTED';
  }

  const { status } = await notifications.getPermissionsAsync();

  return toPermission(status);
}

/**
 * ขอสิทธิ์แล้วส่ง token ขึ้น backend
 *
 * คืนสถานะเสมอ ไม่ throw — ผู้ใช้ปฏิเสธการแจ้งเตือนไม่ใช่ความผิดพลาด
 * และห้ามทำให้จอที่เรียกมาพัง
 */
export async function enablePush(): Promise<PushPermission> {
  try {
    if (!isPushSupported || !Device.isDevice) {
      return 'UNSUPPORTED';
    }

    const notifications = await loadNotifications();

    if (!notifications) {
      return 'UNSUPPORTED';
    }

    const existing = await notifications.getPermissionsAsync();
    const status =
      existing.status === 'granted'
        ? existing
        : await notifications.requestPermissionsAsync();

    if (status.status !== 'granted') {
      await sendToken(null, toPermission(status.status));

      return toPermission(status.status);
    }

    await registerToken(notifications);

    return 'GRANTED';
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);

    captureEvent({
      context: { error, scope: 'notifications.push' },
      level: 'warning',
      message: 'เปิดการแจ้งเตือนไม่สำเร็จ',
    });

    return 'UNSUPPORTED';
  }
}

/**
 * ซิงก์ token ของเครื่องนี้ขึ้น backend เมื่อสิทธิ์เปิดอยู่แล้ว
 *
 * เรียกตอนเข้าแอปทุกครั้ง ไม่ต้องรอผู้ใช้กดอะไร — `enablePush` เป็นทางเดียวที่
 * ส่ง token ขึ้นเซิร์ฟเวอร์ แต่มันถูกเรียกจากปุ่มในจอตั้งค่าที่กดได้เฉพาะตอน
 * สิทธิ์ยังเป็น UNDETERMINED เท่านั้น คนที่เครื่องอนุญาตอยู่แล้ว (ลงทับของเดิม
 * หรือไปกดเปิดจากตั้งค่าเครื่อง) จึงไม่มีทางลงทะเบียนได้เลย และไม่ได้รับ push
 * ทั้งที่ทุกอย่างขึ้นว่าเปิดอยู่
 *
 * **ห้ามขอสิทธิ์ที่นี่** — กติกาบทที่ 15.4 คือถามเมื่อผู้ใช้กดเอง ที่นี่ทำงาน
 * ต่อจากคำตอบเดิมเท่านั้น
 */
export async function syncPushRegistration(): Promise<void> {
  try {
    if (!isPushSupported || !Device.isDevice) {
      return;
    }

    const notifications = await loadNotifications();

    if (!notifications) {
      return;
    }

    const { status } = await notifications.getPermissionsAsync();

    if (status !== 'granted') {
      return;
    }

    await registerToken(notifications);
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);

    captureEvent({
      context: { error, scope: 'notifications.push' },
      level: 'warning',
      message: 'ซิงก์ push token ไม่สำเร็จ',
    });
  }
}

/**
 * ถอน token ตอนออกจากระบบ
 *
 * สำคัญมากบนเครื่องที่ใช้ร่วมกัน — ถ้าไม่ถอน คนถัดไปที่ล็อกอินจะได้รับ
 * แจ้งเตือนของคนก่อนหน้า ซึ่งอาจมีชื่อพนักงานและเรื่องที่ยื่นติดไปด้วย
 */
export async function disablePush(): Promise<void> {
  if (!isPushSupported) {
    return;
  }

  try {
    await sendToken(null, 'UNDETERMINED');
  } catch {
    /* ออกจากระบบต้องสำเร็จเสมอ แม้ถอน token ไม่ผ่าน */
  }
}

async function sendToken(
  expoPushToken: string | null,
  notificationPermission: PushPermission,
) {
  try {
    await apiClient.patch('/mobile/v1/devices/current', {
      expoPushToken: expoPushToken ?? '',
      /* backend รับเฉพาะ UNKNOWN | GRANTED | DENIED | UNDETERMINED */
      notificationPermission:
        notificationPermission === 'UNSUPPORTED'
          ? 'UNKNOWN'
          : notificationPermission,
    });
  } catch (error) {
    captureEvent({
      context: { code: error instanceof ApiError ? error.code : 'UNKNOWN' },
      level: 'warning',
      message: 'push_token_sync_failed',
    });
  }
}
