import * as Crypto from 'expo-crypto';

import {
  deleteSecureValue,
  getSecureValue,
  setSecureValue,
} from '@/lib/storage/secure-storage';
import { storageKeys } from '@/lib/storage/storage-keys';

/**
 * รหัส PIN สำหรับเข้าแอป
 *
 * ## ขอบเขตความปลอดภัย (อ่านก่อนแก้)
 *
 * PIN **ไม่ใช่** ตัวยืนยันตัวตนกับ backend — ตัวจริงคือ refresh token ที่อยู่ใน
 * SecureStore (Keychain / Keystore ของเครื่อง) PIN ทำหน้าที่เป็น "กุญแจหน้าบ้าน"
 * กันคนที่หยิบเครื่องที่ปลดล็อกอยู่แล้วไปเปิดแอปดูข้อมูลเงินเดือนของเจ้าของ
 *
 * ดังนั้นสิ่งที่กันคนร้ายจริง ๆ มีสามชั้น เรียงตามน้ำหนัก:
 *   1. **SecureStore** — ทั้ง hash และ refresh token อยู่ในที่เก็บของ OS
 *      คนที่ไม่มีรหัสปลดล็อกเครื่องอ่านไม่ได้เลย
 *   2. **เพดานจำนวนครั้ง** — ผิดครบ 5 ครั้งล้าง session ทิ้งทันที ต้องล็อกอิน
 *      ด้วยอีเมลและรหัสผ่านใหม่ ทำให้เดา PIN 6 หลักด้วยการสุ่มไม่คุ้ม
 *   3. **hash + salt** — กันการอ่านค่าตรง ๆ ถ้าไฟล์หลุดออกไปจากเครื่อง
 *
 * ที่ **ไม่ได้** ทำและตั้งใจไม่ทำ: ยืดเวลา hash (PBKDF2 หลายหมื่นรอบ) เพราะ
 * ช่องว่างจริงคือ PIN มีแค่ล้านค่า การยืดเวลาไม่ได้ช่วยถ้าไม่มีเพดานจำนวนครั้ง
 * และเมื่อมีเพดานแล้วการยืดเวลาก็ไม่ได้เพิ่มอะไรนอกจากเวลารอตอนปลดล็อก
 */

export const PIN_LENGTH = 6;

/** ผิดได้กี่ครั้งก่อนถูกไล่ออกจากระบบ */
export const MAX_PIN_ATTEMPTS = 5;

export type PinFormatError = 'LENGTH' | 'DIGITS' | 'REPEATED' | 'SEQUENTIAL';

export const PIN_FORMAT_MESSAGE: Record<PinFormatError, string> = {
  DIGITS: 'รหัส PIN ต้องเป็นตัวเลขเท่านั้น',
  LENGTH: `รหัส PIN ต้องมี ${PIN_LENGTH} หลัก`,
  REPEATED: 'ห้ามใช้เลขซ้ำกันทั้งหมด เช่น 111111',
  SEQUENTIAL: 'ห้ามใช้เลขเรียงติดกัน เช่น 123456',
};

/**
 * ตรวจรูปแบบ PIN — ตรรกะล้วน ไม่แตะที่เก็บข้อมูล จึงทดสอบได้ตรง ๆ
 *
 * ปฏิเสธเลขซ้ำล้วนกับเลขเรียง เพราะสองแบบนี้กินสัดส่วนใหญ่มากของ PIN
 * ที่คนตั้งจริง คนที่เดาสุ่มจึงลองชุดพวกนี้ก่อนเสมอ และเรามีให้เดาแค่ 5 ครั้ง
 */
export function validatePinFormat(pin: string): PinFormatError | null {
  if (pin.length !== PIN_LENGTH) {
    return 'LENGTH';
  }

  if (!/^\d+$/.test(pin)) {
    return 'DIGITS';
  }

  const digits = [...pin].map(Number);

  if (digits.every((digit) => digit === digits[0])) {
    return 'REPEATED';
  }

  const steps = digits.slice(1).map((digit, index) => digit - digits[index]!);

  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) {
    return 'SEQUENTIAL';
  }

  return null;
}

async function hashPin(salt: string, userId: string, pin: string) {
  /* ผูก userId เข้าไปในค่าที่ hash ด้วย — PIN เดียวกันของคนละคนจะได้ค่าต่างกัน */
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${userId}:${pin}`,
  );
}

async function readAttempts(): Promise<number> {
  const raw = await getSecureValue(storageKeys.pinAttempts);
  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** เครื่องนี้ตั้ง PIN ไว้ให้ผู้ใช้คนนี้แล้วหรือยัง */
export async function hasPinFor(userId: string): Promise<boolean> {
  const [hash, owner] = await Promise.all([
    getSecureValue(storageKeys.pinHash),
    getSecureValue(storageKeys.pinUserId),
  ]);

  return Boolean(hash) && owner === userId;
}

export async function setPin(userId: string, pin: string): Promise<void> {
  const invalid = validatePinFormat(pin);

  if (invalid) {
    throw new Error(PIN_FORMAT_MESSAGE[invalid]);
  }

  const salt = Crypto.randomUUID();

  await setSecureValue(storageKeys.pinSalt, salt);
  await setSecureValue(storageKeys.pinHash, await hashPin(salt, userId, pin));
  await setSecureValue(storageKeys.pinUserId, userId);
  await setSecureValue(storageKeys.pinAttempts, '0');
}

export type PinVerifyResult =
  | { status: 'ok' }
  | { status: 'wrong'; remaining: number }
  /** ผิดครบเพดานแล้ว ผู้เรียกต้องล้าง session แล้วส่งไปหน้าล็อกอิน */
  | { status: 'exhausted' }
  | { status: 'no-pin' };

export async function verifyPin(
  userId: string,
  pin: string,
): Promise<PinVerifyResult> {
  const [hash, salt, owner] = await Promise.all([
    getSecureValue(storageKeys.pinHash),
    getSecureValue(storageKeys.pinSalt),
    getSecureValue(storageKeys.pinUserId),
  ]);

  if (!hash || !salt || owner !== userId) {
    return { status: 'no-pin' };
  }

  if ((await hashPin(salt, userId, pin)) === hash) {
    await setSecureValue(storageKeys.pinAttempts, '0');

    return { status: 'ok' };
  }

  const attempts = (await readAttempts()) + 1;
  await setSecureValue(storageKeys.pinAttempts, String(attempts));

  if (attempts >= MAX_PIN_ATTEMPTS) {
    return { status: 'exhausted' };
  }

  return { remaining: MAX_PIN_ATTEMPTS - attempts, status: 'wrong' };
}

/** ล้างตัวนับที่ใส่ผิด — เรียกตอนล็อกอินสำเร็จ ไม่ต้องแตะ PIN ที่ตั้งไว้ */
export async function resetPinAttempts(): Promise<void> {
  await setSecureValue(storageKeys.pinAttempts, '0');
}

/**
 * ล้าง PIN ทิ้ง — เรียกเฉพาะตอนที่ผู้ใช้ "เข้าไม่ได้ด้วย PIN เดิมแล้ว"
 *
 * มีสองเคสเท่านั้น: กด "ลืมรหัส PIN" กับใส่ผิดครบเพดาน
 *
 * **ห้ามเรียกตอน session จบทั่วไป** — เคยทำแบบนั้นแล้วผู้ใช้ที่ออกจากระบบ
 * (หรือโดนเด้งเพราะ token หมดอายุ) ต้องมาตั้ง PIN ใหม่ทุกครั้งที่ล็อกอิน
 * ทั้งที่เพิ่งตั้งไปเมื่อวาน
 *
 * ส่วนเครื่องที่ใช้ร่วมกันไม่ต้องพึ่งการล้างตรงนี้ เพราะ PIN ผูกกับ userId อยู่แล้ว
 * — `hasPinFor()` กับ `verifyPin()` เช็คเจ้าของก่อนเสมอ คนใหม่ที่ล็อกอินจึงถูก
 * พาไปตั้ง PIN ของตัวเองโดยอัตโนมัติ แล้ว `setPin()` ก็ทับของเดิมทิ้งอยู่ดี
 */
export async function clearPin(): Promise<void> {
  await Promise.all([
    deleteSecureValue(storageKeys.pinHash),
    deleteSecureValue(storageKeys.pinSalt),
    deleteSecureValue(storageKeys.pinUserId),
    deleteSecureValue(storageKeys.pinAttempts),
  ]);
}
