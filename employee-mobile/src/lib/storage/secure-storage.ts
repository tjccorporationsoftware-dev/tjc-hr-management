import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createRequestId } from '@/lib/api/request-id';

import { storageKeys } from './storage-keys';

/**
 * ที่เก็บความลับของแอป — refresh token, PIN, installation id
 *
 * มือถือใช้ SecureStore (Keychain ของ iOS / Keystore ของ Android) ซึ่งผูกกับ
 * กุญแจของเครื่อง อ่านออกไม่ได้ถ้าไม่มีรหัสปลดล็อกเครื่อง
 *
 * ## ฝั่งเว็บ
 *
 * เว็บไม่มีที่เก็บที่เทียบเท่าได้เลย — `localStorage` อ่านได้ด้วย JavaScript
 * ทุกตัวในหน้า ถ้ามีช่องโหว่ XSS หลุดมาแม้จุดเดียว refresh token จะถูกขโมย
 * ไปใช้ต่อได้ทันที (บทที่ 15.2) ค่าเริ่มต้นของเว็บจึงเก็บไว้ในหน่วยความจำ
 * ซึ่งหายทุกครั้งที่รีเฟรช
 *
 * **ยกเว้นโหมด dev** ที่ยอมใช้ localStorage เพราะเว็บเป็นแค่จอพรีวิวตอนพัฒนา
 * และการต้องล็อกอินใหม่ทุกครั้งที่กดรีเฟรชทำให้ทดสอบวงจร "ล็อกอินครั้งเดียว
 * แล้วใช้ PIN" ไม่ได้เลย — ของที่ทดสอบไม่ได้คือของที่พังโดยไม่มีใครรู้
 * build จริงและมือถือไม่ได้รับผลจากทางนี้
 */

type WebStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const webMemoryStorage = new Map<string, string>();

function webPersistentStore(): WebStore | null {
  if (!__DEV__) {
    return null;
  }

  try {
    return (globalThis as { localStorage?: WebStore }).localStorage ?? null;
  } catch {
    /* เบราว์เซอร์บางตัวโยน error ตอนแตะ localStorage ในโหมดส่วนตัว */
    return null;
  }
}

export async function getSecureValue(key: string) {
  if (Platform.OS === 'web') {
    const store = webPersistentStore();

    return store ? store.getItem(key) : (webMemoryStorage.get(key) ?? null);
  }

  return SecureStore.getItemAsync(key);
}

export async function setSecureValue(key: string, value: string) {
  if (Platform.OS === 'web') {
    const store = webPersistentStore();

    if (store) {
      store.setItem(key, value);
    } else {
      webMemoryStorage.set(key, value);
    }

    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureValue(key: string) {
  if (Platform.OS === 'web') {
    const store = webPersistentStore();

    if (store) {
      store.removeItem(key);
    }

    /* ล้างทั้งสองที่เสมอ — โหมด dev อาจมีค่าค้างจากรอบก่อนหน้าอยู่ในหน่วยความจำ */
    webMemoryStorage.delete(key);

    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function getOrCreateInstallationId() {
  const existingId = await getSecureValue(storageKeys.installationId);

  if (existingId) {
    return existingId;
  }

  const installationId = createRequestId();
  await setSecureValue(storageKeys.installationId, installationId);

  return installationId;
}

export async function clearSessionSecrets() {
  await deleteSecureValue(storageKeys.refreshToken);
}
