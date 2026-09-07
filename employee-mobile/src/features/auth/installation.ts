import { getAppConfig } from '@/config/app-config';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

export interface InstallationPayload {
  appBuild?: number;
  appVersion: string;
  deviceModel?: string;
  deviceName?: string;
  installationId: string;
  locale: string;
  osVersion: string;
  platform: 'android' | 'ios';
  timezone: string;
}

/**
 * ข้อมูลเครื่องที่ส่งไปพร้อม login/2FA/ลงทะเบียนเครื่อง
 *
 * installationId มาจาก SecureStore และคงที่ตลอดอายุการติดตั้ง
 * เป็นตัวที่ backend ใช้ผูก session กับเครื่อง (device binding)
 */
export async function buildInstallationPayload(): Promise<InstallationPayload> {
  const config = getAppConfig();

  return {
    installationId: await getOrCreateInstallationId(),
    platform: config.platform,
    appVersion: config.appVersion,
    locale: config.locale,
    osVersion: config.osVersion,
    timezone: config.timezone,
    ...(config.appBuild === null ? {} : { appBuild: config.appBuild }),
    ...(config.deviceName ? { deviceName: config.deviceName } : {}),
    ...(config.deviceModel ? { deviceModel: config.deviceModel } : {}),
  };
}
