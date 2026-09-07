import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { getEnvironmentConfig } from './env';

const expoVersion = Constants.expoConfig?.version ?? '0.0.0';

export const appDefaults = {
  apiTimeoutMs: 15_000,
  bootstrapStaleTimeMs: 60_000,
  queryGarbageCollectionMs: 30 * 60_000,
  /** หน้าวันนี้เปลี่ยนบ่อยกว่าอย่างอื่นมาก (ตารางบทที่ 10.6) */
  todayStaleTimeMs: 30_000,
} as const;

/** Backend รับเฉพาะ android | ios — เว็บใช้ได้แค่ตอน dev */
export type MobilePlatform = 'android' | 'ios';

function resolvePlatform(): MobilePlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * build number ของ native binary
 * iOS เก็บเป็น string ส่วน Android เป็นตัวเลข จึงต้องรวบเป็น number ก่อนส่ง header
 * ค่า null = รันบน Expo Go/เว็บ ซึ่ง backend จะไม่บังคับเวอร์ชัน
 */
function resolveAppBuild(): number | null {
  const raw = Application.nativeBuildVersion;

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(String(raw), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Bangkok';
  } catch {
    return 'Asia/Bangkok';
  }
}

export function getAppConfig() {
  const environment = getEnvironmentConfig();

  return {
    apiBaseUrl: environment.apiBaseUrl,
    appBuild: resolveAppBuild(),
    appEnvironment: environment.appEnvironment,
    appName:
      Application.applicationName ??
      Constants.expoConfig?.name ??
      'HR-TJC GROUP',
    appVersion: Application.nativeApplicationVersion ?? expoVersion,
    deviceModel: Device.modelName ?? null,
    deviceName: Device.deviceName ?? null,
    locale: 'th-TH',
    osVersion: Device.osVersion ?? String(Platform.Version),
    platform: resolvePlatform(),
    timezone: resolveTimezone(),
  } as const;
}
