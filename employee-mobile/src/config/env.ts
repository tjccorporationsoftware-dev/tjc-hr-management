import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { z } from 'zod';

import { resolveDevApiBaseUrl } from './dev-host';

const appEnvironmentSchema = z.enum(['development', 'preview', 'staging', 'production']);

/**
 * ที่อยู่ในวงแลน (RFC1918) กับ loopback — ออกนอกตึกไม่ได้
 *
 * ใช้ตัดสินว่าจะยอมให้ต่อผ่าน http ได้ไหม ไม่ได้ใช้ตัดสินเรื่องอื่น
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host.endsWith('.local')) return true;

  const parts = host.split('.').map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts as [number, number, number, number];

  if (first === 127 || first === 10) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;

  return false;
}

const environmentSchema = z
  .object({
    apiBaseUrl: z
      .string()
      .trim()
      .min(1, 'EXPO_PUBLIC_API_BASE_URL is required')
      .url('EXPO_PUBLIC_API_BASE_URL must be a valid URL')
      .transform((value) => value.replace(/\/+$/, '')),
    appEnvironment: appEnvironmentSchema,
  })
  /*
   * ออกนอกวงแลนเมื่อไร ต้องเป็น https เท่านั้น — ล้มตั้งแต่ตอนอ่านค่า
   *
   * แอปนี้ส่งรหัสผ่าน token และเปิดสลิปเงินเดือนกับเลขบัญชีผ่านสายนี้ ถ้าใคร
   * เผลอ build โดยชี้ไปโดเมนสาธารณะแบบ http ทุกอย่างจะวิ่งเป็น plaintext
   * โดยไม่มีอะไรเตือน — iOS มี ATS กันให้ชั้นหนึ่งแต่ Android ไม่ได้กันโดย
   * ปริยาย และ ATS ก็ถูกปิดกลับได้ด้วย config
   *
   * **ยกเว้นที่อยู่ในวงแลน** (10.x / 172.16–31.x / 192.168.x / localhost)
   * เพราะช่วงนี้ routable ออกอินเทอร์เน็ตไม่ได้อยู่แล้ว ใช้ตอนติดตั้งใช้งาน
   * ภายในองค์กรที่ backend ยังไม่มีโดเมนกับใบรับรอง — แลกมาด้วยความเสี่ยงว่า
   * คนที่อยู่บน Wi-Fi เดียวกันดักอ่านได้ ซึ่งเป็นการตัดสินใจที่ตั้งใจ
   * ไม่ใช่ช่องที่หลุด พอมีโดเมนจริงแล้วให้เปลี่ยนเป็น https ทันที
   *
   * เลือกล้มตอนอ่าน env ไม่ใช่ตอนยิงคำขอ เพราะอยากให้รู้ตั้งแต่เปิดแอปครั้งแรก
   * ไม่ใช่ตอนผู้ใช้กดปุ่มแล้วเจอ error งง ๆ กลางทาง
   */
  .refine(
    (value) => {
      const url = value.apiBaseUrl.toLowerCase();

      if (url.startsWith('https://')) return true;
      if (value.appEnvironment === 'development') return true;

      try {
        return isPrivateHost(new URL(value.apiBaseUrl).hostname);
      } catch {
        return false;
      }
    },
    {
      message:
        'EXPO_PUBLIC_API_BASE_URL ต้องเป็น https ยกเว้นชี้ไปที่อยู่ในวงแลน',
      path: ['apiBaseUrl'],
    },
  );

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type EnvironmentConfig = z.infer<typeof environmentSchema>;

export type EnvironmentResult =
  | { config: EnvironmentConfig; success: true }
  | { issues: string[]; success: false };

let cachedResult: EnvironmentResult | null = null;

export function getEnvironmentResult(): EnvironmentResult {
  if (cachedResult) {
    return cachedResult;
  }

  const result = environmentSchema.safeParse({
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
  });

  if (!result.success) {
    cachedResult = {
      success: false,
      issues: result.error.issues.map((issue) => issue.message),
    };

    return cachedResult;
  }

  cachedResult = {
    config: {
      ...result.data,
      apiBaseUrl: resolveDevApiBaseUrl({
        apiBaseUrl: result.data.apiBaseUrl,
        /* Metro บอก IP วงแลนของเครื่อง dev มาให้ทาง hostUri */
        hostUri:
          Constants.expoConfig?.hostUri ??
          (Constants.expoGoConfig as { debuggerHost?: string } | undefined)
            ?.debuggerHost ??
          null,
        isAndroidEmulator: Platform.OS === 'android' && Device.isDevice === false,
        isDevelopment: result.data.appEnvironment === 'development',
      }),
    },
    success: true,
  };

  return cachedResult;
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const result = getEnvironmentResult();

  if (!result.success) {
    throw new Error(`Invalid application environment: ${result.issues.join('; ')}`);
  }

  return result.config;
}
