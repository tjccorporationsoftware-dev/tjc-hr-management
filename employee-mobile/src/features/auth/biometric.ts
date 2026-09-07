import * as LocalAuthentication from 'expo-local-authentication';

import {
  deleteSecureValue,
  getSecureValue,
  setSecureValue,
} from '@/lib/storage/secure-storage';
import { storageKeys } from '@/lib/storage/storage-keys';

/**
 * ปลดล็อกด้วยลายนิ้วมือหรือใบหน้า
 *
 * ## ขอบเขตความปลอดภัย (อ่านก่อนแก้)
 *
 * ไบโอเมตริกที่นี่เป็น **ทางลัดของ PIN ไม่ใช่ตัวแทน** — ผู้ใช้ต้องตั้ง PIN
 * ก่อนเสมอ และ PIN ยังใช้ได้ตลอด เหตุผล:
 *
 *   1. เซนเซอร์อ่านไม่ติดเกิดขึ้นจริงทุกวัน (มือเปียก ใส่แมสก์ แดดจ้า)
 *      ถ้าไม่มีทางเข้าสำรอง ผู้ใช้จะถูกล็อกออกจากแอปตัวเองกลางที่ทำงาน
 *   2. เครื่องที่มีหลายลายนิ้วมือลงทะเบียนไว้ = คนอื่นในบ้านก็เปิดได้
 *      PIN จึงยังเป็นชั้นที่ผูกกับ "ตัวคน" มากกว่า
 *
 * **ไม่เก็บอะไรที่เป็นความลับไว้หลังไบโอเมตริก** — สวิตช์นี้บอกแค่ว่า
 * "ผู้ใช้ยอมให้ข้ามหน้าใส่ PIN ได้" ตัวที่ยืนยันตัวตนกับ backend ยังเป็น
 * refresh token ใน SecureStore เหมือนเดิม การผ่านไบโอเมตริกจึงเทียบเท่ากับ
 * การใส่ PIN ถูก ไม่ได้ให้สิทธิ์อะไรเพิ่ม
 *
 * ถ้าผู้ใช้ลบลายนิ้วมือทั้งหมดออกจากเครื่องภายหลัง `isBiometricAvailable()`
 * จะเป็น false เอง แล้วแอปกลับไปถาม PIN โดยไม่ต้องทำอะไรเพิ่ม
 */

export type BiometricKind = 'FACE' | 'FINGERPRINT' | 'IRIS' | 'UNKNOWN';

export interface BiometricCapability {
  available: boolean;
  kind: BiometricKind;
  /** ชื่อที่เอาไปแสดงบนปุ่ม เช่น "ใช้ลายนิ้วมือ" */
  label: string;
}

const LABEL: Record<BiometricKind, string> = {
  FACE: 'ใช้ใบหน้า',
  FINGERPRINT: 'ใช้ลายนิ้วมือ',
  IRIS: 'ใช้ม่านตา',
  UNKNOWN: 'ใช้ไบโอเมตริก',
};

const UNAVAILABLE: BiometricCapability = {
  available: false,
  kind: 'UNKNOWN',
  label: LABEL.UNKNOWN,
};

/**
 * ตัดสินความพร้อมจากค่าที่อ่านมาได้ — ตรรกะล้วน แยกจาก native เพื่อให้ทดสอบได้
 *
 * ต้องผ่านทั้งสามด่าน: มีฮาร์ดแวร์ / ลงทะเบียนไว้แล้ว / รู้ว่าเป็นชนิดไหน
 * เช็คไม่ครบจะเจอเคสที่ปุ่มโผล่บนเครื่องที่ยังไม่ได้ตั้งลายนิ้วมือ กดแล้ว
 * เด้ง error ของ OS ซึ่งผู้ใช้แยกไม่ออกจากแอปพัง
 */
export function resolveBiometricCapability(input: {
  hasHardware: boolean;
  isEnrolled: boolean;
  types: number[];
}): BiometricCapability {
  if (!input.hasHardware || !input.isEnrolled) return UNAVAILABLE;

  const kind: BiometricKind = input.types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  )
    ? 'FACE'
    : input.types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ? 'FINGERPRINT'
      : input.types.includes(LocalAuthentication.AuthenticationType.IRIS)
        ? 'IRIS'
        : 'UNKNOWN';

  return { available: true, kind, label: LABEL[kind] };
}

/** อ่านสถานะจริงจากเครื่อง แล้วส่งให้ตัวตัดสินด้านบน */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    return resolveBiometricCapability({ hasHardware, isEnrolled, types });
  } catch {
    /* เครื่องบางรุ่นโยน error จาก native module — ถือว่าใช้ไม่ได้ ปลอดภัยกว่า */
    return UNAVAILABLE;
  }
}

/** ผู้ใช้เปิดสวิตช์ไว้หรือยัง (คนละเรื่องกับเครื่องรองรับหรือไม่) */
export async function isBiometricEnabled(userId: string): Promise<boolean> {
  const owner = await getSecureValue(storageKeys.biometricUserId);

  /* ผูกกับผู้ใช้คนเดียว เครื่องที่เปลี่ยนคนใช้ต้องเปิดสวิตช์ใหม่ */
  return owner === userId;
}

export async function setBiometricEnabled(userId: string, enabled: boolean) {
  if (enabled) {
    await setSecureValue(storageKeys.biometricUserId, userId);
    return;
  }

  await deleteSecureValue(storageKeys.biometricUserId);
}

export type BiometricPromptResult =
  | { status: 'ok' }
  /** ผู้ใช้กดยกเลิกหรือเลือกใส่ PIN แทน — ไม่ใช่ความผิดพลาด ไม่ต้องขึ้น error */
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/**
 * แปลผลจาก OS เป็นผลที่จอเข้าใจ — ตรรกะล้วน แยกไว้เพื่อให้ทดสอบได้
 *
 * การแยก "ยกเลิก" ออกจาก "ล้มเหลว" สำคัญกว่าที่ดูเผิน ๆ: ผู้ใช้ที่กดยกเลิก
 * เองแล้วเจอข้อความแดงว่ายืนยันตัวตนไม่สำเร็จ จะคิดว่าเซนเซอร์เสีย
 */
export function interpretBiometricResult(result: {
  error?: string;
  success: boolean;
}): BiometricPromptResult {
  if (result.success) return { status: 'ok' };

  const error = result.error ?? '';

  if (
    error === 'user_cancel' ||
    error === 'app_cancel' ||
    error === 'system_cancel' ||
    error === 'user_fallback'
  ) {
    return { status: 'cancelled' };
  }

  return {
    message: 'ยืนยันตัวตนไม่สำเร็จ กรุณาใส่ PIN',
    status: 'failed',
  };
}

/**
 * ขอให้ผู้ใช้ยืนยันตัวตนด้วยไบโอเมตริก
 *
 * `disableDeviceFallback: true` โดยตั้งใจ — ไม่ให้ตกไปใช้รหัสปลดล็อกเครื่อง
 * เพราะรหัสเครื่องคือสิ่งที่คนหยิบเครื่องที่ปลดล็อกอยู่แล้วมี ทางสำรองของเรา
 * ต้องเป็น PIN ของแอปเท่านั้น ซึ่งเป็นคนละความลับกัน
 */
export async function promptBiometric(
  reason = 'ยืนยันตัวตนเพื่อเข้าใช้งานแอป',
): Promise<BiometricPromptResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      cancelLabel: 'ใช้ PIN แทน',
      disableDeviceFallback: true,
      promptMessage: reason,
    });

    return interpretBiometricResult(
      result as { error?: string; success: boolean },
    );
  } catch {
    return {
      message: 'อุปกรณ์นี้ยืนยันตัวตนด้วยไบโอเมตริกไม่ได้ กรุณาใส่ PIN',
      status: 'failed',
    };
  }
}
