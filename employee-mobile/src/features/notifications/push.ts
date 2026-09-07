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

    const existing = await notifications.getPermissionsAsync();
    const status =
      existing.status === 'granted'
        ? existing
        : await notifications.requestPermissionsAsync();

    if (status.status !== 'granted') {
      await sendToken(null, toPermission(status.status));

      return toPermission(status.status);
    }

    /*
     * projectId จำเป็นสำหรับ Expo Push บน build จริง
     * ถ้ายังไม่ได้ eas init จะขอ token ไม่ผ่านและโยน error ซึ่งถูกจับด้านล่าง
     */
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const token = await notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await sendToken(token.data, 'GRANTED');

    return 'GRANTED';
  } catch (error) {
    captureEvent({
      context: { error, scope: 'notifications.push' },
      level: 'warning',
      message: 'เปิดการแจ้งเตือนไม่สำเร็จ',
    });

    return 'UNSUPPORTED';
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
